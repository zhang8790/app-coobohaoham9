-- 情绪导购漏斗埋点表（对应方案 §5.5 数据闭环）
-- 记录五屏情绪详情页的用户行为：进入 / 各屏到达 / 点击购买 / 下单
-- 供商家「情绪漏斗」看板聚合分析，衡量情绪导购转化效果。
-- 测试期 RLS 全关（与项目其余表一致）；无 FK 约束，避免外键类型/存在性依赖导致插入失败。

CREATE TABLE IF NOT EXISTS emotion_funnel_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  product_id   uuid        NOT NULL,
  store_id     uuid,
  event_type   text        NOT NULL,   -- enter | screen_view | cta_click | order_created
  screen_index int,                     -- screen_view 时为 0~4
  source       text        DEFAULT 'emotion_detail',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_funnel_events_store
  ON emotion_funnel_events (store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_emotion_funnel_events_product
  ON emotion_funnel_events (product_id, event_type);

ALTER TABLE emotion_funnel_events DISABLE ROW LEVEL SECURITY;
