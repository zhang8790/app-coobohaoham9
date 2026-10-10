-- 00106 收敛 get_rank_progress：消除历史上 00005(p_user_id+jsonb) / 00013,00049,00050(user_id+TABLE) 的返回类型冲突
-- 执行时间：2026-07-16
-- 目标：数据库只保留唯一一份 get_rank_progress(p_user_id uuid) RETURNS jsonb，
--       字段契约与前端 src/pages/my-promotion/index.tsx 完全一致（current_rank/next_rank/
--       direct_count/target_count/progress/total_gmv/points/balance）。
--       段位判定逻辑对齐 V5（与前端 commission-calculator-v5.ts 的 total_consumption 阈值一致）。
--
-- 注：本迁移可在任何已应用旧迁移的库上安全重跑（先 DROP 所有重载再重建）。

-- 1. 强制删除所有同名重载（避免 42P13 "cannot change return type"）
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE proname = 'get_rank_progress'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;

-- 2. 重建唯一正确的 jsonb 版本（参数名 p_user_id，与前端 rpc 调用一致）
CREATE OR REPLACE FUNCTION public.get_rank_progress(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_direct_count int;
  v_dynamic_score numeric;
  v_current_rank text;
  v_next_rank text;
  v_next_min numeric;
  v_progress numeric;
BEGIN
  SELECT
    total_consumption,
    member_rank,
    points,
    commission_balance
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  -- 直接下级数量
  SELECT count(*) INTO v_direct_count
  FROM public.profiles
  WHERE referrer_id = p_user_id;

  -- 动态分数 = 个人累计消费（与前端 calculateDynamicScore 一致）
  v_dynamic_score := COALESCE(v_profile.total_consumption, 0);

  -- 当前段位（V5 阈值：0/200/800/2000/6000/20000）
  SELECT rank_name INTO v_current_rank
  FROM (
    VALUES
      ('江湖散修', 0),
      ('外门弟子', 200),
      ('内门弟子', 800),
      ('核心弟子', 2000),
      ('长老', 6000),
      ('掌门', 20000)
  ) AS t(rank_name, min_score)
  WHERE v_dynamic_score >= min_score
  ORDER BY min_score DESC
  LIMIT 1;

  IF v_current_rank IS NULL THEN
    v_current_rank := '江湖散修';
  END IF;

  -- 下一段位与所需消费门槛
  SELECT rank_name, min_score INTO v_next_rank, v_next_min
  FROM (
    VALUES
      ('外门弟子', 200),
      ('内门弟子', 800),
      ('核心弟子', 2000),
      ('长老', 6000),
      ('掌门', 20000)
  ) AS t(rank_name, min_score)
  WHERE min_score > v_dynamic_score
  ORDER BY min_score ASC
  LIMIT 1;

  IF v_next_rank IS NULL THEN
    v_next_rank := '已是最高段位';
    v_next_min := v_dynamic_score;
  END IF;

  -- 进度 = 距下一段位消费门槛的百分比（已是最高段位则 100）
  IF v_next_rank = '已是最高段位' THEN
    v_progress := 100;
  ELSE
    v_progress := LEAST(100,
      ((v_dynamic_score - (
        SELECT COALESCE(MAX(min_score), 0) FROM (
          VALUES (0),(200),(800),(2000),(6000),(20000)
        ) AS prev(min_score)
        WHERE min_score <= v_dynamic_score
      )) / NULLIF(v_next_min - (
        SELECT COALESCE(MAX(min_score), 0) FROM (
          VALUES (0),(200),(800),(2000),(6000),(20000)
        ) AS prev(min_score)
        WHERE min_score <= v_dynamic_score
      ), 0)) * 100);
  END IF;

  RETURN jsonb_build_object(
    'current_rank', v_current_rank,
    'next_rank', v_next_rank,
    'direct_count', v_direct_count,
    'target_count', v_next_min,
    'progress', ROUND(v_progress, 1),
    'total_gmv', v_dynamic_score,
    'points', COALESCE(v_profile.points, 0),
    'balance', COALESCE(v_profile.commission_balance, 0)
  );
END;
$$;

-- 3. 授予前端匿名/认证角色执行权限（与历史迁移保持一致）
GRANT EXECUTE ON FUNCTION public.get_rank_progress(uuid) TO anon, authenticated;
