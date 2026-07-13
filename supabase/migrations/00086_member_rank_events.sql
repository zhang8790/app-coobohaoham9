-- 00086: 段位变更事件日志 member_rank_events
-- 背景：「阶段间时间窗口」「段位六阶马尔可夫」依赖段位变更历史，而 profiles.member_rank 只是单列当前值。
--       本表记录每一次段位跃迁的时间戳，支撑：
--         1) 从 X 段位到 Y 段位平均历时（时间窗口分析）
--         2) 段位态马尔可夫转移矩阵（跃迁序列）
-- 设计：
--   1) user_id / from_stage / to_stage / trigger / created_at
--   2) trigger 当前仅 'consume+badge'（由 syncMemberRank 在消费+徽章软门槛达标时写入）
--   3) RLS：DISABLE（与 commissions / withdrawals / gold_bean_logs 策略一致，admin-web anon 可读写）
--   4) 索引：(user_id, created_at) 便于按用户拉时间线
-- 幂等：所有 IF NOT EXISTS。

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

-- 测试期放开：与 commissions / withdrawals / gold_bean_logs 一致（admin-web anon 可读写）
ALTER TABLE member_rank_events DISABLE ROW LEVEL SECURITY;
