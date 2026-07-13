-- ============================================================================
-- 来电有喜 · 本机执行合集（00085 + 00086 + 00087）
-- ----------------------------------------------------------------------------
-- 用途：沙箱无 supabase CLI，以下两条迁移需你在【Supabase Dashboard → SQL Editor】
--       粘贴本文件全部内容，点「Run」一次执行。
-- 安全：所有语句幂等（IF NOT EXISTS / WHERE 条件），重复执行无害。
-- 依赖：无需任何前置表（profiles 已存在）。
-- 执行后：阶段时间窗口 + 段位态马尔可夫 才有数据可分析（行为分析看板）。
-- ============================================================================

-- ============================================================================
-- 00085：会员货币归一 —— 历史「积分 points」1:1 合并进「金豆 gold_beans」
-- ============================================================================
-- 原 V5「买家积分 points」与「金豆 gold_beans」同质（均 1:1 抵扣币），
-- 抵扣链路实际只用 gold_beans。此处把历史 points 余额合并进 gold_beans 并清零。
-- points 列保留不 DROP（退款/风控等读取逻辑仍引用，清零后恒为 0，无害）。

UPDATE profiles
SET gold_beans = gold_beans + COALESCE(points, 0),
    points = 0
WHERE COALESCE(points, 0) > 0;

-- （可选，确认无引用后再手动执行）彻底移除冗余列/表：
--   ALTER TABLE profiles DROP COLUMN IF EXISTS points;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS balance;
--   DROP TABLE IF EXISTS points_logs;

-- ============================================================================
-- 00086：段位变更事件日志 member_rank_events
-- ============================================================================
-- 支撑：① 段位间时间窗口（X→Y 平均历时）② 段位态马尔可夫转移矩阵
-- RLS：DISABLE（与 commissions / withdrawals / gold_bean_logs 一致）

CREATE TABLE IF NOT EXISTS member_rank_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  from_stage  text NOT NULL,
  to_stage    text NOT NULL,
  trigger     text NOT NULL DEFAULT 'consume+badge',
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE member_rank_events IS '段位变更事件日志：支撑阶段间时间窗口与段位态马尔可夫分析';
COMMENT ON COLUMN member_rank_events.from_stage IS '跃迁前段位（首次为初始段位，如「江湖散修」）';
COMMENT ON COLUMN member_rank_events.to_stage IS '跃迁后段位';
COMMENT ON COLUMN member_rank_events.trigger IS '触发源：当前仅 consume+badge（消费+徽章软门槛）';

CREATE INDEX IF NOT EXISTS idx_member_rank_events_user_created
  ON member_rank_events (user_id, created_at DESC);

ALTER TABLE member_rank_events DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 回填：为已有用户写入一条「初始段位」基线事件（幂等）
-- ----------------------------------------------------------------------------
-- syncMemberRank 只会在未来段位变化时写事件；历史用户的初始段位没有记录，
-- 会导致时间窗口/段位马尔可夫缺少起点。此处给每个尚无事件的用户补一条
-- from=江湖散修 → to=当前段位 的基线（trigger='seed'），重复执行不会重复插。
-- ============================================================================
INSERT INTO member_rank_events (user_id, from_stage, to_stage, trigger, created_at)
SELECT
  p.id,
  '江湖散修' AS from_stage,
  COALESCE(p.member_rank, '江湖散修') AS to_stage,
  'seed' AS trigger,
  COALESCE(p.created_at, now()) AS created_at
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM member_rank_events mre WHERE mre.user_id = p.id
);

-- ============================================================================
-- 00087：profiles.allow_behavior_analysis（PIPL 个性化总闸）
-- ============================================================================
-- 用户可在小程序「设置 → 隐私与个性化」一键退出行为分析；
-- 后台分析引擎仅统计未退出（true）用户。默认 true（opt-out 模式）。
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allow_behavior_analysis boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.allow_behavior_analysis
  IS '个性化行为分析总闸：true=允许（默认），false=用户已退出，分析引擎排除该用户';

-- ============================================================================
-- 校验（执行后看结果，确认成功）
-- ============================================================================
-- SELECT 'profiles_merged' AS step, COUNT(*) AS rows_with_zero_points FROM profiles WHERE COALESCE(points,0)=0;
-- SELECT 'member_rank_events' AS step, COUNT(*) AS total_events FROM member_rank_events;
-- SELECT 'seed_events' AS step, COUNT(*) AS seed_count FROM member_rank_events WHERE trigger='seed';
