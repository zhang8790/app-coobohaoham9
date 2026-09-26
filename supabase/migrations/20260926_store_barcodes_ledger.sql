-- ============================================================
-- 20260926 店内码台账（store_barcodes）
-- ============================================================
-- 背景（真实故障）：
--   杭州礼品店 barcode_counter 已涨到 7，但全库 products.barcode 无一非空。
--   即「码分配出去了、商品上一个都没落」。根因链：
--     ① 生成走 RPC fn_alloc_store_barcode（SECURITY DEFINER，必然成功，counter 自增）
--     ② 回写 products.barcode 走客户端 REST UPDATE —— 被 RLS 静默拒绝
--        （PostgREST 对 RLS 拒绝的 UPDATE 不报错、只返回 0 行，前端 upErr 为 null）
--     ③ 前端以为成功 → UI 显示条码 → 点「打印标签」
--     ④ 打印 EF 读 products.barcode 仍是 NULL → 报「该商品无条码，请先生成店内码」
--   表现就是用户说的「申请内部条形码不能打印」。
--   另：分配出的裸码只存在于前端 state，刷新即永久丢失，无法补打。
-- 本迁移做两件事：
--   1) 建台账表 store_barcodes：每次出码都留痕（含裸码），可查、可补打
--   2) 让出码与落库自动对齐：RPC 插台账 + 商品写码后自动绑定（status: pending→bound）
-- 用法：Supabase Dashboard → SQL Editor 整段粘贴 → Run（需 service_role / 有权限 key）
-- ============================================================

-- 1) 台账表
CREATE TABLE IF NOT EXISTS public.store_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  barcode text NOT NULL,
  barcode_type text NOT NULL DEFAULT 'EAN13',
  product_id uuid,
  -- pending = 已出码未绑商品（裸码，可打空白标签）；bound = 已绑定商品
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_barcodes_code
  ON public.store_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_store_barcodes_store
  ON public.store_barcodes(store_id, created_at DESC);

-- 2) RLS：门店 owner 与平台管理员可读写（与 products 口径一致）
ALTER TABLE public.store_barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sb_owner_all ON public.store_barcodes;
CREATE POLICY sb_owner_all ON public.store_barcodes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM stores s WHERE s.id = store_barcodes.store_id AND s.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM stores s WHERE s.id = store_barcodes.store_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS sb_admin_all ON public.store_barcodes;
CREATE POLICY sb_admin_all ON public.store_barcodes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- 3) 出码即入台账：改写 fn_alloc_store_barcode（SECURITY DEFINER，绕过 RLS 写入）
--    原逻辑（2 + 门店前缀6 + 序号5 + 校验位1）完全保留，只在 RETURN NEXT 前多插一行。
CREATE OR REPLACE FUNCTION fn_alloc_store_barcode(p_store_id uuid)
RETURNS TABLE(barcode text, barcode_type text) AS $$
DECLARE
  v_prefix text;
  v_seq int;
  v_body text;
  v_check text;
BEGIN
  UPDATE stores SET barcode_counter = barcode_counter + 1
   WHERE id = p_store_id
   RETURNING barcode_prefix, barcode_counter INTO v_prefix, v_seq;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION '门店 % 未配置条码前缀，无法生成店内码', p_store_id;
  END IF;
  IF v_seq > 99999 THEN
    RAISE EXCEPTION '门店 % 店内码序号已用尽（>99999）', p_store_id;
  END IF;

  v_body := '2' || v_prefix || lpad(v_seq::text, 5, '0');
  v_check := fn_ean13_check(v_body);
  barcode := v_body || v_check;
  barcode_type := 'EAN13';

  -- 台账留痕：裸码先记 pending，商品落库后由触发器改为 bound
  BEGIN
    INSERT INTO store_barcodes(store_id, barcode, barcode_type, product_id, status)
    VALUES (p_store_id, barcode, barcode_type, NULL, 'pending')
    ON CONFLICT (barcode) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- 台账写入绝不能阻断出码主流程
    NULL;
  END;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) 商品落库即绑定：products.barcode 写入/变更时，台账自动置 bound
CREATE OR REPLACE FUNCTION fn_sync_product_barcode()
RETURNS trigger AS $$
BEGIN
  IF NEW.barcode IS NOT NULL AND NEW.barcode <> ''
     AND (TG_OP = 'INSERT' OR OLD.barcode IS DISTINCT FROM NEW.barcode) THEN
    BEGIN
      INSERT INTO store_barcodes(store_id, barcode, barcode_type, product_id, status)
      VALUES (NEW.store_id, NEW.barcode, COALESCE(NEW.barcode_type, 'EAN13'), NEW.id, 'bound')
      ON CONFLICT (barcode) DO UPDATE
        SET product_id = EXCLUDED.product_id, status = 'bound';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_product_barcode_sync ON public.products;
CREATE TRIGGER trg_product_barcode_sync
  AFTER INSERT OR UPDATE OF barcode ON public.products
  FOR EACH ROW EXECUTE FUNCTION fn_sync_product_barcode();

-- 5) 把「历史上已分配但没进台账」的存量补进台账（用 counter 反推，best-effort）
--    注意：只能补出 pending 状态的裸码记录，无法还原它们原本要绑哪个商品。
DO $$
DECLARE
  r record;
  v_seq int;
  v_code text;
BEGIN
  FOR r IN SELECT id, barcode_prefix, barcode_counter FROM stores
           WHERE barcode_prefix IS NOT NULL AND barcode_counter > 0 LOOP
    FOR v_seq IN 1..r.barcode_counter LOOP
      v_code := '2' || r.barcode_prefix || lpad(v_seq::text, 5, '0')
                || fn_ean13_check('2' || r.barcode_prefix || lpad(v_seq::text, 5, '0'));
      BEGIN
        INSERT INTO store_barcodes(store_id, barcode, barcode_type, status)
        VALUES (r.id, v_code, 'EAN13', 'pending')
        ON CONFLICT (barcode) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END LOOP;
END $$;

-- 6) 验证：每店台账条数应与 counter 对齐（存量补录后应相等）
SELECT s.name, s.barcode_counter,
       (SELECT count(*) FROM store_barcodes b WHERE b.store_id = s.id) AS ledger_count
FROM stores s
ORDER BY s.barcode_counter DESC;
