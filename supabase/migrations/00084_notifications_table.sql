-- 00084: 通知中心 notifications 表
-- 背景：小程序用户端此前无任何业务事件推送（公告/下单/分佣/退款/提现），用户必须进入页面才能看到。
--       接入微信「订阅消息」：写表 + 调 subscribeMessage.send，由用户主动授权一次后长期生效。
-- 设计：
--   1) notifications 表记录「每条已发/待发通知」的内容、接收人、已读状态、发送时间
--   2) 类型 type: order_paid / commission_arrived / withdraw_progress / refund_result / announcement
--   3) RLS：DISABLE（与 emotion_* 5 表策略一致，anon 端可读自己的通知；测试期放开；00081 收口时再加）
--   4) 索引：user_id + read_at + created_at DESC，便于消息中心列表 / 未读数 查询
-- 幂等：所有 IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,                                 -- 接收人（auth.users.id 或 profiles.id）
  type         text NOT NULL,                                 -- 通知类型（5 枚举）
  title        text NOT NULL,                                 -- 通知标题
  body         text NOT NULL,                                 -- 通知正文
  order_id     uuid,                                          -- 关联订单（可空）
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,            -- 扩展字段（金额/订单号/跳转路径等）
  read_at      timestamptz,                                   -- 已读时间（null = 未读）
  sent_at      timestamptz,                                   -- 实际推送到微信的时间（null = 仅落库未推送）
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notifications IS '通知中心：所有推送给小程序用户的业务事件。写表后由 send-notification 云函数调 subscribeMessage.send';
COMMENT ON COLUMN notifications.type IS 'order_paid | commission_arrived | withdraw_progress | refund_result | announcement';
COMMENT ON COLUMN notifications.payload IS '扩展字段：金额/订单号/跳转路径，便于小程序端展示';
COMMENT ON COLUMN notifications.read_at IS 'null = 未读，进入小程序消息中心后置 now()';
COMMENT ON COLUMN notifications.sent_at IS 'null = 写库未推送（用户未授权/无 openid），进入消息中心可拉历史';

-- 索引：用户级未读 + 时间倒序
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- 测试期放开：与 emotion_claims 等用户表一致
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- 给 user_id 列加注释（提醒：与 profiles.id / auth.users.id 同源；当前 FK 设计沿用现有风格不加 FK）
COMMENT ON COLUMN notifications.user_id IS '接收人 uuid（与 auth.users.id / profiles.id 同源；不加 FK 以匹配现有 commissions/withdrawals 风格）';
