-- 诊断当前 public.member_rank 枚举的真实状态
-- 用法：复制整段到 Supabase SQL 编辑器执行，看 Results

-- 1. 枚举当前有哪些标签
SELECT enumlabel AS label
FROM pg_enum
WHERE enumtypid = 'public.member_rank'::regtype
ORDER BY enumsortorder;

-- 2. 列默认值
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'member_rank';

-- 3. rank_configs 当前内容（如果存在）
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rank_configs') THEN
    RAISE NOTICE 'rank_configs 存在，请单独 SELECT * FROM public.rank_configs ORDER BY min_consumption; 查看';
  ELSE
    RAISE NOTICE 'rank_configs 表不存在';
  END IF;
END $$;

-- 4. 检查是否有 profiles.member_rank 值落在旧枚举标签上（异常数据）
SELECT member_rank, COUNT(*) AS cnt
FROM public.profiles
WHERE member_rank IN ('江湖散修','外门弟子','内门弟子','核心弟子','长老','掌门')
GROUP BY member_rank
ORDER BY member_rank;
