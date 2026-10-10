-- ============================================================================
-- 00242  schema drift 批量收口：提现状态词表 / 缺失审计列 / 互斥 CHECK
-- ============================================================================
-- 背景：修「头像保存失败」（00241）时，顺手写了个 schema drift 扫描器
--       （src/scripts/schema_drift_scan.py），把「代码引用的列/值在库里不存在」
--       一次性扫出来，结果扫出 3 类真 bug。本迁移修其中的 DB 侧。
--
-- ── 病 1（活体阻塞）：提现状态词表与列全对不上 ──────────────────────────
--   code 侧一致使用 pending → approved → paid|rejected 四态，并写 remark / updated_at：
--     admin-web/src/api/admin.ts        approveWithdrawal / payWithdrawal /
--                                        rejectWithdrawal / paySettlementWithdrawal /
--                                        rejectSettlementWithdrawal
--     admin-web/src/api/merchant.ts     读 w.updated_at 展示打款时间
--     admin-web/src/pages/Withdrawals.tsx   { key:'paid', label:'已打款' }
--     admin-web/src/pages/merchant/Withdraw.tsx  ['paid','approved'].includes(...)
--     supabase/functions/merchant-payout      w.status === 'paid'
--     src/db/api.ts:3584 / types.ts:663        status:'paid'
--   但线上库：
--     withdrawals_status_check = CHECK (status IN ('pending','processing','completed','rejected'))
--       → 'approved' / 'paid' 一律 23514 约束冲突
--     且 withdrawals 无 remark、无 updated_at 列 → 42703 列不存在
--   实测影响：库里此刻有 4 条 pending 提现，后台点「通过/打款」必定失败 → 佣金提现链路整体不可用。
--   取舍：code 侧 6+ 处实现一致且四态工作流更合理（pending→approved→paid 可防重复打款），
--         故**对齐 DB 到 code**，而不是改 code 去迁就 DB 的 processing/completed。
--
-- ── 病 2：审计列缺失 ────────────────────────────────────────────────
--     profiles.updated_at      ← src/db/api.ts:3580 写（提现扣款时）
--     commissions.cancelled_at / cancel_reason ← src/utils/risk-control.ts 追回佣金留痕
--
-- ── 病 3：products.food_category 两条互斥 CHECK 并存，交集为空集 ───────
--     chk_products_food_category    CHECK (food_category IN ('长辈关怀零食','四季时令零食',
--                                     '药食同源烘焙','低糖轻食零食','温和养护零食',
--                                     '轻盈舒眠零食','温润养护零食'))
--     products_food_category_check  CHECK (food_category IN ('粉面','炖汤','热饮','小菜'))
--   两条都 convalidated=true 且同时生效 → 任何非空值必违反其一
--   → 线上 133 行 food_category 全为 NULL，该字段事实上**永久不可写**。
--   后者（粉面/炖汤/热饮/小菜）是早期「菜品」分类，与「零食」定位不符 → 删后者，保留前者。
--
-- 幂等：本库无 supabase_migrations 记录表，迁移会被手工重放，全部语句可重复执行。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. 通用 updated_at 触发器函数
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_touch_updated_at() IS
  'BEFORE UPDATE 触发器：把 NEW.updated_at 刷成 now()。给需要审计「最后修改时间」的表挂载。';

-- ---------------------------------------------------------------------------
-- 1. withdrawals：补列 + 扩充状态词表
-- ---------------------------------------------------------------------------
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS remark     text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.withdrawals.remark     IS '审核/打款备注（后台填写的打款流水号、线下说明等）';
COMMENT ON COLUMN public.withdrawals.updated_at IS '最后变更时间，由 trg_withdrawals_touch_updated_at 自动维护';

-- 状态词表：保留原有 processing/completed（历史语义），新增 code 侧使用的 approved/paid
ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE public.withdrawals ADD  CONSTRAINT withdrawals_status_check
  CHECK (status = ANY (ARRAY['pending','approved','processing','paid','completed','rejected']));

DROP TRIGGER IF EXISTS trg_withdrawals_touch_updated_at ON public.withdrawals;
CREATE TRIGGER trg_withdrawals_touch_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. profiles：补 updated_at（提现扣款链路 src/db/api.ts:3580 会写）
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.profiles.updated_at IS '最后变更时间，由 trg_profiles_touch_updated_at 自动维护';

DROP TRIGGER IF EXISTS trg_profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. commissions：补追回留痕列
--    注意 status 取 'refunded'（既有合法值，且 finance.ts 用 neq('status','refunded')
--    把退款佣金剔出平台收入）；代码侧 risk-control.ts 原写 'cancelled' 不在词表内，
--    属真 bug，已在本轮同步改为 'refunded'。
-- ---------------------------------------------------------------------------
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS cancel_reason text;

COMMENT ON COLUMN public.commissions.cancelled_at  IS '佣金被追回/取消的时间（订单退款时由 recoverCommission 写入）';
COMMENT ON COLUMN public.commissions.cancel_reason IS '佣金被追回/取消的原因留痕';

-- ---------------------------------------------------------------------------
-- 4. products：删掉与 chk_products_food_category 互斥的历史 CHECK
--    （二者交集为空集，food_category 事实上不可写；保留与当前零食品类对齐的那条）
-- ---------------------------------------------------------------------------
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_food_category_check;

COMMIT;

-- ============================================================================
-- 验收（迁移后应满足）
--   -- 提现状态词表已含 approved / paid
--   select pg_get_constraintdef(oid) from pg_constraint where conname='withdrawals_status_check';
--   -- 三张表新列存在
--   select table_name, column_name from information_schema.columns
--     where table_schema='public' and (
--       (table_name='withdrawals' and column_name in ('remark','updated_at')) or
--       (table_name='profiles'    and column_name = 'updated_at') or
--       (table_name='commissions' and column_name in ('cancelled_at','cancel_reason')));
--   -- 触发器已挂
--   select tgname from pg_trigger where tgname like 'trg_%touch_updated_at';
--   -- 互斥约束已删（应只剩 chk_products_food_category）
--   select conname from pg_constraint
--     where conrelid='public.products'::regclass and pg_get_constraintdef(oid) ilike '%food_category%';
--   -- 端到端：在事务里试写一条提现「打款」，不报错即通过
--   begin; update withdrawals set status='paid', remark='probe' where id=(select id from withdrawals limit 1); rollback;
-- ============================================================================
