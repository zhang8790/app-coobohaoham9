-- 00107_fix_handle_new_user_trigger.sql
-- 修复 handle_new_user()：profiles 表已在后续迁移中移除 username 列，
-- 但 00092 重写的触发器仍向 profiles 插入 username，导致所有「邮箱注册」在
-- AFTER INSERT 触发器阶段报错回滚（ERROR 42703: column "username" does not exist），
-- 进而 auth.users 插入整体失败、新用户无法注册。
-- 本迁移仅移除该非法列引用，不改变角色判定 / ON CONFLICT 逻辑。
-- 幂等：CREATE OR REPLACE，可重复执行。

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

  INSERT INTO public.profiles (id, phone, nickname, role, openid)
  VALUES (
    NEW.id,
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
