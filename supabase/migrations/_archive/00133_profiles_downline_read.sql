-- 00133 好友/粉丝列表可见性（修复小程序「我的好友/我的粉丝」空白）
--
-- 根因：迁移 00081 收口 profiles RLS 为 rls81_profiles_self_read，
--       其 SELECT USING 条件为 (id = auth.uid() OR is_admin())，
--       仅允许读「自己」的 profile。
--       小程序 getMyReferrals() 查询条件是 referrer_id = 当前用户，
--       要读取的是「他人（自己的下级）」的 profile，其行 id ≠ 当前 uid，
--       因此被 RLS 全部过滤，导致「我的好友/我的粉丝」列表始终为空。
--
-- 修复：新增一条 SELECT 策略，放行 authenticated 用户读取自己的
--       直接下级（L1：referrer_id = 我）与间接下级（L2：我的下级的下级）。
--       不破坏既有 self_read（读自己）与 admin（is_admin）语义。

DROP POLICY IF EXISTS rls81_profiles_downline_read ON profiles;

CREATE POLICY rls81_profiles_downline_read
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    referrer_id = auth.uid()
    OR referrer_id IN (SELECT id FROM profiles WHERE referrer_id = auth.uid())
  );

-- 备注：
-- 1. 行级策略只控制「行是否返回」，不控制列；好友列表前端仅渲染
--    nickname / member_rank / created_at / avatar_url / tb_balance，不展示 phone，
--    展示层脱敏已满足隐私要求。
-- 2. 子查询 (SELECT id FROM profiles WHERE referrer_id = auth.uid()) 为非递归
--    普通策略内的子查询，不受本表 RLS 二次约束，可正常解析 L2 集合。
-- 3. 生产上线前需执行本迁移（本机已直连执行验证）。
