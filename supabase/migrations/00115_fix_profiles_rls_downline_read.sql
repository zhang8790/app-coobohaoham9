-- 00115：修复「我的好友 / 我的粉丝」在小程序端为空（后台能看到）的问题
--
-- 根因（已定位）：
--   profiles 表 RLS 最终策略 rls_final_profiles_self_read 为
--     USING (id = auth.uid() OR public.is_admin())
--   即【普通用户只能 SELECT 自己的那一行】。
--   小程序端 getMyReferrals() 执行 `select('*').eq('referrer_id', 我的id)` 查询下线时，
--   RLS 逐行判定「该行 id 是否等于当前登录用户」——下线行的 id 当然不等于自己，
--   于是被整体拦截，返回空数组。后台用 admin / service key 不受此限，故能看到关系。
--
-- 修复：新增一条 SELECT 策略，允许 authenticated 用户读取【自己的推广下线】
--   （一级：referrer_id = 我；二级：referrer_id 属于我的一级）。
--   用 SECURITY DEFINER 函数返回可见网络 id 集合，避免 RLS 递归。

-- 1) 安全定义者函数：返回当前用户【可见网络】的 id（一级 + 二级），绕过 RLS 防递归
CREATE OR REPLACE FUNCTION public.visible_network_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT p.id), '{}'::uuid[])
  FROM public.profiles p
  WHERE p.referrer_id = auth.uid()                                   -- 一级（我的好友）
     OR p.referrer_id IN (                                          -- 二级（我的粉丝）
          SELECT id FROM public.profiles WHERE referrer_id = auth.uid()
        );
$$;

-- 2) 新增 SELECT 策略：自己 + 可见网络 可读（与既有 self_read / admin 策略 OR 共存）
DROP POLICY IF EXISTS rls_profiles_read_network ON public.profiles;
CREATE POLICY rls_profiles_read_network ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR id = ANY(public.visible_network_ids()));

-- 2.1) 授权 authenticated 可执行该函数（RLS 表达式内调用需要 EXECUTE 权限）
GRANT EXECUTE ON FUNCTION public.visible_network_ids() TO authenticated;

-- 3) 校验提示
DO $$
BEGIN
  RAISE NOTICE '✅ 已新增 profiles 读取下线策略 rls_profiles_read_network';
  RAISE NOTICE '   现在用户可读取：自己 + 一级下线(referrer_id=我) + 二级下线(referrer_id∈我的一级)';
  RAISE NOTICE '   请在微信开发者工具「清除缓存 → 全部清除」后重新打开「我的推荐」页验证。';
END $$;
