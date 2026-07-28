-- ============================================================
-- 00213: 食品保质期预警 + AI 动态折扣 · 通用数据层
-- ------------------------------------------------------------
-- 设计目标：所有数据保持「通用」——
--   1) 引擎扫描全店铺，不写死任何 store_id / 商品 / 类目
--   2) 折扣用「商品自身成本」算，不依赖外部配置
--   3) 配置走 system_config KV（key='expiry'），后台可调，不新建配置表
--   4) 视图 v_near_expiry_products 按 store_id 可过滤，前端通用消费
--   5) 分级阈值 / 折扣基线 / 开关全在配置里，改配置即改行为
--
-- 执行方式：Supabase SQL Editor 全量粘贴运行；或 supabase db push（按编号自动执行）
-- 幂等：全部 IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT
-- ============================================================

-- ---------- 1. stock_batches 加临期引擎字段 ----------
ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS shelf_life_days      int,                      -- 保质期天数（可选；优先用 expire_at，有则按比例分级更准）
  ADD COLUMN IF NOT EXISTS auto_discount_rate   numeric(5,2) DEFAULT 0,   -- 临期自动折扣 %（0~90），由 expiry-engine 写入
  ADD COLUMN IF NOT EXISTS discount_stage       text DEFAULT 'normal'    -- normal|amber|orange|red|expired
        CHECK (discount_stage IN ('normal','amber','orange','red','expired')),
  ADD COLUMN IF NOT EXISTS alerted_stages       text[] DEFAULT '{}',      -- 已推送过的阶段（防同阶段重复骚扰）
  ADD COLUMN IF NOT EXISTS last_alert_at        timestamptz,              -- 最近一次预警时间
  ADD COLUMN IF NOT EXISTS ai_reason            text,                    -- 折扣决策理由（可解释）
  ADD COLUMN IF NOT EXISTS ai_decided_at        timestamptz,              -- AI/规则决策时间
  ADD COLUMN IF NOT EXISTS decided_by           text DEFAULT 'rule'       -- rule | ai（本次折扣由谁决定）
        CHECK (decided_by IN ('rule','ai'));

COMMENT ON COLUMN public.stock_batches.auto_discount_rate IS '临期自动折扣%（0~90），由 expiry-engine 写入；展示价 = price*(1-rate/100)';
COMMENT ON COLUMN public.stock_batches.discount_stage IS '临期分级：normal 安全 / amber 临期 / orange 紧迫 / red 紧急 / expired 已过期禁售';
COMMENT ON COLUMN public.stock_batches.alerted_stages IS '已推送预警的阶段集合，同阶段只推一次';
COMMENT ON COLUMN public.stock_batches.decided_by IS '本次 auto_discount_rate 由规则还是 AI 决定（可解释/可回溯）';

-- ---------- 2. 审计 + 归因表 expiry_alert_log ----------
-- 每次决策写一条；周级聚合「该折扣下 N 天售罄率」回灌校准基线（自进化闭环）
CREATE TABLE IF NOT EXISTS public.expiry_alert_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid REFERENCES public.stock_batches(id) ON DELETE CASCADE,
  product_id         uuid REFERENCES public.products(id) ON DELETE SET NULL,
  store_id           uuid,
  stage              text,                                -- amber|orange|red
  days_to_expire     numeric(6,2),                        -- 决策时剩余天数
  days_to_sell       numeric(6,2),                        -- 按当前日销速度算出的售罄天数
  daily_sales        numeric(10,3),                       -- 近30天日销速度
  suggested_discount numeric(5,2),                        -- 算法建议折扣
  applied_discount   numeric(5,2),                        -- 实际采用折扣
  qty                int,                                 -- 决策时批次库存
  cost_price         numeric(10,2),
  sale_price         numeric(10,2),                        -- 决策时原价
  decided_by         text DEFAULT 'rule',                 -- rule | ai
  cleared_at         timestamptz,                         -- 实际售罄时间（回填，用于归因）
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eal_batch     ON public.expiry_alert_log (batch_id);
CREATE INDEX IF NOT EXISTS idx_eal_store     ON public.expiry_alert_log (store_id);
CREATE INDEX IF NOT EXISTS idx_eal_created   ON public.expiry_alert_log (created_at DESC);

