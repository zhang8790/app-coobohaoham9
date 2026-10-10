-- ============================================================================
-- 00094: 恢复「门店 owner 可写自己门店商品的情绪标签」能力
-- 背景：00081 生产 RLS 加固将 product_emotion 写策略退化为仅 is_admin()，
--       导致普通商家在「情绪编译工作台」保存五维标签/食养成分/编译分时被 RLS 拒绝。
-- 关联链：product_emotion.product_id → products.id → products.store_id → stores.owner_id
-- 修复：在保留「公开读 + 管理员全权」的前提下，新增「门店 owner 可写自己商品关联的
--       product_emotion 行」策略。
-- ============================================================================

-- 门店 owner 写策略：通过 product_id → products.store_id → stores.owner_id 校验归属
CREATE POLICY rls81_product_emotion_merchant_write ON public.product_emotion
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_emotion.product_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_emotion.product_id
        AND s.owner_id = auth.uid()
    )
  );

SELECT '✅ 00094 完成：门店 owner 已可写入自己商品关联的 product_emotion 行' AS result;
