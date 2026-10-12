-- 00249_rls_notifications_paid_at.sql
-- 在线执行：supabase db query --linked < supabase/migrations/00249_rls_notifications_paid_at.sql
-- 目的：
--   1) merchant-payout 成功打款后需将 withdrawals.paid_at 置为 now() 以闭环对账；该列 schema.sql 已补，线上需补列。
--   2) notifications 此前无任何 RLS 语句 → anon/其他用户可越权读取他人通知；启用 RLS 并限定仅本人可读写。
-- 本迁移幂等（IF NOT EXISTS / IF NOT EXISTS 策略）。

-- 1) 补 withdrawals.paid_at 列
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS paid_at timestamptz;
COMMENT ON COLUMN public.withdrawals.paid_at
  IS '货款/佣金实际打款完成时间，由 merchant-payout 在成功打款后置为 now()';

-- 2) notifications RLS
-- 注意：标准 PostgreSQL 的 CREATE POLICY 不支持 IF NOT EXISTS，故先 DROP POLICY IF EXISTS 再 CREATE，保证幂等可重复执行。
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_owner_select ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_insert ON public.notifications;
CREATE POLICY notifications_owner_select ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notifications_owner_update ON public.notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_owner_insert ON public.notifications FOR INSERT WITH CHECK (user_id = auth.uid());
