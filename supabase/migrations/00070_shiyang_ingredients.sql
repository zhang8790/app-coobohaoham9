-- 00070 食养成分体系（ingredients + product_ingredients + product_emotions 扩展）
-- 配套：食养成分商品参数方案（deliverables/食养成分商品参数方案_合规版.md）
-- 合规基调：所有功效表述为传统食养文化参考，不替代医疗；普通食品不宣称疾病预防/治疗

-- =====================
-- 1) 食材字典（ingredients）
-- =====================
CREATE TABLE IF NOT EXISTS public.ingredients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,          -- 食材中文名（与 INGREDIENT_DICT key 对应）
  nature       text,                          -- 性味：温/凉/平/寒/微温/微寒
  benefits     text[]   NOT NULL DEFAULT '{}',-- 食养功效（合规措辞）
  audiences    text[]   NOT NULL DEFAULT '{}',-- 适用人群（状态描述）
  scenarios    text[]   NOT NULL DEFAULT '{}',-- 生活场景
  icon         text,                          -- 展示图标 emoji
  color        text,                          -- 展示色
  sort_order   int      NOT NULL DEFAULT 0,   -- 排序
  is_active    boolean  NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingredients_active ON public.ingredients(is_active, sort_order);

-- =====================
-- 2) 商品-食材关联（product_ingredients）
-- =====================
CREATE TABLE IF NOT EXISTS public.product_ingredients (
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_product_ingredients_ing ON public.product_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_product_ingredients_prod ON public.product_ingredients(product_id);

-- =====================
-- 3) product_emotion 扩展（食养维度缓存）
--    注意：真实表名为单数 product_emotion（由 00040/00050 创建），切勿写成复数 product_emotions
-- =====================
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS shiyang_tags jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"shiyang":["生姜","梨"]}
  ADD COLUMN IF NOT EXISTS shiyang_copy text;                                  -- 编译生成的可直接展示的食养卡片文案

COMMENT ON COLUMN public.product_emotion.shiyang_tags IS '食养成分标签：key=shiyang，value=食材名数组';
COMMENT ON COLUMN public.product_emotion.shiyang_copy IS '编译生成的食养参考文案（已套合规措辞）';

