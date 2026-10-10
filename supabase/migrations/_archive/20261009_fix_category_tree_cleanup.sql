-- ============================================================
-- 20261009_fix_category_tree_cleanup.sql
-- 修正 20261009 迁移的两处问题（幂等，可重复执行）：
--
-- 问题1：第4步按「名字」下架旧场景类目时，误伤了同名的新二级「孕产营养」
--        （它本应作为 生鲜辅食 的二级子类保留，且 6 个产品已预归类到它名下）。
--        这里按 id 精准重新激活新的二级「孕产营养」，让那 6 个产品恢复可见。
--
-- 问题2：旧「场景/人群」一级类目（宝宝零食/舒心食养/熬夜加餐…）整体下架后，
--        它们底下还残留一批自动生成的「商品型」二级（护眼脆/黑芝麻丸/山药脆/
--        消食含片…），产品数全 0、父级已 inactive，在 C 端不显示但污染分类树。
--        这里把「父级属于旧场景一级」的遗留二级统一下架（不删除=可逆）。
--
-- 使用方式：supabase db query --linked --file supabase/migrations/20261009_fix_category_tree_cleanup.sql
-- ⚠️ 不删任何数据，仅改 is_active。
-- ============================================================

-- =====================
-- 第1步：按 id 重新激活新的二级「孕产营养」（生鲜辅食下，id 固定）
-- =====================
UPDATE public.store_categories
SET is_active = true
WHERE id = 'd1000000-0000-0000-0000-000000000052';

-- =====================
-- 第2步：下架「父级是旧场景一级」的遗留商品型二级（产品数 0，可逆）
-- =====================
UPDATE public.store_categories c
SET is_active = false
WHERE c.parent_id IN (
  SELECT id FROM public.store_categories
  WHERE scope = 'global'
    AND name IN (
      '宝宝零食','孕产营养','老年养生','银发呵护','舒心食养','睡前安适','肠胃食养','肠胃养护',
      '温润食养','体虚调理','敏感防护','熬夜加餐','熬夜加班','熬夜党'
    )
)
AND c.id != 'd1000000-0000-0000-0000-000000000052'; -- 保护新的二级孕产营养（其父是生鲜辅食，本就不会命中；双保险）

-- =====================
-- 校验：active 一级 + 其 active 二级（应只剩大厂标准品类树）
-- =====================
SELECT
  CASE WHEN c.parent_id IS NULL THEN '【一级】' ELSE '  └二级' END AS level,
  c.name,
  c.sort_order,
  (SELECT count(*) FROM public.products p WHERE p.category_id = c.id) AS product_count
FROM public.store_categories c
WHERE c.scope = 'global' AND c.is_active = true
ORDER BY c.parent_id NULLS FIRST, c.sort_order;
