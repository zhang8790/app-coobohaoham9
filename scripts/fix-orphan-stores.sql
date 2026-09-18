-- 修复「申请已通过但门店未落」的历史孤儿（2026-09-18）
--
-- 前置：先执行迁移 supabase/migrations/00142_self_open_store.sql
--       （它提供 fn_open_store_for_user / fn_self_open_store）
--
-- 语义：按每个账号「已通过」的开店申请物化门店 ——
--       同名且无主（owner_id IS NULL）的门店优先认领，否则新建；
--       随后写 store_staff(role=owner, is_active=true)，把 merchant_status 对齐为 approved。
--       幂等：重复执行不会重复建店（已有归属门店时直接返回 already=true）。

-- 1) 修复这两个账号（18701410500 = 乐悠悠 / 张林水果店；18565613635 = 凌云一笑 / 巫山烤鱼）
select
  p.phone,
  p.nickname,
  public.fn_open_store_for_user(p.id) as 开通结果
from public.profiles p
where p.phone in ('18701410500', '18565613635')
order by p.phone;

-- 2) 复核：确认门店已真正挂到 owner 名下（linked_store_name 不再为空才叫修好）
select
  p.phone,
  p.nickname,
  p.merchant_status,
  a.status        as 申请状态,
  a.store_name    as 申请店名,
  s.name          as 已挂门店,
  s.id            as store_id,
  s.owner_id      = p.id as owner已落
from public.profiles p
left join public.merchant_applications a on a.user_id = p.id
left join public.stores s on s.owner_id = p.id
where p.phone in ('18701410500', '18565613635')
order by p.phone, a.created_at desc;

-- 3) 全量扫描：还有多少个「已通过但无门店」的账号（> 0 说明存在其他同类孤儿）
--    确认无误后，把下面注释里的 select 改成循环即可一次修完（先看清名单再动手）。
select
  a.user_id,
  a.store_name as 申请店名,
  a.created_at as 申请时间
from public.merchant_applications a
where a.status = 'approved'
  and not exists (select 1 from public.stores s where s.owner_id = a.user_id)
order by a.created_at;

-- 需要批量修复时执行（幂等，可重复执行）：
-- select a.user_id, a.store_name, public.fn_open_store_for_user(a.user_id) as 开通结果
-- from public.merchant_applications a
-- where a.status = 'approved'
--   and not exists (select 1 from public.stores s where s.owner_id = a.user_id);

-- 4) 补齐 profiles.role='merchant'（必须在 00142 的 user_role 枚举补值**提交之后**执行）
--    历史原因：线上 user_role 枚举缺 'merchant'，admin-web / 小程序所有
--    profiles.role='merchant' 的写入都报 22P02 被静默吞掉 → 后台「已有自营门店身份」
--    徽章永不显示、商家身份无法在 role 上体现。这里为「申请已通过」的账号一次性补回。
update public.profiles
   set role = 'merchant'
 where merchant_status = 'approved'
   and role = 'user';

-- 复核 role 补值结果
select role, count(*) as 账号数
from public.profiles
group by role
order by role;