-- =====================
-- 4) 灌入 40+ 种子食材（与 src/utils/shiyang-dictionary.ts INGREDIENT_DICT 一一对应）
--    同步策略：若名字已存在则跳过（保证幂等可重跑）
-- =====================
INSERT INTO public.ingredients (name, nature, benefits, audiences, scenarios, icon, color, sort_order) VALUES
  -- 温性·暖身
  ('生姜',     '温',   ARRAY['驱寒暖身','温中'],           ARRAY['畏寒人群','淋雨受寒后'], ARRAY['换季温差','着凉初期'], '🫚', '#D97706', 10),
  ('红枣',     '温',   ARRAY['补中养血'],                   ARRAY['气血偏弱','经期后'],     ARRAY['日常温补'],           '🫘', '#B45309', 11),
  ('桂圆',     '温',   ARRAY['补益心脾'],                   ARRAY['思虑多','睡眠浅'],       ARRAY['劳神之后'],           '🟤', '#92400E', 12),
  ('核桃',     '温',   ARRAY['日常滋补','健脑'],             ARRAY['用脑较多'],               ARRAY['工作学习任务重'],     '🥜', '#78350F', 13),
  ('葱白',     '温',   ARRAY['辛温发散'],                   ARRAY['初起畏寒'],               ARRAY['着凉初期'],           '🧅', '#C5E4A7', 14),
  ('大蒜',     '温',   ARRAY['散寒','开胃'],                 ARRAY['换季'],                   ARRAY['日常调味'],           '🧄', '#E5E0D8', 15),
  ('南瓜',     '温',   ARRAY['补中'],                       ARRAY['体弱','术后调养'],        ARRAY['日常'],               '🎃', '#F59E0B', 16),
  ('山楂',     '微温', ARRAY['消食化积'],                   ARRAY['食滞','油腻后'],          ARRAY['吃多不消化'],         '🔴', '#DC2626', 17),
  ('陈皮',     '温',   ARRAY['理气健脾'],                   ARRAY['积食','痰多'],            ARRAY['油腻饮食后'],         '🍊', '#EA580C', 18),
  -- 凉/寒·清热润燥
  ('梨',       '凉',   ARRAY['生津润燥'],                   ARRAY['秋燥人群','用嗓较多者'],  ARRAY['干燥时节','用嗓过度'],'🍐', '#A8D672', 20),
  ('金银花',   '寒',   ARRAY['清热舒缓'],                   ARRAY['咽喉不适','易上火'],      ARRAY['咽喉干痒时'],         '🌼', '#F9E076', 21),
  ('绿豆',     '寒',   ARRAY['清热解暑'],                   ARRAY['暑热','易上火'],          ARRAY['夏季'],               '🟢', '#22C55E', 22),
  ('苦瓜',     '寒',   ARRAY['清热'],                       ARRAY['饮食油腻','易上火'],      ARRAY['油腻饮食后'],         '🥒', '#4ADE80', 23),
  ('白萝卜',   '凉',   ARRAY['理气化痰'],                   ARRAY['痰多','食积'],            ARRAY['吃多不消化'],         '🥕', '#F0F4F8', 24),
  ('香蕉',     '寒',   ARRAY['润肠'],                       ARRAY['肠燥'],                   ARRAY['日常'],               '🍌', '#F7DC6F', 25),
  ('菠菜',     '凉',   ARRAY['养血润燥'],                   ARRAY['贫血','干燥'],            ARRAY['日常'],               '🥬', '#16A34A', 26),
  ('薏米',     '凉',   ARRAY['清热利湿'],                   ARRAY['湿热'],                   ARRAY['夏季'],               '🌾', '#D4C5A9', 27),
  -- 平性·温和滋养
  ('蜂蜜',     '平',   ARRAY['润喉润肠'],                   ARRAY['咽喉干','肠燥'],          ARRAY['咽喉不适','早起'],    '🍯', '#F59E0B', 30),
  ('银耳',     '平',   ARRAY['滋阴润肺'],                   ARRAY['干燥','久咳'],            ARRAY['秋燥时节'],           '🍄', '#F5E6D3', 31),
  ('百合',     '微寒', ARRAY['清心安神'],                   ARRAY['心烦','睡眠浅'],          ARRAY['睡前'],               '🌷', '#F0AB8D', 32),
  ('莲子',     '平',   ARRAY['养心安神'],                   ARRAY['心悸','睡眠浅'],          ARRAY['日常'],               '🪷', '#6EE7B7', 33),
  ('山药',     '平',   ARRAY['健脾'],                       ARRAY['脾胃偏弱'],               ARRAY['日常调养'],           '🥖', '#D4C4A8', 34),
  ('枸杞',     '平',   ARRAY['养肝明目'],                   ARRAY['用眼多','熬夜'],          ARRAY['用眼过度'],           '🔴', '#EF4444', 35),
  ('黑芝麻',   '平',   ARRAY['润肠','日常滋养'],             ARRAY['发质干','肠燥'],          ARRAY['日常'],               '🖤', '#374151', 36),
  ('小米',     '凉',   ARRAY['养胃'],                       ARRAY['胃弱'],                   ARRAY['日常'],               '🌽', '#FCD34D', 37),
  ('苹果',     '平',   ARRAY['健脾'],                       ARRAY['日常'],                   ARRAY['日常'],               '🍎', '#EF4444', 38),
  ('胡萝卜',   '平',   ARRAY['明目','补充营养'],             ARRAY['用眼多'],                 ARRAY['日常'],               '🥕', '#F97316', 39),
  ('牛奶',     '平',   ARRAY['补钙','补蛋白'],               ARRAY['全人群'],                 ARRAY['日常'],               '🥛', '#E5E7EB', 40),
  ('鸡蛋',     '平',   ARRAY['补虚'],                       ARRAY['日常'],                   ARRAY['日常'],               '🥚', '#FDE68A', 41),
  ('牛肉',     '平',   ARRAY['补气血'],                     ARRAY['体弱','术后'],            ARRAY['调养期'],             '🥩', '#B91C1C', 42),
  ('鲫鱼',     '平',   ARRAY['健脾利湿'],                   ARRAY['术后','体弱'],            ARRAY['恢复期的温和食补'],   '🐟', '#64748B', 43),
  -- 营养导向
  ('柠檬',     '凉',   ARRAY['补充维C'],                   ARRAY['易疲劳','换季'],          ARRAY['日常'],               '🍋', '#FACC15', 50),
  ('猕猴桃',   '寒',   ARRAY['补充维C'],                   ARRAY['日常'],                   ARRAY['日常'],               '🥝', '#65A30D', 51),
  ('杏仁',     '温',   ARRAY['润肠','滋养'],                 ARRAY['肠燥'],                   ARRAY['日常'],               '🥜', '#D2B48C', 52),
  ('木瓜',     '温',   ARRAY['助消化'],                     ARRAY['积食'],                   ARRAY['油腻饮食后'],         '🟠', '#F97316', 53),
  ('紫菜',     '寒',   ARRAY['化痰软坚'],                   ARRAY['痰多'],                   ARRAY['日常'],               '🟣', '#8B5CF6', 54)
ON CONFLICT (name) DO NOTHING;

-- =====================
-- 5) RLS：菜品表对外只读，写入需鉴权（与平台其他字典表策略一致）
-- =====================
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ingredients_read_all ON public.ingredients;
CREATE POLICY ingredients_read_all ON public.ingredients FOR SELECT USING (true);

ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_ingredients_read_all ON public.product_ingredients;
CREATE POLICY product_ingredients_read_all ON public.product_ingredients FOR SELECT USING (true);
-- 写入由后端 service_role 处理（小程序的 anon 无 DML 权限）

-- =====================
-- 6) 触发器：updated_at（自建 set_updated_at() 兜底，避免依赖平台其他迁移）
-- =====================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ingredients_updated_at ON public.ingredients;
CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================
-- 7) 自校验（执行后应返回真值）
-- =====================
-- SELECT count(*) AS ingredient_seed_count FROM public.ingredients;     -- 期望 36
-- SELECT count(*) AS column_exists FROM information_schema.columns
--   WHERE table_name = 'product_emotion' AND column_name IN ('shiyang_tags','shiyang_copy'); -- 期望 2
