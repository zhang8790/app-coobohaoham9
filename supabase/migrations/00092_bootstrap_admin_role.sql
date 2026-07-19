-- 00092_bootstrap_admin_role.sql
-- 让后台超级管理员账号（固定邮箱）注册时自动获得 role='admin'，
-- 使「路径 B：真实 admin 登录」可经由 is_admin() RLS 读全量后台数据，无需暴露 service_role 密钥。
--
-- 背景：00081 生产 RLS 加固后，后台列表查询依赖 is_admin()（= get_user_role(auth.uid())='admin'）。
-- 但 00001 的 handle_new_user() 触发器硬编码 role='user'，导致自动注册的 admin@laidianyouxi.com
-- 即便登录成功仍是普通用户，is_admin() 返回 false → 订单/消息被 RLS 拦成 0 行（空白）。
-- 本迁移从触发器层面权威授予 admin 角色，并幂等纠正早期已按 'user' 注册的账号。

-- 1) 重写 handle_new_user：注册邮箱命中管理员白名单 → role='admin'，否则 'user'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role public.user_role := 'user';
BEGIN
  -- 后台超级管理员白名单（如需新增管理员邮箱在此追加）
  IF NEW.email IN ('admin@laidianyouxi.com') THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, username, phone, nickname, role, openid)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'username')::text,
    NEW.phone,
    COALESCE((NEW.raw_user_meta_data->>'nickname')::text, '江湖散修'),
    v_role,
    (NEW.raw_user_meta_data->>'openid')::text
  )
  -- 若 profile 已存在（手动预建等），仅当 role 不一致时纠正为白名单角色
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role
    WHERE public.profiles.role <> EXCLUDED.role;

  RETURN NEW;
END;
$$;

-- 2) 幂等补丁：若后台 admin 账号此前已按 'user' 注册（早期测试遗留），纠正为 'admin'
UPDATE public.profiles
SET role = 'admin'
WHERE role <> 'admin'
  AND id IN (SELECT id FROM auth.users WHERE email = 'admin@laidianyouxi.com');
