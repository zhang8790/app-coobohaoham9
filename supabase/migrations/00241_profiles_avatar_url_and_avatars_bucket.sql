-- ============================================================================
-- 00241  修复「头像保存失败」两处根因
-- ============================================================================
-- 现象：小程序「我的 → 设置 → 个人资料」改头像点保存 → 提示「保存失败」，
--       过程中还会闪一次「存储桶不存在，请联系管理员」。
--
-- 实测定位（anon/JWT 直连线上库，非推断）：
--   ① 真因：public.profiles 表**根本没有 avatar_url 列**。
--      updateUserProfile() 发 PATCH { nickname, avatar_url } →
--      PostgREST 返回 42703 "column profiles.avatar_url does not exist" →
--      函数 return false → 前端弹「保存失败」。
--      连带失效点（同一根因，均已修）：
--        - AuthContext / user/index.tsx 读 profile.avatar_url 永远 undefined，头像区空
--        - api.ts:3958 `profiles(id, nickname, avatar_url)` 内联 join，整条查询 42703 直接失败
--        - api.ts:70 updateProfile 的 avatar_url 分支同理失败
--   ② 次要：storage.buckets 里**没有 avatars 桶**（线上仅 images / product-images /
--      qrcodes / videos / 二维码），settings 页首选的 avatars 桶上传返回
--      NoSuchBucket → 弹「存储桶不存在」；随后回退 images 桶其实能成功，
--      所以这只是一条误导性提示，不是保存失败的原因。
--
-- 本迁移做两件事：
--   1. profiles 加 avatar_url 列（幂等）
--   2. 补建 avatars 桶 + storage.objects 策略（幂等），让首选路径成立
--
-- 幂等：本库无 supabase_migrations 记录表，迁移会被手工重放，全部语句可重复执行。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. profiles.avatar_url
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS
  '用户头像公网 URL（存于 storage avatars 桶，回退 images 桶）。契约：存完整 https URL，不存 wxfile:// 本地路径。';

-- ---------------------------------------------------------------------------
-- 2. avatars 存储桶
--    与既有 images 桶保持一致的宽松配置：public=true，不限制体积/MIME
--    （微信 chooseMedia 压缩图为 jpeg，加 MIME 白名单会引入新的失败面）
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ---------------------------------------------------------------------------
-- 3. storage.objects 策略（avatars 桶）
--    读：公开读（头像 URL 要能在小程序 <Image> 直接加载）
--    写：仅 authenticated，且只能改自己 owner 的对象
--    ⚠️ Postgres 多策略是 OR 关系，此处不新增 public/qual=true 的放行策略，
--       避免重蹈「全开策略架空 RLS」（00210 已清过一轮）。
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS avatars_public_read  ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_insert  ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_update  ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_delete  ON storage.objects;

CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY avatars_auth_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY avatars_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'avatars' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid());

CREATE POLICY avatars_auth_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());

COMMIT;

-- ============================================================================
-- 验收（迁移后应满足）
--   select count(*) from information_schema.columns
--     where table_schema='public' and table_name='profiles' and column_name='avatar_url';   -- 1
--   select public from storage.buckets where id='avatars';                                    -- t
--   select policyname from pg_policies
--     where schemaname='storage' and tablename='objects' and policyname like 'avatars_%';     -- 4 行
--   -- 端到端：PATCH /rest/v1/profiles?id=eq.<uid> body {"avatar_url":"https://..."} → 204
-- ============================================================================
