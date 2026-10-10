-- ============================================================
-- 20260927_add_category_parent.sql
-- 分类体系升级为「场景(一级) → 子类(二级)」，用户端与 admin-web 两端同源
--
-- 设计（低风险模型，已与前端代码对齐）：
--   一级分类：parent_id IS NULL（现有 8 个 global 场景，如宝宝零食/孕产营养…）
--   二级分类：parent_id = 所属一级 id（本文件预置 28 个，后台可改/删/增）
--   商品：保留 products.category_id = 一级（金刚区/探索页计数不受影响），
--         新增 products.sub_category_id = 二级（仅作为「场景内二级筛选」维度）。
--         → 二级不与一级争计数，首页金刚区零风险；探索页落地页用 sub_category_id 做 Tab 筛选。
--   scope：二级默认 global（平台统一维护），商家亦可自建店内二级。
--
-- 二级命名法（全网研究结论）：以「形态/剂型」为主维度（软糕/脆片/冻干/丸球/含片/糊粥/坚果谷物），
--   叠加人群语义（宝宝分龄溶豆奶片、熬夜护眼助眠等），全部不含功效/疾病词（合规）。
--
-- 幂等：可重复执行。加列 IF NOT EXISTS；种子用显式 UUID + ON CONFLICT(id) DO NOTHING。
--
-- 使用方式：
--   方式 A（推荐）：Supabase Dashboard → SQL Editor 整段粘贴 → Run
--   方式 B（CLI）：supabase db query --linked --file supabase/migrations/20260927_add_category_parent.sql
-- ============================================================

