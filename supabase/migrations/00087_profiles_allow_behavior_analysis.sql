-- 00087: profiles.allow_behavior_analysis
-- 用途：PIPL 个性化总闸。用户可在小程序「设置 → 隐私与个性化」一键退出行为分析。
--       后台行为分析引擎（衰减/复购/马尔可夫/流失/触发）仅统计未退出用户。
-- 默认 true（与站内通知默认开启一致，opt-out 模式）；用户关闭后即被分析引擎排除。
-- 幂等：IF NOT EXISTS + 已有行默认 true（backfill）。

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allow_behavior_analysis boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.allow_behavior_analysis
  IS '个性化行为分析总闸：true=允许（默认），false=用户已退出，分析引擎排除该用户';
