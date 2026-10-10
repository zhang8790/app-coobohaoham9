-- 情绪确权记录表（消费即确权路线）
-- 与方案 §5.4 原设计的「独立情绪激活码」不同：本项目采用「消费即确权」，
-- 用户走完 扫码购→加购→结算→支付成功 后，在支付成功页引导进入 emotion-claim 做情绪确权，
-- 不再新增第四套实体二维码。因此本表无需 activation_codes，仅记录确权行为 + 奖励发放。
--
-- 设计要点：
-- 1. 不加任何外键约束 —— 规避项目历史中 store_id UUID/INTEGER 类型漂移导致插入失败的坑。
-- 2. order_no 存订单号文本（非 order.id），与 payment 页既有的 orderNo 变量对齐，避免与外键类型纠缠。
-- 3. selected_emotion 用 text[] 存用户多选的情绪标签（如 ['治愈','温馨']）。
-- 4. RLS 关闭（与项目测试期所有表一致）。

CREATE TABLE IF NOT EXISTS emotion_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  order_no text,
  product_id text,
  store_id text,
  selected_emotion text[],
  badge_text text,
  tongbao_amount smallint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_claims_user ON emotion_claims (user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_product ON emotion_claims (product_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_order ON emotion_claims (order_no);

-- 与项目测试期所有表一致：关闭行级安全（上线前需重新评估）
ALTER TABLE emotion_claims DISABLE ROW LEVEL SECURITY;
