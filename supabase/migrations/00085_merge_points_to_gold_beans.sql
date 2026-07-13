-- 00085_merge_points_to_gold_beans.sql
-- 会员货币归一：原 V5「买家积分 points」与「金豆 gold_beans」同质（均 1:1 抵扣币），
-- 抵扣链路实际只用 gold_beans。本迁移把历史 points 余额 1:1 合并进 gold_beans，并清零 points。
-- 保留 points 列（不 DROP），避免退款 / 风控等读取逻辑运行期报错；清零后该列恒为 0，无害。
-- 代码侧已落地：addBuyerPoints 改写 gold_beans；退款 / 风控改扣回 gold_beans；
--   user 页「积分」卡移除；admin-users / my-referrals 改显 gold_beans。

-- 1) 合并历史余额（金豆 = 金豆 + 原积分；原积分清零）
UPDATE profiles
SET gold_beans = gold_beans + COALESCE(points, 0),
    points = 0
WHERE COALESCE(points, 0) > 0;

-- 2) （可选）确认无引用后再执行，彻底移除冗余列与孤立表：
--    ALTER TABLE profiles DROP COLUMN IF EXISTS points;
--    ALTER TABLE profiles DROP COLUMN IF EXISTS balance;   -- 预留现金账户，长期未启用
--    DROP TABLE IF EXISTS points_logs;
-- 说明：points_logs 仍被 getMyPointsLogs 读取；若要 DROP，请先确认该函数无前端调用后再处理。
