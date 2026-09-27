-- ============================================================
-- 20260927_cleanup_unclassified_products.sql
-- 【可选 · 手动执行】清理未归类商品（57 款，不属于 8 大食疗场景）
--
-- ⚠️ 本文件为「手动可选」脚本，请勿随常规迁移批量自动运行。
--    推荐在 Supabase Dashboard → SQL Editor 中分段执行：
--      第 1 段「预览」→ 确认数量与名单 → 第 2 段按需开启对应 DELETE。
--
-- 数据背景（2026-09-27 实测）：
--   线上 products 共 105 款；其中 48 款落在 8 大食疗场景（已在
--   20260927_add_category_parent.sql 中归位到二级分类）。
--   其余 57 款不属于 8 大场景：45 款 food + 12 款 gift。
--   这 57 款全部 main_image 为空，包含三类：
--     · OCR 脏数据（识别残留，重复出现）
--     · 【待录入】未完成占位（review_status=pending）
--     · 偏离「药食同源食疗」定位的普通零食/饮料（真实但不符合品牌定位）
--
-- 设计原则（防误伤）：
--   ① gift 类（礼品店真礼品，共 12 款）一律不动；
--   ② 仅 product_kind='food' 且明确为垃圾 / 偏离定位才处理；
--   ③ 删除条件用「名称 / 状态 / 类型 / 是否离场」判定，不 hardcode 57 个 UUID，
--      避免误删未来新增的真实商品；
--   ④ 自带预览段，跑删除前先看清楚要删哪些。
--
-- 8 大场景一级 UUID（用于 T3 判定「离场」）：
--   宝宝零食   689bc729-5e75-4d16-b573-b1861d89d228
--   孕产营养   6ed844cd-7163-4006-b005-6496a0647966
--   老年养生   e1be224c-9d2d-4a85-ba11-d90c77bb02b9
--   舒心食养   a6ae7d58-42f0-43e7-ae73-a968b93ab8a4
--   肠胃食养   ef38bc5b-3749-4404-a1a1-5db3270b9254
--   温润食养   8d545cbf-cf34-4d56-ac43-a35142365298
--   敏感防护   bf890924-5893-48c5-bc20-b7120ad415e7
--   熬夜加班   52f0659d-2aac-4533-87c5-04a07cf529a4
-- ============================================================


-- ============================================================
-- 第 1 段：预览（先跑这段，确认每档要删多少、是哪些）
-- ============================================================
SELECT bucket, cnt FROM (
  -- T1：OCR 脏数据（识别残留，明确安全）
  SELECT 'T1_OCR脏数据'        AS bucket, COUNT(*) AS cnt
  FROM products WHERE name = 'OCR零食'

  UNION ALL
  -- T2：未完成占位（pending + 【待录入】标记）
  SELECT 'T2_待录入占位', COUNT(*)
  FROM products
  WHERE review_status = 'pending' AND name LIKE '%【待录入】%'

  UNION ALL
  -- T3：偏离食疗定位的普通零食/饮料（food 且离场 8 大场景且已上架）
  SELECT 'T3_偏离定位真零食', COUNT(*)
  FROM products
  WHERE product_kind = 'food'
    AND category_id NOT IN (
      '689bc729-5e75-4d16-b573-b1861d89d228',
      '6ed844cd-7163-4006-b005-6496a0647966',
      'e1be224c-9d2d-4a85-ba11-d90c77bb02b9',
      'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4',
      'ef38bc5b-3749-4404-a1a1-5db3270b9254',
      '8d545cbf-cf34-4d56-ac43-a35142365298',
      'bf890924-5893-48c5-bc20-b7120ad415e7',
      '52f0659d-2aac-4533-87c5-04a07cf529a4'
    )
    AND review_status = 'approved'
) x
ORDER BY bucket;

-- 查看 T1+T2 明细（明确垃圾，建议删除；可核对无误再开 DELETE）
SELECT id, name, product_kind, review_status, category_id
FROM products
WHERE name = 'OCR零食'
   OR (review_status = 'pending' AND name LIKE '%【待录入】%')
ORDER BY name;

-- 查看 T3 明细（业务决策，确认确为"非药食同源真零食"再开启）
SELECT id, name, product_kind, review_status, category_id
FROM products
WHERE product_kind = 'food'
  AND category_id NOT IN (
    '689bc729-5e75-4d16-b573-b1861d89d228',
    '6ed844cd-7163-4006-b005-6496a0647966',
    'e1be224c-9d2d-4a85-ba11-d90c77bb02b9',
    'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4',
    'ef38bc5b-3749-4404-a1a1-5db3270b9254',
    '8d545cbf-cf34-4d56-ac43-a35142365298',
    'bf890924-5893-48c5-bc20-b7120ad415e7',
    '52f0659d-2aac-4533-87c5-04a07cf529a4'
  )
  AND review_status = 'approved'
ORDER BY name;


-- ============================================================
-- 第 2 段：执行（按需开启，默认全部注释）
-- 注意：若 DELETE 因外键（如 order_items / cart 引用）报错，说明这些商品
--       已有订单/购物车记录，请先处理关联数据或改为软删除（如置 review_status='rejected'）。
-- ============================================================

-- T1：OCR 脏数据（明确安全）
-- DELETE FROM products WHERE name = 'OCR零食';

-- T2：未完成占位（pending + 【待录入】标记）
-- DELETE FROM products WHERE review_status = 'pending' AND name LIKE '%【待录入】%';

-- T3（业务决策，默认关闭）：偏离食疗定位的普通零食/饮料
--   仅当上面 T3 明细确认无误、且业务上决定"只留 48 款食疗真品"时再开启。
--   本档只删 food 类，gift 类（12 款真礼品）不受影响。
-- DELETE FROM products
-- WHERE product_kind = 'food'
--   AND category_id NOT IN (
--     '689bc729-5e75-4d16-b573-b1861d89d228',
--     '6ed844cd-7163-4006-b005-6496a0647966',
--     'e1be224c-9d2d-4a85-ba11-d90c77bb02b9',
--     'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4',
--     'ef38bc5b-3749-4404-a1a1-5db3270b9254',
--     '8d545cbf-cf34-4d56-ac43-a35142365298',
--     'bf890924-5893-48c5-bc20-b7120ad415e7',
--     '52f0659d-2aac-4533-87c5-04a07cf529a4'
--   )
--   AND review_status = 'approved';
