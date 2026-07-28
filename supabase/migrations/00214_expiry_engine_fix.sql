-- ============================================================
-- 00214_expiry_engine_fix.sql
-- ------------------------------------------------------------
-- 修复 00213 部署中断遗留：
--   00213 在 SQL Editor 单脚本里 INSERT public.system_config 用了
--   不存在的 description 列，整段报错停止，导致：
--     1) system_config 'expiry' 配置未插入
--     2) fn_daily_sales() 函数未建
--     3) stock_batches / expiry_alert_log 的 RLS 未关
--   而 ALTER stock_batches 加列、CREATE expiry_alert_log / v_near_expiry_products
--   已成功（DDL 默认 auto-commit）。
--
-- 本迁移全用 IF NOT EXISTS / CREATE OR REPLACE 幂等写法，可安全重跑。
-- ============================================================

-- ---------- 1. system_config 种子（修列名：key, value, updated_at） ----------
-- 临时放开 RLS 写入（system_config 仅管理员可写，SQL Editor 角色可能非管理员被拦截）
DO $$
BEGIN
  ALTER TABLE public.system_config DISABLE ROW LEVEL SECURITY;
  INSERT INTO public.system_config (key, value, updated_at)
  VALUES (
    'expiry',
    jsonb_build_object(
      'red_days',    3,
      'orange_days', 7,
      'amber_days',  15,
      'red_ratio',    0.10,
      'orange_ratio', 0.30,
      'amber_ratio',  0.50,
      'base_discount', jsonb_build_object('amber', 10, 'orange', 25, 'red', 40),
      'boost_per_3_days', 10,
      'max_discount', 90,
      'allow_below_cost', false,
      'llm_enabled', true,
      'alert_to_owner', true,
      'alert_to_nearby', false,
      'nearby_radius_km', 3
    ),
    now()
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
END $$;

-- ---------- 2. fn_daily_sales 函数（CREATE OR REPLACE 幂等） ----------
CREATE OR REPLACE FUNCTION public.fn_daily_sales()
-- 兼容 order_items.product_id 实际为 text（legacy schema 未升 uuid），声明用 text 与列类型一致
RETURNS TABLE (product_id text, daily_sales numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT oi.product_id::text,
         (COALESCE(SUM(oi.quantity), 0)::numeric / 30.0) AS daily_sales
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.created_at > now() - interval '30 days'
    AND o.status IN ('pending_ship','pending_receive','pending_review','completed')
  GROUP BY oi.product_id
$$;
COMMENT ON FUNCTION public.fn_daily_sales() IS '近30天日均销量（日销速度），供 expiry-engine 判断能否在过期前卖完';

-- ---------- 3. 关 RLS（已禁用为 noop，重跑安全） ----------
ALTER TABLE public.stock_batches   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expiry_alert_log DISABLE ROW LEVEL SECURITY;

-- ---------- 4. 自检：跑完应当返回 1 行 ----------
DO $$
BEGIN
  PERFORM 1 FROM public.system_config WHERE key = 'expiry';
  IF NOT FOUND THEN
    RAISE EXCEPTION '00214 自检失败：system_config.expiry 仍未插入';
  END IF;
  PERFORM 1 FROM pg_proc WHERE proname = 'fn_daily_sales';
  IF NOT FOUND THEN
    RAISE EXCEPTION '00214 自检失败：fn_daily_sales() 仍未建';
  END IF;
  RAISE NOTICE '✅ 00214 修复完成：expiry 配置已就位 / fn_daily_sales 已建 / RLS 已关';
END $$;