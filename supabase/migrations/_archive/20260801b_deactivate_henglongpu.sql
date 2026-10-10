-- 20260801b 停用测试门店「横笼铺」
-- 该门店坐标为杭州中心点占位值(30.2741,120.1551)，定位失败兜底到杭州中心时
-- 会被算成「0km 最近门店」误导用户、并抢最近门店。属测试数据，正式环境停用。
-- 与 20260801 迁移一并执行（均在 Supabase 后台 SQL 编辑器跑）。

update public.stores
   set is_active = false
 where name = '横笼铺';

-- 备注：若后续误停用真实门店，改回 true 即可：
-- update public.stores set is_active = true where name = '横笼铺';
