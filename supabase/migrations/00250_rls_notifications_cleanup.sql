-- 00250_rls_notifications_cleanup.sql
-- 在线执行：supabase db query --linked < supabase/migrations/00250_rls_notifications_cleanup.sql
-- 背景：00249 误判 notifications 无 RLS，新增了 3 条仅 owner 的冗余策略
--       （notifications_owner_select/update/insert）。
--       实际 notifications 早已存在 rls81_notifications_owner
--       （cmd=ALL, qual=(user_id = auth.uid()) OR is_admin()），该策略已是完整正确的 RLS。
--       00249 新增的 3 条会与 rls81 以 AND 组合，反而抹掉 is_admin() 管理员越权通道，属回归。
-- 处理：删除 00249 新增的 3 条冗余策略，仅保留 rls81_notifications_owner。
--       本迁移幂等（DROP POLICY IF EXISTS 在策略不存在时不报错）。

DROP POLICY IF EXISTS notifications_owner_select ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_insert ON public.notifications;
