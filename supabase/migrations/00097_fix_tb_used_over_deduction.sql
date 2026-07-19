-- 修复历史订单「情绪豆抵扣 > 成交额」导致的平台现金实收 / 佣金显示为负
-- 根因：create-order Edge Function 曾用 Math.ceil(totalAmount/GOLD_BEAN_RATE) 计算纯金豆所需豆数，
--       当订单金额非整数（如 ¥17.8）时，会扣 18 豆，但成交额仅 17.8，显示时按 1 豆=1 元折算，抵扣额 > 成交额。
-- 操作：
--   1. 先查询所有异常订单（供核对）
--   2. 把 tb_used 修正为 total_amount（<= 原 tb_used）
--   3. 将多扣的豆退回用户 profiles.tb_balance
--   4. 写修正流水 tongbao_logs(type='admin_grant'，系统退回多扣豆 = 系统发放，属约束白名单)
--   5. 加 CHECK 约束，防止未来再出现 tb_used > total_amount
-- 注意：退款/售后订单请人工复核后再跑；本脚本默认仅修正普通已完成/待评价等正常订单。

-- 步骤 1：核对异常订单
SELECT id, order_no, user_id, total_amount, tb_used, tb_used - total_amount AS excess
FROM public.orders
WHERE tb_used > total_amount
ORDER BY created_at DESC;

-- 步骤 2：生成修正数据（CTE），先检查再执行
-- bad_orders 额外排除「已写过修正流水」的订单：保证脚本可安全重跑（不会重复退豆/重复写流水）
WITH bad_orders AS (
  SELECT o.id, o.user_id, o.total_amount, o.tb_used, (o.tb_used - o.total_amount) AS excess
  FROM public.orders o
  WHERE o.tb_used > o.total_amount
    AND (o.refund_status IS NULL OR o.refund_status = 'none')
    AND NOT EXISTS (
      SELECT 1 FROM public.tongbao_logs tl
      WHERE tl.order_id = o.id
        AND tl.type = 'admin_grant'
        AND tl.remark LIKE '修正情绪豆抵扣超额%'
    )
),
-- 汇总每个用户应退豆数
refund_per_user AS (
  SELECT user_id, SUM(excess) AS total_excess
  FROM bad_orders
  GROUP BY user_id
)
-- 步骤 3：退回多扣的豆到用户余额
UPDATE public.profiles p
SET tb_balance = p.tb_balance + r.total_excess
FROM refund_per_user r
WHERE p.id = r.user_id;

-- 步骤 4：写修正流水（对每个异常订单逐笔）
-- type 使用约束白名单内的 'admin_grant'（系统退回多扣豆 = 系统发放）
-- 幂等防护：若同订单已存在该修正流水则跳过，避免非事务执行时重复写
INSERT INTO public.tongbao_logs (user_id, order_id, type, delta, balance_after, remark, created_at)
SELECT
  o.user_id,
  o.id,
  'admin_grant',
  (o.tb_used - o.total_amount) AS delta,
  p.tb_balance,
  '修正情绪豆抵扣超额：原抵扣 ' || o.tb_used || ' 豆，订单金额 ' || o.total_amount || ' 元',
  NOW()
FROM public.orders o
JOIN public.profiles p ON p.id = o.user_id
WHERE o.tb_used > o.total_amount
  AND (o.refund_status IS NULL OR o.refund_status = 'none')
  AND NOT EXISTS (
    SELECT 1 FROM public.tongbao_logs tl
    WHERE tl.order_id = o.id
      AND tl.type = 'admin_grant'
      AND tl.remark LIKE '修正情绪豆抵扣超额%'
  );

-- 步骤 5：修正订单 tb_used（必须在退豆/流水之后，避免丢失差额）
UPDATE public.orders
SET tb_used = total_amount
WHERE tb_used > total_amount
  AND (refund_status IS NULL OR refund_status = 'none');

-- 步骤 6：加 CHECK 约束，防止未来写入超额的 tb_used
-- 如果已存在同名约束，先删除再重建（幂等）
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS chk_orders_tb_used_not_exceed_total;

ALTER TABLE public.orders
ADD CONSTRAINT chk_orders_tb_used_not_exceed_total
CHECK (tb_used IS NULL OR total_amount IS NULL OR tb_used <= total_amount);

-- 步骤 7：添加计算列 tb_used_capped，供聚合查询直接用（避免拉全表）
-- 如果已存在同名列，先删除再重建（幂等）
ALTER TABLE public.orders
DROP COLUMN IF EXISTS tb_used_capped;

ALTER TABLE public.orders
ADD COLUMN tb_used_capped numeric(12,2) GENERATED ALWAYS AS (
  COALESCE(LEAST(COALESCE(tb_used, 0), COALESCE(total_amount, 0)), 0)
) STORED;

SELECT '✅ 情绪豆抵扣超额修正完成：异常订单已修复、多扣豆已退回、CHECK 约束已添加、tb_used_capped 计算列已创建' AS result;
