-- 00119_diagnose_orders_commission.sql
-- 用途：诊断 admin-web 订单列表中“分佣/平台收益”显示问题
-- 作用域：检查截图中 1870 最近订单的佣金发放状态、1856 的佣金余额
-- 执行方式：Supabase Dashboard → SQL Editor 直接运行

-- ── 1. 查询截图中 1870(张林) 的订单分佣状态 ───────────────────────────
WITH target_orders AS (
  SELECT
    o.id,
    o.order_no,
    o.total_amount,
    o.tb_used,
    o.status,
    o.commission_distributed,
    o.referrer_id,
    o.created_at
  FROM public.orders o
  WHERE o.user_id = 'd6b38349-dded-4879-9eac-3165a646436a'  -- 1870
  ORDER BY o.created_at DESC
  LIMIT 20
)
SELECT
  to_.order_no,
  to_.total_amount,
  to_.tb_used,
  (to_.total_amount - to_.tb_used) AS platform_cash_receipt,
  to_.status,
  to_.commission_distributed,
  COALESCE(SUM(c.commission_amount), 0) AS commission_total,
  COUNT(c.id) AS commission_rows,
  COALESCE((array_agg(c.beneficiary_id) FILTER (WHERE c.level = 1))[1], to_.referrer_id) AS l1_beneficiary,
  string_agg(DISTINCT c.status, ',') AS commission_statuses
FROM target_orders to_
LEFT JOIN public.commissions c ON c.order_id = to_.id AND c.status != 'refunded'
GROUP BY to_.id, to_.order_no, to_.total_amount, to_.tb_used, to_.status, to_.commission_distributed, to_.referrer_id, to_.created_at
ORDER BY to_.created_at DESC;

-- ── 2. 查询 1856 上级的佣金余额与最近流水 ───────────────────────────────
SELECT
  p.id,
  p.nickname,
  p.phone,
  p.commission_balance,
  p.tb_balance,
  p.referrer_id,
  (SELECT COUNT(*) FROM public.commissions c WHERE c.beneficiary_id = p.id AND c.status != 'refunded') AS commission_count,
  (SELECT COALESCE(SUM(c.commission_amount), 0) FROM public.commissions c WHERE c.beneficiary_id = p.id AND c.status != 'refunded') AS commission_earned_total
FROM public.profiles p
WHERE p.id = '03165ead-8fef-46c4-8f57-bc5a905ac716';  -- 1856

-- ── 3. 列出 1856 最近 10 条佣金流水（含订单号、比例、金额）──────────────
SELECT
  c.created_at,
  c.order_no,
  c.level,
  c.rank_at_time,
  c.ratio,
  c.pool_amount,
  c.commission_amount,
  c.status,
  c.beneficiary_id,
  c.payer_id
FROM public.commissions c
WHERE c.beneficiary_id = '03165ead-8fef-46c4-8f57-bc5a905ac716'
ORDER BY c.created_at DESC
LIMIT 10;

-- ── 4. 全平台分佣汇总（快速判断分佣通道是否整体生效）──────────────────
SELECT
  COUNT(*) AS total_commission_rows,
  COALESCE(SUM(commission_amount), 0) AS total_commission_amount,
  COUNT(DISTINCT beneficiary_id) AS beneficiary_count
FROM public.commissions
WHERE status != 'refunded';

-- ── 5. 未分佣订单扫描（commission_distributed=false 但已有佣金额）──────
SELECT
  o.id,
  o.order_no,
  o.total_amount,
  o.tb_used,
  o.commission_distributed,
  o.status,
  o.created_at
FROM public.orders o
WHERE o.commission_distributed = false
  AND o.status IN ('completed', 'pending_review', 'pending_ship', 'pending_receive', 'pending_pickup')
ORDER BY o.created_at DESC
LIMIT 20;