-- =====================
-- 第1步：store_categories 加自引用层级列（ON DELETE CASCADE：删一级时其二代一并删除）
-- =====================
ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.store_categories(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.store_categories.parent_id IS '父分类 id：NULL=一级分类（场景）；非 NULL=二级分类';

-- =====================
-- 第2步：products 加二级分类维度（筛选用，非主归类）
-- =====================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sub_category_id uuid REFERENCES public.store_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.sub_category_id IS '二级分类 id：场景内细分（形态/剂型），用于探索页 Tab 筛选；category_id 仍是一级场景';

-- =====================
-- 第3步：索引（按 parent_id 拉子类 / 按 sub_category_id 筛商品）
-- =====================
CREATE INDEX IF NOT EXISTS idx_store_categories_parent_id ON public.store_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_products_sub_category_id ON public.products(sub_category_id);

-- =====================
-- 第4步：防御触发器——禁止「二级再挂二级」（只允许两层）
-- =====================
CREATE OR REPLACE FUNCTION public.fn_store_categories_depth_guard()
RETURNS trigger AS $$
DECLARE
  p_parent uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_id INTO p_parent FROM public.store_categories WHERE id = NEW.parent_id;
    IF p_parent IS NOT NULL THEN
      RAISE EXCEPTION '分类最多两层：父分类「%」本身已是二级，不能再挂子类', NEW.parent_id;
    END IF;
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION '分类不能以自己为父';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_categories_depth_guard ON public.store_categories;
CREATE TRIGGER trg_store_categories_depth_guard
  BEFORE INSERT OR UPDATE OF parent_id ON public.store_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_store_categories_depth_guard();

-- =====================
-- 第5步：预置 28 个二级分类（显式 UUID，幂等 ON CONFLICT）
--   命名只含「形态/剂型 + 人群语义」，无功效/疾病词。
-- =====================
INSERT INTO public.store_categories (id, store_id, name, sort_order, scope, is_active, parent_id)
VALUES
  -- 宝宝零食 689bc729-5e75-4d16-b573-b1861d89d228
  ('0d86c3a1-c2b5-41e5-9f6f-3d088ecd853b', NULL, '溶豆·奶片', 10, 'global', true, '689bc729-5e75-4d16-b573-b1861d89d228'),
  ('23dee2fd-caaf-435a-bf88-662582f35d4b', NULL, '磨牙脆饼',   20, 'global', true, '689bc729-5e75-4d16-b573-b1861d89d228'),
  ('22195875-a206-4a6f-b02d-3e4b03d00f58', NULL, '果蔬脆',     30, 'global', true, '689bc729-5e75-4d16-b573-b1861d89d228'),
  -- 孕产营养 6ed844cd-7163-4006-b005-6496a0647966
  ('7d7a4d8c-40e4-42f8-9de3-0ca1b2a7c90f', NULL, '轻养糕点',   10, 'global', true, '6ed844cd-7163-4006-b005-6496a0647966'),
  ('11e9a458-9d01-431a-b1d8-14e55ba86d11', NULL, '坚果谷物脆', 20, 'global', true, '6ed844cd-7163-4006-b005-6496a0647966'),
  ('446bcbcd-82ca-4d6e-b292-6c2c03ac0626', NULL, '冻干滋补',   30, 'global', true, '6ed844cd-7163-4006-b005-6496a0647966'),
  -- 老年养生 e1be224c-9d2d-4a85-ba11-d90c77bb02b9
  ('ca42b285-0d25-47fb-b0ee-df3d6ac56a9e', NULL, '低糖糊羹',   10, 'global', true, 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9'),
  ('f460b6d5-1776-48ed-b4bf-53f117f9876a', NULL, '软糯糕点',   20, 'global', true, 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9'),
  ('97247c46-6fb7-40ef-a8a8-c0f413cd99b7', NULL, '坚果谷物',   30, 'global', true, 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9'),
  ('4bc0f199-17e5-46b9-a913-2cf71b65f572', NULL, '润燥冻干',   40, 'global', true, 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9'),
  -- 舒心食养 a6ae7d58-42f0-43e7-ae73-a968b93ab8a4
  ('fe3acf00-646e-4b47-b865-f87cade92ed8', NULL, '安神糕点',   10, 'global', true, 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4'),
  ('28a40ce6-7517-40a4-93dd-2a293cb0f3b2', NULL, '黑芝麻丸',   20, 'global', true, 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4'),
  ('e60ec5d4-8ab0-4201-abe0-80bc953a0d61', NULL, '冻干温润',   30, 'global', true, 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4'),
  ('9ce5d4b4-9232-401c-8fb5-4bb4994f5722', NULL, '暖养脆',     40, 'global', true, 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4'),
  -- 肠胃食养 ef38bc5b-3749-4404-a1a1-5db3270b9254
  ('e083699d-cfa3-4c1d-bcbd-3314e6797d1c', NULL, '消食含片',   10, 'global', true, 'ef38bc5b-3749-4404-a1a1-5db3270b9254'),
  ('916a8720-f4c6-41c2-a3b2-dcd12b8baf9f', NULL, '养胃薄脆',   20, 'global', true, 'ef38bc5b-3749-4404-a1a1-5db3270b9254'),
  ('379093cc-f3cc-4730-900e-ee8f0903e283', NULL, '暖胃粥羹',   30, 'global', true, 'ef38bc5b-3749-4404-a1a1-5db3270b9254'),
  -- 温润食养 8d545cbf-cf34-4d56-ac43-a35142365298
  ('f7007cc7-c91b-47d0-85eb-ceec016c2dbd', NULL, '润养含片',   10, 'global', true, '8d545cbf-cf34-4d56-ac43-a35142365298'),
  ('cd01f7a7-c0fc-4bfb-ad8b-b04e3274622a', NULL, '温润糕点',   20, 'global', true, '8d545cbf-cf34-4d56-ac43-a35142365298'),
  ('dff3697d-4e08-4a63-976b-19d1bbdd4460', NULL, '山药脆',     30, 'global', true, '8d545cbf-cf34-4d56-ac43-a35142365298'),
  ('b3585301-890a-4f18-b8a5-7e4fd389b4f3', NULL, '冻干温润',   40, 'global', true, '8d545cbf-cf34-4d56-ac43-a35142365298'),
  -- 敏感防护 bf890924-5893-48c5-bc20-b7120ad415e7
  ('e780c1af-e3b2-4351-bd8e-fa5130dc5628', NULL, '纯净单品脆', 10, 'global', true, 'bf890924-5893-48c5-bc20-b7120ad415e7'),
  ('d30fe164-94fa-4d9d-9829-51bb4d4ae57a', NULL, '无麸质米脆', 20, 'global', true, 'bf890924-5893-48c5-bc20-b7120ad415e7'),
  ('50d1c79c-ebc6-44cc-9408-e738e7203cf9', NULL, '坚果椰脆',   30, 'global', true, 'bf890924-5893-48c5-bc20-b7120ad415e7'),
  -- 熬夜加班 52f0659d-2aac-4533-87c5-04a07cf529a4
  ('d4e2774f-a63b-46f2-8a04-28a919078a0b', NULL, '护眼脆',     10, 'global', true, '52f0659d-2aac-4533-87c5-04a07cf529a4'),
  ('03f9838d-7b92-4323-8530-ad122495c92b', NULL, '黑芝麻丸',   20, 'global', true, '52f0659d-2aac-4533-87c5-04a07cf529a4'),
  ('dad6800f-5584-4f2d-9b04-17736e1406b1', NULL, '熬夜轻脆',   30, 'global', true, '52f0659d-2aac-4533-87c5-04a07cf529a4'),
  ('52f7e290-a17c-49b0-a2b9-9fed22c8cbc0', NULL, '护眼冻干',   40, 'global', true, '52f0659d-2aac-4533-87c5-04a07cf529a4')
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 第6步：把现有 48 款食疗商品按「真实食疗属性」归位到二级（sub_category_id）
--   仅填 sub_category_id，不动 category_id（一级场景保持不变）。
-- =====================
-- 宝宝零食
UPDATE public.products SET sub_category_id = '0d86c3a1-c2b5-41e5-9f6f-3d088ecd853b' WHERE id IN ('9edd06fc-5087-4427-b957-fd8012d06e69','7346ba00-2698-4b6d-b1be-9b21ba0e9482'); -- 溶豆·奶片
UPDATE public.products SET sub_category_id = '23dee2fd-caaf-435a-bf88-662582f35d4b' WHERE id IN ('57d737c8-4b4d-4bb1-9c10-b1ce0e9212bf','0479342c-3157-4123-ac35-8aebb40f05fe','8502cef9-a834-478f-b506-b433e282d0ec'); -- 磨牙脆饼
UPDATE public.products SET sub_category_id = '22195875-a206-4a6f-b02d-3e4b03d00f58' WHERE id IN ('03600803-38cc-4f1f-9c2d-d141087ab2f3'); -- 果蔬脆
-- 孕产营养
UPDATE public.products SET sub_category_id = '7d7a4d8c-40e4-42f8-9de3-0ca1b2a7c90f' WHERE id IN ('f23df4fc-b14d-4442-b51e-2faf48118569','a1095d8f-dec9-4daf-9432-60b598d7be75'); -- 轻养糕点
UPDATE public.products SET sub_category_id = '11e9a458-9d01-431a-b1d8-14e55ba86d11' WHERE id IN ('9acfea88-677a-4266-97ac-045623002604','06fd4bed-0cd1-4908-b723-e5dc76b51e0e','796a37eb-98d5-4314-ae95-212d35af5d9a'); -- 坚果谷物脆
UPDATE public.products SET sub_category_id = '446bcbcd-82ca-4d6e-b292-6c2c03ac0626' WHERE id IN ('290409c3-b8ef-412f-82bd-bd5266b1056b'); -- 冻干滋补
-- 老年养生
UPDATE public.products SET sub_category_id = 'ca42b285-0d25-47fb-b0ee-df3d6ac56a9e' WHERE id IN ('1fbcc34b-f83e-489e-acc0-df755f54aaa2','73acc64b-0bdb-4f81-9c82-fcf13224596b'); -- 低糖糊羹
UPDATE public.products SET sub_category_id = 'f460b6d5-1776-48ed-b4bf-53f117f9876a' WHERE id IN ('ff10425f-0d06-4490-ab4f-e56bffad0db8','dc78b7b0-ab88-46c2-88e2-ae45d7e6b921'); -- 软糯糕点
UPDATE public.products SET sub_category_id = '97247c46-6fb7-40ef-a8a8-c0f413cd99b7' WHERE id IN ('b8621574-3cb8-4481-bbf9-8f20a4f3ced6'); -- 坚果谷物
UPDATE public.products SET sub_category_id = '4bc0f199-17e5-46b9-a913-2cf71b65f572' WHERE id IN ('da0118fb-e23d-40b4-956d-d96bebee68af'); -- 润燥冻干
-- 舒心食养
UPDATE public.products SET sub_category_id = 'fe3acf00-646e-4b47-b865-f87cade92ed8' WHERE id IN ('84814577-2721-4096-a9d1-3eeff9c86c08','105c71ae-88d7-4fd6-a0ec-870a1111f1d6'); -- 安神糕点
UPDATE public.products SET sub_category_id = '28a40ce6-7517-40a4-93dd-2a293cb0f3b2' WHERE id IN ('ac6a0ffd-d3d9-403c-b699-1da22e1f8451'); -- 黑芝麻丸
UPDATE public.products SET sub_category_id = 'e60ec5d4-8ab0-4201-abe0-80bc953a0d61' WHERE id IN ('f718c31b-f8e0-4fee-b4c3-95d2214bf3c5','0c3596e9-0bc1-4120-98cc-5bcbb8bcd38e'); -- 冻干温润
UPDATE public.products SET sub_category_id = '9ce5d4b4-9232-401c-8fb5-4bb4994f5722' WHERE id IN ('24bd383c-52cb-4c17-91b7-ab108d0984ad'); -- 暖养脆
-- 肠胃食养
UPDATE public.products SET sub_category_id = 'e083699d-cfa3-4c1d-bcbd-3314e6797d1c' WHERE id IN ('96c86224-f29c-47b4-8b95-13827eb4a1bb','2095a82e-30bc-4e5c-a274-201ac5d8fc0c','b0c4325e-8f52-4f2d-97e6-bbb6b383c729'); -- 消食含片
UPDATE public.products SET sub_category_id = '916a8720-f4c6-41c2-a3b2-dcd12b8baf9f' WHERE id IN ('86954e91-2e6c-4e8c-bbb5-bb31773fd793','3d07ecdf-f829-423a-beca-06640a815e0b'); -- 养胃薄脆
UPDATE public.products SET sub_category_id = '379093cc-f3cc-4730-900e-ee8f0903e283' WHERE id IN ('ee6ef7fe-0858-4d55-b0d6-8821a08c9a59'); -- 暖胃粥羹
-- 温润食养
UPDATE public.products SET sub_category_id = 'f7007cc7-c91b-47d0-85eb-ceec016c2dbd' WHERE id IN ('225663dd-f659-4132-9faa-3397165e9155','ce938bbf-8d40-4691-9c58-a33c00610134'); -- 润养含片
UPDATE public.products SET sub_category_id = 'cd01f7a7-c0fc-4bfb-ad8b-b04e3274622a' WHERE id IN ('125c17ba-f8cf-41bf-b956-1b592201e9d0','a838c39a-c067-427f-bcca-33f4c2a55e9a'); -- 温润糕点
UPDATE public.products SET sub_category_id = 'dff3697d-4e08-4a63-976b-19d1bbdd4460' WHERE id IN ('1eea5aba-7c77-426d-893c-6e31fc6c976f'); -- 山药脆
UPDATE public.products SET sub_category_id = 'b3585301-890a-4f18-b8a5-7e4fd389b4f3' WHERE id IN ('9bf6d7b6-7540-4799-82d9-6fd97e4957ce'); -- 冻干温润
-- 敏感防护
UPDATE public.products SET sub_category_id = 'e780c1af-e3b2-4351-bd8e-fa5130dc5628' WHERE id IN ('d7796cef-0b39-457e-94d5-b8cdc699d161','0ae2817e-67ca-4196-b2dd-1fce30e191c7','e1088425-f131-43d8-abc5-aefa51b0b452'); -- 纯净单品脆
UPDATE public.products SET sub_category_id = 'd30fe164-94fa-4d9d-9829-51bb4d4ae57a' WHERE id IN ('f06c72d6-579b-4c82-8745-addcc291789d'); -- 无麸质米脆
UPDATE public.products SET sub_category_id = '50d1c79c-ebc6-44cc-9408-e738e7203cf9' WHERE id IN ('e5707f00-cc3c-461c-9b36-489354259b4a','c62eb439-b10a-4355-97a3-77fe03f829a9'); -- 坚果椰脆
-- 熬夜加班
UPDATE public.products SET sub_category_id = 'd4e2774f-a63b-46f2-8a04-28a919078a0b' WHERE id IN ('07452c6d-eee5-45b4-90b4-f01064403e35','6e16a6c7-a4f5-451c-b1b8-2452b484bbcd'); -- 护眼脆
UPDATE public.products SET sub_category_id = '03f9838d-7b92-4323-8530-ad122495c92b' WHERE id IN ('5aaab8d4-ea1a-46fd-8e9b-305ad2629965'); -- 黑芝麻丸
UPDATE public.products SET sub_category_id = 'dad6800f-5584-4f2d-9b04-17736e1406b1' WHERE id IN ('9f7e98c7-5aec-4ab3-9430-4dbd12687b72','f259918f-33ed-4c8f-8a23-28784f4c4912'); -- 熬夜轻脆
UPDATE public.products SET sub_category_id = '52f7e290-a17c-49b0-a2b9-9fed22c8cbc0' WHERE id IN ('c7afe162-f2ab-4a35-858d-60bb7012998e'); -- 护眼冻干

-- =====================
-- 第7步：校验（应看到 8 个一级 + 28 个二级；一级 parent_id 为空）
-- =====================
SELECT p.name AS parent_name,
       c.name AS child_name,
       c.sort_order,
       c.is_active
FROM public.store_categories c
JOIN public.store_categories p ON p.id = c.parent_id
WHERE c.scope = 'global' AND p.scope = 'global'
ORDER BY p.sort_order, c.sort_order;
