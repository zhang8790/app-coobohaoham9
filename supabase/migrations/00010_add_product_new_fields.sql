-- 00010_add_product_new_fields.sql
-- 给 products 表新增：成本价、让利%、主图/副图/详情图/视频

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_rate numeric(5,2) CHECK (discount_rate >= 0 AND discount_rate <= 100),
  ADD COLUMN IF NOT EXISTS main_image text,
  ADD COLUMN IF NOT EXISTS sub_images text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detail_images text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url text;
