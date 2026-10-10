-- 00132 首页「江湖动态」：实时下单脱敏聚合（绕过 orders RLS，官方公告 + 下单动态合并轮播）
-- 设计：SECURITY DEFINER 只读视图函数，返回脱敏数据（昵称首字 + ***），符合 PIPL。
-- 授权 anon，使未登录用户首页也能看到「有人刚下单」的社交证明。

create or replace function get_recent_order_feed(p_limit int default 20)
returns table (
  id uuid,
  masked_name text,
  store_name text,
  product_name text,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    o.id,
    coalesce(left(p.nickname, 1) || '***', '某侠客') as masked_name,
    s.name as store_name,
    coalesce(oi.pn, '好物') as product_name,
    o.total_amount as amount,
    o.created_at
  from orders o
  left join profiles p on p.id = o.user_id
  left join stores s on s.id = o.store_id
  left join lateral (
    select oi2.product_name as pn
    from order_items oi2
    where oi2.order_id = o.id
    order by oi2.created_at asc
    limit 1
  ) oi on true
  where o.status in ('pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed')
  order by o.created_at desc
  limit p_limit;
end;
$$;

grant execute on function get_recent_order_feed(int) to anon, authenticated;
