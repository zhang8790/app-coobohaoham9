-- 20260803 商品类型化：新增 product_kind + 礼品类独立字段
-- 目的：把"药膳手串礼品"等非遗/工艺类商品与"食疗食养"食品彻底分开，
--       详情页按 product_kind 条件渲染两套模块树，绝不共用食疗话术。
--
-- 关键隔离原则（避坑）：
--   * 礼品的草本/材质成分存 materials(text[])，绝不写入 ingredients(text[])！
--     ingredients 是食疗引擎(buildTherapyReport)的触发源，写入会误弹
--     「三色预警 / 性味 / 食用量 / 同体质推荐」等食品模块，造成灾难级违和。
--   * 礼品类不渲染任何食养模块（见 src/pages/product/index.tsx 的 kind 分流）。
--
-- 注：文件名 20260803 排在 20260802_* 之后，确保最后执行；列均 IF NOT EXISTS 幂等。

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_kind text NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS materials text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gift_meaning text,
  ADD COLUMN IF NOT EXISTS gift_craft text,
  ADD COLUMN IF NOT EXISTS gift_scene text,
  ADD COLUMN IF NOT EXISTS gift_care text;

-- 商品类型枚举约束：food=食养食品 / gift=药膳手串等工艺礼品 / craft=手作 / care=护理
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_product_kind_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_product_kind_check
      CHECK (product_kind IN ('food','gift','craft','care'));
  END IF;
END $$;

COMMENT ON COLUMN public.products.product_kind IS
  '商品类型：food=食养食品(走食疗模块) / gift=药膳手串等工艺礼品 / craft=手作 / care=护理。'
  '详情页按此字段条件渲染不同模块树，礼品与食养绝不共用描述。默认 food。';
COMMENT ON COLUMN public.products.materials IS
  '礼品/手作的材质或草本成分清单(text[])。注意：礼品的草本成分存这里，'
  '绝不写入 ingredients（ingredients 会触发食疗引擎）。';
COMMENT ON COLUMN public.products.gift_meaning IS
  '礼品寓意文化文案（灵魂维度）：如"合欢解郁、艾草驱秽——串起一腕清欢"。';
COMMENT ON COLUMN public.products.gift_craft IS
  '材质工艺说明（手作/工序维度）：如"天然草木+925银饰，古法编绳，单串手作约40分钟"。';
COMMENT ON COLUMN public.products.gift_scene IS
  '送礼场景（转化核心维度）：如"送给总熬夜的她 / 乔迁新居 / 长辈安康"。';
COMMENT ON COLUMN public.products.gift_care IS
  '保养与使用注意（合规嗅觉体感维度）：含佩戴保养、敏感人群提示；'
  '须含"本品为工艺礼品，非药品"等合规免责，禁疗效宣称。';

-- 同名商品类型过滤索引（首页/探索按 kind 筛选用；低基数列，选择性一般但成本低）
CREATE INDEX IF NOT EXISTS idx_products_product_kind
  ON public.products (product_kind);
