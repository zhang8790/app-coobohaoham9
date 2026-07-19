-- 00104: products 表补「商品食疗智能系统」完整录入字段（对齐前后端分离架构 spec）
-- 设计说明：
--   1. 本迁移在 00100（性味/标签/搭配/相克/辅料）基础上，补充 spec 要求的
--      分类 / 正效+风险分离 / 情绪三段 / 场景 / 三类人群(带说明) / 门店营销配套。
--   2. 全部新列 nullable + 默认空，前端与 admin 端均做软降级（列不存在时剥离再保存），
--      故本迁移未执行也不影响既有上架与展示，只是暂无新录入能力。
--   3. 需在用户本机执行（沙箱无 supabase CLI / Token）。
--   4. 「人群标签 ↔ 适配菜品」映射通过 rec/cautious/forbidden_crowds 数组 + GIN 索引
--      + 前端 overlap 查询实现，无需额外映射表。

-- 一、基础信息区：商品分类（粉面 / 炖汤 / 热饮 / 小菜）
ALTER TABLE products ADD COLUMN IF NOT EXISTS food_category text;
COMMENT ON COLUMN products.food_category IS '商品分类：粉面/炖汤/热饮/小菜；与现有 category_id 并存，专门驱动食疗导购分类筛选';
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_food_category;
ALTER TABLE products ADD CONSTRAINT chk_products_food_category
  CHECK (food_category IS NULL OR food_category IN ('粉面','炖汤','热饮','小菜'));

-- 二、核心食疗录入区
-- 原材料清单（仅食材名称，无工艺）：复用现有 ingredients text[]，不再单列。

-- 食疗滋养效果：正向调理作用（单独）
ALTER TABLE products ADD COLUMN IF NOT EXISTS positive_effect text;
COMMENT ON COLUMN products.positive_effect IS '正向调理作用（商家填写的食疗收益文案）';

-- 食疗滋养效果：食用风险提示（单独，与正向分离）
ALTER TABLE products ADD COLUMN IF NOT EXISTS risk_warning text;
COMMENT ON COLUMN products.risk_warning IS '食用风险提示（如：上火/经期量大人群会加重不适）';

-- 情绪价值文案（固定三段式模板填空，存整段）
ALTER TABLE products ADD COLUMN IF NOT EXISTS emotion_copy text;
COMMENT ON COLUMN products.emotion_copy IS '情绪价值文案（三段式：温暖陪伴/治愈低落/犒劳自己），商家填空或自动生成';

-- 适配消费场景列表（多选 + 自定义）
ALTER TABLE products ADD COLUMN IF NOT EXISTS scenes text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.scenes IS '适配消费场景：熬夜加班/秋冬御寒/经期前后/术后体虚/单人简餐/饭后解腻/换季易感冒 + 自定义';

-- 三、人群标签配置（系统打分核心，三类 + 说明）
-- ① 五星推荐人群（多选项勾选）
ALTER TABLE products ADD COLUMN IF NOT EXISTS rec_crowds text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.rec_crowds IS '五星推荐人群：宫寒量少/经期量大/喉咙肿痛/易上火/体虚怕冷/痛风/脾胃虚寒 中选填';

-- ② 谨慎食用人群 + 限制说明
ALTER TABLE products ADD COLUMN IF NOT EXISTS cautious_crowds text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.cautious_crowds IS '谨慎食用人群';
ALTER TABLE products ADD COLUMN IF NOT EXISTS cautious_notes text;
COMMENT ON COLUMN products.cautious_notes IS '谨慎食用限制说明（如：少量饮用、去辣减油）';

-- ③ 禁止食用人群 + 风险原因
ALTER TABLE products ADD COLUMN IF NOT EXISTS forbidden_crowds text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.forbidden_crowds IS '禁止食用人群';
ALTER TABLE products ADD COLUMN IF NOT EXISTS forbidden_reasons text;
COMMENT ON COLUMN products.forbidden_reasons IS '禁止食用风险原因（如：加重不适/诱发痛风）';

-- 四、门店营销配套录入区（自动同步前端/海报/导购）
-- 店内升单搭配套餐（绑定店内其他商品 id）
ALTER TABLE products ADD COLUMN IF NOT EXISTS combo_product_ids text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.combo_product_ids IS '升单搭配套餐：绑定店内其他商品 id（products.id）';

-- 店员导购短句
ALTER TABLE products ADD COLUMN IF NOT EXISTS guide_sentence text;
COMMENT ON COLUMN products.guide_sentence IS '店员导购短句（销售话术库 / 商品卡副标题）';

-- 朋友圈种草文案
ALTER TABLE products ADD COLUMN IF NOT EXISTS moments_copy text;
COMMENT ON COLUMN products.moments_copy IS '朋友圈 / 社群种草文案';

-- 忌口红字警示语
ALTER TABLE products ADD COLUMN IF NOT EXISTS taboo_warning text;
COMMENT ON COLUMN products.taboo_warning IS '忌口红字警示语（详情页底部小字）';

-- 索引：便于前端按场景/人群 overlap 召回
CREATE INDEX IF NOT EXISTS idx_products_scenes ON products USING gin (scenes);
CREATE INDEX IF NOT EXISTS idx_products_rec_crowds ON products USING gin (rec_crowds);
CREATE INDEX IF NOT EXISTS idx_products_cautious_crowds ON products USING gin (cautious_crowds);
CREATE INDEX IF NOT EXISTS idx_products_forbidden_crowds ON products USING gin (forbidden_crowds);
CREATE INDEX IF NOT EXISTS idx_products_food_category ON products (food_category);