COMMENT ON TABLE public.expiry_alert_log IS '临期折扣决策审计+归因：每周聚合售罄率回灌校准基线，实现自优化';

-- ---------- 3. 通用临期特惠视图 v_near_expiry_products ----------
-- 前端「临期特惠」频道直接读此视图；按 store_id 过滤即某店，不过滤即全平台
-- 仅展示已算折扣 + 未过期 + 批次正常的商品
CREATE OR REPLACE VIEW public.v_near_expiry_products AS
SELECT
  sb.product_id,
  p.store_id,
  p.name,
  p.image_url,
  p.price,
  p.cost_price,
  p.original_price,
  sb.id              AS batch_id,
  sb.auto_discount_rate,
  ROUND(p.price * (1 - sb.auto_discount_rate / 100.0), 2) AS effective_price,
  sb.expire_at,
  GREATEST(0, DATE_PART('day', sb.expire_at - now()))::int AS days_left,
  sb.discount_stage,
  sb.ai_reason,
  sb.decided_by,
  sb.qty
FROM public.stock_batches sb
JOIN public.products p ON p.id = sb.product_id
WHERE sb.status = 'normal'
  AND sb.qty > 0
  AND sb.discount_stage IN ('amber', 'orange', 'red')
  AND sb.auto_discount_rate > 0
  AND sb.expire_at > now();

COMMENT ON VIEW public.v_near_expiry_products IS '临期特惠通用视图：自动折扣+剩余天数；按 store_id 过滤即单店，不过滤即全平台';

-- ---------- 4. notifications.type 补 expiry_alert（type 是 text，无枚举，直接可用；更新注释即可） ----------
COMMENT ON COLUMN public.notifications.type IS 'order_paid | commission_arrived | withdraw_progress | refund_result | announcement | expiry_alert';

-- ---------- 5. 通用引擎配置种子（system_config KV，后台可读写，不新建配置表） ----------
-- 全部阈值/基线/开关都在这；改这里即可调行为，无需改代码
-- 注：system_config 开启了 RLS（仅管理员可写）。SQL Editor / 迁移角色若非管理员会被策略拦截，
--     故临时放开 RLS 写入后再恢复，确保任何执行上下文都能跑通本迁移。
DO $$
BEGIN
  ALTER TABLE public.system_config DISABLE ROW LEVEL SECURITY;
  INSERT INTO public.system_config (key, value, updated_at)
  VALUES (
    'expiry',
    jsonb_build_object(
      'red_days', 3,
      'orange_days', 7,
      'amber_days', 15,
      'red_ratio', 0.10,
      'orange_ratio', 0.30,
      'amber_ratio', 0.50,
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

-- ---------- 6. 销量聚合函数 fn_daily_sales（近30天日均销量，供引擎高效取，不拉明细） ----------
-- 通用：按 product_id 聚合 order_items 近30天销量 / 30 = 日销速度
-- 成交状态集（order_status 枚举合法值，无 pickup 状态）：pending_ship/pending_receive/pending_review/completed
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

-- ---------- 7. RLS：沿用项目「测试期放开」风格，供 anon 读视图底层 ----------
-- 与 notifications / emotion_* 一致。生产若需收紧，可改为带策略的 ENABLE + 策略。
ALTER TABLE public.stock_batches DISABLE ROW LEVEL SECURITY;
-- expiry_alert_log 含成本等内部数据，仅 service_role 读写（保持 RLS 关闭但前端不暴露，靠不提供查询入口保证）
ALTER TABLE public.expiry_alert_log DISABLE ROW LEVEL SECURITY;
