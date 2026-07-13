-- ============================================================
-- 来电有喜 · 订单创建失败「真库 schema 核查」SQL（修正版）
-- 运行位置：Supabase Dashboard → SQL Editor → Run
-- 已用 service_role（不受 RLS 限制）。末尾诊断插入用 BEGIN/ROLLBACK 包裹，不会落库。
-- 目的：坐实「为什么只有纯金豆支付失败」（高度疑似 orders.status 是 enum 且漏了 pending_review/pending_ship）
-- 修正：2026-07-11 去掉 SELECT INTO TEMP，改用子查询，兼容 SQL Editor
-- ============================================================

-- ① orders 表完整结构（看 status 列类型、各列是否 NOT NULL、默认值）
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- ② status 列的底层类型名（若为 enum，udt_name 会是 enum 类型名，如 order_status）
SELECT column_name, udt_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'status';

-- ③ 若 status 是 enum：列出所有允许的枚举值（重点看有没有 pending_review / pending_ship / pending_pay）
SELECT t.typname AS enum_type, e.enumlabel AS allowed_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = (
  SELECT udt_name FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name = 'status' AND udt_name LIKE 'order_status%'
)
ORDER BY e.enumsortorder;

-- ④ 若 status 是 text + CHECK 约束（非 enum）：列出 CHECK 表达式
SELECT conname, pg_get_constraintdef(oid) AS check_def
FROM pg_constraint
WHERE conrelid = 'orders'::regclass AND contype = 'c';

-- ⑤ orders 表的 RLS 策略（确认 insert 是否对登录用户开放）
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'orders';

-- ⑥ profiles.gold_beans 列是否存在、类型是否正确（纯金豆先扣金豆，列缺失会报「金豆扣减失败」）
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'gold_beans';

-- ⑦ products 的 RLS（createOrderV2 回查 products 受 is_active=true 约束；下架商品会触发 INVALID_PRODUCT）
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'products';

-- ============================================================
-- ⑧ 端到端复现（不落库）：用真实 user/store 模拟「纯金豆」insert
--    若此处报错 invalid input value for enum order_status: "pending_review"
--    → 确认根因 = orders.status 枚举漏了纯金豆用的状态值
-- 注：使用子查询而非临时表，避免 SQL Editor 兼容性问题
-- ============================================================
BEGIN;
INSERT INTO orders (
  user_id, store_id, order_no, total_amount,
  status, payment_method, service_type, idempotency_key
)
SELECT u.id, s.id, 'DIAG_' || now(), 0.01,
       'pending_review', 'gold_beans', 'self_pickup', 'DIAG_TEST'
FROM (SELECT id FROM profiles LIMIT 1) AS u,
     (SELECT id FROM stores LIMIT 1) AS s
RETURNING id, status;
ROLLBACK;

-- ============================================================
-- 【若 ⑧ 复现出 enum 错误】修复方案（先跑上面 SELECT 核对，确认无误再执行）：
--    把缺的状态值加进枚举（把 order_status 换成 ② 查到的真实 enum 名）：
-- ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_review';
-- ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_ship';
-- （Postgres 11+ 支持 IF NOT EXISTS；若报错说 enum 正被使用，可在事务外分两次执行）
-- ============================================================
