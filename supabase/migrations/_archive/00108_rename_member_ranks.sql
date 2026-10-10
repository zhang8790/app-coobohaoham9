-- 00108 段位名称重命名（情绪境界主题）——幂等版
-- 旧：江湖散修 / 外门弟子 / 内门弟子 / 核心弟子 / 长老 / 掌门
-- 新：凡心   / 初心     / 明心     / 静心     / 悟心 / 无心境
--
-- 本版改用 DO $$ IF EXISTS ... 包裹每条 RENAME VALUE，
-- 兼容线上枚举已部分改名 / 已手动改名 的情况，重复执行安全。
-- 需在 Supabase 本机（Dashboard SQL 或 CLI）执行；沙箱无 SQL 权限。

-- 1) 重命名枚举标签（逐条判断，幂等）
DO $$
DECLARE
  typ oid := 'public.member_rank'::regtype;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '江湖散修') THEN
    ALTER TYPE public.member_rank RENAME VALUE '江湖散修' TO '凡心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '外门弟子') THEN
    ALTER TYPE public.member_rank RENAME VALUE '外门弟子' TO '初心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '内门弟子') THEN
    ALTER TYPE public.member_rank RENAME VALUE '内门弟子' TO '明心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '核心弟子') THEN
    ALTER TYPE public.member_rank RENAME VALUE '核心弟子' TO '静心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '长老') THEN
    ALTER TYPE public.member_rank RENAME VALUE '长老' TO '悟心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '掌门') THEN
    ALTER TYPE public.member_rank RENAME VALUE '掌门' TO '无心境';
  END IF;
END $$;

-- 2) profiles.member_rank 列默认值同步为新最低段位（幂等）
ALTER TABLE public.profiles ALTER COLUMN member_rank SET DEFAULT '凡心';

-- 3) 段位配置查找表 rank_configs：仅当旧名存在时更新（幂等）
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rank_configs') THEN
    UPDATE public.rank_configs SET rank_name = '凡心'   WHERE rank_name = '江湖散修';
    UPDATE public.rank_configs SET rank_name = '初心'   WHERE rank_name = '外门弟子';
    UPDATE public.rank_configs SET rank_name = '明心'   WHERE rank_name = '内门弟子';
    UPDATE public.rank_configs SET rank_name = '静心'   WHERE rank_name = '核心弟子';
    UPDATE public.rank_configs SET rank_name = '悟心'   WHERE rank_name = '长老';
    UPDATE public.rank_configs SET rank_name = '无心境' WHERE rank_name = '掌门';
  END IF;
END $$;

-- 4) 兼容：若存在遗留的 profiles.rank(TEXT) 列，默认值一并改为新最低段位
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'rank'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN rank SET DEFAULT '凡心';
  END IF;
END $$;

-- 5) 同步 member_rank_events 历史记录的阶段文案（UPDATE 天然幂等）
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'member_rank_events') THEN
    UPDATE public.member_rank_events SET from_stage = '凡心'   WHERE from_stage = '江湖散修';
    UPDATE public.member_rank_events SET from_stage = '初心'   WHERE from_stage = '外门弟子';
    UPDATE public.member_rank_events SET from_stage = '明心'   WHERE from_stage = '内门弟子';
    UPDATE public.member_rank_events SET from_stage = '静心'   WHERE from_stage = '核心弟子';
    UPDATE public.member_rank_events SET from_stage = '悟心'   WHERE from_stage = '长老';
    UPDATE public.member_rank_events SET from_stage = '无心境' WHERE from_stage = '掌门';
    UPDATE public.member_rank_events SET to_stage   = '凡心'   WHERE to_stage   = '江湖散修';
    UPDATE public.member_rank_events SET to_stage   = '初心'   WHERE to_stage   = '外门弟子';
    UPDATE public.member_rank_events SET to_stage   = '明心'   WHERE to_stage   = '内门弟子';
    UPDATE public.member_rank_events SET to_stage   = '静心'   WHERE to_stage   = '核心弟子';
    UPDATE public.member_rank_events SET to_stage   = '悟心'   WHERE to_stage   = '长老';
    UPDATE public.member_rank_events SET to_stage   = '无心境' WHERE to_stage   = '掌门';
  END IF;
END $$;
