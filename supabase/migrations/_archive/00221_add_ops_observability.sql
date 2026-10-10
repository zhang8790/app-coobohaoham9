-- ============================================================
-- 00221: 运营可观测性基础表（对账差异 / 告警 / 错误日志 / 分佣重试计数）
-- ------------------------------------------------------------
-- 目的：补齐商用运营短板——资金对账、故障告警、错误集中收集。
-- 全部为新增对象，幂等安全（IF NOT EXISTS / ADD COLUMN IF NOT EXISTS）。
-- 数据由 EF（pay-reconcile / commission-retry / biz-alert / client-error-log）
-- 以 service_role 写入；前端不直接写表，统一经 client-error-log EF。
-- ============================================================

-- 1) 对账差异表：支付/退款 本地 vs 微信 状态/金额差异留痕
CREATE TABLE IF NOT EXISTS public.reconcile_discrepancies (
  id            bigserial PRIMARY KEY,
  biz_type      text NOT NULL CHECK (biz_type IN ('pay', 'refund')),
  order_id      uuid,
  order_no      text NOT NULL,
  refund_no     text,
  local_status  text,
  wechat_status text,
  local_amount  numeric(12,2),
  wechat_amount numeric(12,2),
  diff_amount   numeric(12,2),
  detail        text,
  resolved      boolean NOT NULL DEFAULT false,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_disc_order_no   ON public.reconcile_discrepancies(order_no);
CREATE INDEX IF NOT EXISTS idx_rec_disc_unresolved ON public.reconcile_discrepancies(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_rec_disc_created    ON public.reconcile_discrepancies(created_at DESC);

-- 2) 告警日志表：业务告警（资损/分佣失败/对账差异）统一留痕 + 推送状态
CREATE TABLE IF NOT EXISTS public.alert_logs (
  id        bigserial PRIMARY KEY,
  level     text NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
  title     text NOT NULL,
  content   text NOT NULL,
  source    text,
  tags      jsonb DEFAULT '{}',
  notified  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_logs_unnotified ON public.alert_logs(notified) WHERE notified = false;
CREATE INDEX IF NOT EXISTS idx_alert_logs_created    ON public.alert_logs(created_at DESC);

-- 3) 错误日志表：前端(小程序/admin) + Edge Function 错误集中收集
CREATE TABLE IF NOT EXISTS public.error_logs (
  id        bigserial PRIMARY KEY,
  source    text NOT NULL CHECK (source IN ('mini_app', 'admin', 'edge_function')),
  level     text NOT NULL DEFAULT 'error',
  message   text NOT NULL,
  stack     text,
  ctx       jsonb DEFAULT '{}',
  user_id   uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON public.error_logs(source);

-- 4) orders 分佣重试计数（配合 commission_error 形成「待补跑」扫描）
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_retry_count int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_orders_comm_retry
  ON public.orders(commission_distributed, commission_error)
  WHERE commission_distributed = false AND commission_error IS NOT NULL;

-- 5) RLS：仅 service_role 读写（运维数据，不对普通用户开放）
ALTER TABLE public.reconcile_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_all_rec   ON public.reconcile_discrepancies;
DROP POLICY IF EXISTS service_all_alert ON public.alert_logs;
DROP POLICY IF EXISTS service_all_err   ON public.error_logs;

CREATE POLICY service_all_rec   ON public.reconcile_discrepancies FOR ALL TO service_role USING (true);
CREATE POLICY service_all_alert ON public.alert_logs              FOR ALL TO service_role USING (true);
CREATE POLICY service_all_err   ON public.error_logs              FOR ALL TO service_role USING (true);

COMMENT ON TABLE public.reconcile_discrepancies IS '支付/退款 本地与微信差异留痕；未 resolved 的行需人工/定时处理';
COMMENT ON TABLE public.alert_logs              IS '业务告警日志（资损/分佣失败/对账差异），配合 ALERT_WEBHOOK_URL 推送企微';
COMMENT ON TABLE public.error_logs              IS '前端与Edge Function 错误集中收集，便于故障排查';
COMMENT ON COLUMN public.orders.commission_retry_count IS '分佣自动补跑次数上限3；commission_distributed=false且commission_error非空=待补跑';
