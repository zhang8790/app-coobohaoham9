-- ============================================
-- 食材食疗智能导购 · 营销模板 / 导购话术库表
-- 创建时间: 2026-07-16
-- 说明:
--   1. food_therapy_templates —— 运营可配置的营销素材模板（销售话术/详情/朋友圈/风险/海报）
--      小程序详情页与收银台从此表读取话术，运营改模板无需发版。
--   2. 模板内容支持占位符：{name}{natureText}{tagText}{tagSentence}{remindText}
--      引擎 generateMarketingCopy 负责填充，缺表/缺行时回退硬编码默认集。
--   3. 与项目既有表一致：DISABLE ROW LEVEL SECURITY（测试阶段）。
-- ============================================

CREATE TABLE IF NOT EXISTS public.food_therapy_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tpl_key     TEXT NOT NULL UNIQUE,          -- sales_word | detail_desc | circle_copy | risk_tip | poster_template
  tpl_type    TEXT NOT NULL DEFAULT 'sales', -- sales | detail | circle | risk | poster
  title       TEXT NOT NULL,                 -- 展示名（运营看）
  content     TEXT NOT NULL,                 -- 模板正文（含占位符）
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ftt_key ON public.food_therapy_templates(tpl_key);
CREATE INDEX IF NOT EXISTS idx_ftt_active ON public.food_therapy_templates(is_active);

-- ========== 种子数据（与 marketing.ts 默认生成逻辑一致）==========
INSERT INTO public.food_therapy_templates (tpl_key, tpl_type, title, content, is_active, sort_order) VALUES
  ('sales_word', 'sales', '一句话销售话术', '{name}｜{natureText}，{tagText}，一口就懂你的口味', true, 10),
  ('detail_desc', 'detail', '详情卖点文案', '【{name}】{natureText}。{tagSentence}用心选材，让每一餐都有温度。', true, 20),
  ('circle_copy', 'circle', '朋友圈 / 社群文案', '今天点了{name}，{natureText}的治愈感真的绝了～{tagSentence}日常小确幸 get✨', true, 30),
  ('risk_tip', 'risk', '风险提醒（合规）', '温馨提示：{remindText}。食养建议不替代医嘱，适量为佳。', true, 40),
  ('poster_template', 'poster', '海报模板', '主标题：{name}\n副标题：{natureText}·{tagText}\n角标：食材食疗导购推荐\n脚注：食养参考·不替代医嘱', true, 50)
ON CONFLICT (tpl_key) DO NOTHING;

-- ========== 禁用 RLS（与项目既有表一致）==========
ALTER TABLE public.food_therapy_templates DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.food_therapy_templates IS '食材食疗导购营销模板 / 导购话术库 - 运营后台可改，小程序与收银台直读';

-- ✅ 完成！
