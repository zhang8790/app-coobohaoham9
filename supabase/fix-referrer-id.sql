-- ============================================================
-- 单独补 profiles.referrer_id（deploy-bundle 的 Part0 未生效）
-- 用法：本文件单独粘贴到 Supabase SQL Editor 执行，
--       执行后务必看有没有红色报错；末尾会自动打印校验结果。
-- 说明：使用 DO 块自愈 —— 先尝试带外键版，失败自动降级无外键版，
--       已存在列则跳过，幂等可重复执行。
-- ============================================================

DO $$
BEGIN
  -- 仅当列不存在时才加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'referrer_id'
  ) THEN
    BEGIN
      -- 主版：与 00005 定义一致（带外键约束 auth.users）
      ALTER TABLE public.profiles
        ADD COLUMN referrer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN
      -- 兜底：部分环境对 auth.users 外键有权限限制，改用无外键版
      -- 功能完全一致，仅少一道数据完整性约束，不影响段位推荐。
      ALTER TABLE public.profiles
        ADD COLUMN referrer_id uuid;
    END;
  END IF;
END
$$;

-- 校验：应返回一行 referrer_id / uuid（或 uuid 类型）
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
  AND column_name  = 'referrer_id';
