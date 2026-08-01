-- =====================================================================
-- P1 门店定位查询抗压：候选门店索引
-- 背景：getNearestStores 每次定位都 SELECT 全量 stores 再客户端算距离。
--       门店规模增长后全表顺序扫描会拖慢；补 (is_active, lat, lng) 索引，
--       让「活跃 + 有坐标」的候选拉取走索引，避免 seq scan。
-- 注：距离排序仍在客户端做（ranking 用，无需 DB 侧 earthdistance），
--     本索引只加速候选集的过滤与拉取。幂等。
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_stores_active_geo
  ON public.stores (is_active, lat, lng);

COMMENT ON INDEX public.idx_stores_active_geo IS
  'getNearestStores 候选门店拉取：加速 活跃+坐标 过滤，避免大表顺序扫描（扛门店规模增长）';
