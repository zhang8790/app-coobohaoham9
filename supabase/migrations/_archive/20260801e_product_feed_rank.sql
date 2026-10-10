-- 20260801e 商品推荐排序引擎（均衡热度榜 v1，通用、无个性化）
-- 设计：服务端计算综合热度分，复用既有有效订单状态与 sales_count，不依赖 view_count（后续可加）。
-- 信号：近期销量(recent_qty) + 上升势头(momentum) + 新鲜度(freshness) + 历史销量基线 + 商家置顶。
-- 权限：SECURITY DEFINER 只读聚合（同 00132 模式），仅返回 product_id + score，授权 anon/authenticated。

-- 1) 商家置顶控制列
alter table public.products
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pin_sort  integer not null default 0;

create index if not exists idx_products_pin on public.products (is_pinned, pin_sort)
  where is_pinned = true;

-- 2) 热度排序 RPC
create or replace function public.fn_product_feed_rank(
  p_store_id    uuid    default null,
  p_limit       integer default 40,
  p_recent_days integer default 30
)
returns table (product_id uuid, score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with recent as (
    select oi.product_id,
           sum(oi.quantity) as recent_qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status::text in ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
      and o.paid_at >= now() - (p_recent_days || ' days')::interval
      and (p_store_id is null or oi.store_id::text = p_store_id::text)
    group by oi.product_id
  )
  select p.id as product_id,
         (
           0.40 * ln(1.0 + coalesce(r.recent_qty, 0)::numeric)                       -- 近期销量（对数压缩，时间窗口天然衰减）
           + 0.20 * least( coalesce(r.recent_qty, 0)::numeric
                           / nullif(greatest(p.sales_count, 0), 0), 1.0)              -- 上升势头 momentum（夹到 [0,1]）
           + 0.25 * (1.0 / (1.0 + extract(epoch from (now() - p.created_at)) / 86400.0)) -- 新鲜度（新品扶持）
           + 0.15 * ln(1.0 + greatest(p.sales_count, 0)::numeric)                    -- 历史销量基线（防纯新品无数据）
         ) as score
  from public.products p
  left join recent r on r.product_id::text = p.id::text
  where p.is_active = true
    and p.stock > 0
    and (p_store_id is null or p.store_id::text = p_store_id::text)
  order by
    (case when p.is_pinned then 0 else 1 end),
    p.pin_sort desc,
    score desc
  limit p_limit;
end;
$$;

grant execute on function public.fn_product_feed_rank(uuid, integer, integer) to anon, authenticated;
