-- 00050 下调 V5 段位阈值（个人累计消费门槛）
-- 执行时间：2026-07-07
-- 背景：移除团队业绩维度后，段位纯由个人累计消费决定，原阈值（掌门需 50000）过高。
--       用户要求调低段位门槛，使升级更易达（对应前端 commission-calculator-v5.ts 的改动）。
-- 新阈值（个人消费元）：江湖散修0 / 外门弟子200 / 内门弟子800 / 核心弟子2000 / 长老6000 / 掌门20000
-- 说明：返回类型与 00049 一致，PostgreSQL 允许 CREATE OR REPLACE 同签名函数；
--       但为与历史迁移保持一致、避免任何签名歧义，仍先 DROP 再 CREATE（幂等可重跑）。

-- 强制删除所有同名重载（避免旧签名残留导致 "cannot change return type" 42P13）
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE proname = 'get_rank_progress'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION get_rank_progress(user_id UUID)
RETURNS TABLE (
  current_rank TEXT,
  next_rank TEXT,
  current_count INTEGER,
  target_count INTEGER,
  direct_count INTEGER,
  l1_ratio NUMERIC,
  l2_ratio NUMERIC,
  points_ratio NUMERIC
) AS $$
DECLARE
  profile_record RECORD;
  dynamic_score NUMERIC;
  current_rank_name TEXT;
  next_rank_name TEXT;
  l1_ratio_value NUMERIC;
  l2_ratio_value NUMERIC;
  points_ratio_value NUMERIC;
BEGIN
  -- 获取用户资料和推荐关系（仅取个人累计消费）
  SELECT
    p.total_consumption,
    COUNT(DISTINCT r.id) as direct_count
  INTO profile_record
  FROM profiles p
  LEFT JOIN profiles r ON r.referrer_id = p.id
  WHERE p.id = user_id
  GROUP BY p.id, p.total_consumption;

  -- 动态分数 = 个人累计消费（不再含团队业绩）
  dynamic_score := COALESCE(profile_record.total_consumption, 0);

  -- 判定当前段位（阈值下调：江湖散修0 / 外门弟子200 / 内门弟子800 / 核心弟子2000 / 长老6000 / 掌门20000）
  SELECT rank_name, l1_ratio, l2_ratio, points_ratio
  INTO current_rank_name, l1_ratio_value, l2_ratio_value, points_ratio_value
  FROM (
    VALUES
      ('江湖散修', 0,     0.40, 0.15, 0.10),
      ('外门弟子', 200,   0.45, 0.18, 0.12),
      ('内门弟子', 800,   0.50, 0.20, 0.13),
      ('核心弟子', 2000,  0.54, 0.22, 0.14),
      ('长老',     6000,  0.57, 0.24, 0.15),
      ('掌门',     20000, 0.60, 0.25, 0.15)
  ) AS rank_table(rank_name, min_score, l1, l2, points)
  WHERE dynamic_score >= min_score
  ORDER BY min_score DESC
  LIMIT 1;

  -- 如果没有匹配（新用户），默认为江湖散修
  IF current_rank_name IS NULL THEN
    current_rank_name := '江湖散修';
    l1_ratio_value := 0.40;
    l2_ratio_value := 0.15;
    points_ratio_value := 0.10;
  END IF;

  -- 获取下一段位
  SELECT rank_name INTO next_rank_name
  FROM (
    VALUES
      ('外门弟子', 200),
      ('内门弟子', 800),
      ('核心弟子', 2000),
      ('长老', 6000),
      ('掌门', 20000)
  ) AS next_table(rank_name, min_score)
  WHERE min_score > dynamic_score
  ORDER BY min_score ASC
  LIMIT 1;

  -- 返回结果
  RETURN QUERY
  SELECT
    current_rank_name,
    COALESCE(next_rank_name, '已达最高段位'),
    profile_record.direct_count,
    CASE
      WHEN next_rank_name = '外门弟子' THEN 1
      WHEN next_rank_name = '内门弟子' THEN 3
      WHEN next_rank_name = '核心弟子' THEN 10
      WHEN next_rank_name = '长老' THEN 30
      WHEN next_rank_name = '掌门' THEN 100
      ELSE 0
    END,
    profile_record.direct_count,
    l1_ratio_value,
    l2_ratio_value,
    points_ratio_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
