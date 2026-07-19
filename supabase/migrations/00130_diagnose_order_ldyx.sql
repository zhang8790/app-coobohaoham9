-- ============================================================
-- 诊断订单 LDYX1784473763930vg7h 的分佣状态
-- 用途：确认「未分佣」是部署缺口还是数据/绑定问题
-- 在 Supabase Dashboard → SQL Editor 执行（service_role 权限，绕过 RLS）
--
-- 说明：LDYX... 是小程序端生成的本地单号，可能落在 orders.order_no
--       或 orders.parent_order_no（create-order EF 内部会再生成 ORD-xxx）。
--       本脚本两种都匹配；佣金记录用 order_id 关联，避免 order_no 格式差异。
-- ============================================================

-- 1) 订单本体：分佣标记 + 推荐人链
select
  o.order_no,
  o.parent_order_no,
  o.id,
  o.total_amount,
  o.payment_method,
  o.status,
  o.commission_distributed,
  o.referrer_id,
  b.nickname   as buyer_name,
  b.phone      as buyer_phone,
  s.name       as store_name
from orders o
left join profiles b on b.id = o.user_id
left join stores  s on s.id = o.store_id
where o.order_no = 'LDYX1784473763930vg7h'
   or o.parent_order_no = 'LDYX1784473763930vg7h'
   or o.order_no like '%vg7h%'
   or o.parent_order_no like '%vg7h%'
order by o.created_at desc
limit 20;

-- 2) 该订单是否有佣金发放记录（用 order_id 关联，避开 order_no 格式差异）
select
  c.order_id,
  c.level,
  c.beneficiary_id,
  c.commission_amount,
  c.status,
  c.net_amount
from commissions c
join orders o on o.id = c.order_id
where o.order_no = 'LDYX1784473763930vg7h'
   or o.parent_order_no = 'LDYX1784473763930vg7h'
   or o.order_no like '%vg7h%'
   or o.parent_order_no like '%vg7h%';

-- 3) 若第1步查到 referrer_id 非空，检查上级 profile 是否存在 + 其作为 referrer 的成交数
--    （决定 activeMult 是否 > 0：activeMult=0 会导致 L1 佣金=0，但订单仍会被标"已分佣"）
--    把第1步查到的 referrer_id 填到下方 'PUT_REFERRER_ID_HERE' 后取消注释执行
/*
select
  p.id,
  p.nickname,
  p.tb_balance,
  (select count(*) from orders r
     where r.referrer_id = p.id
       and r.created_at >= now() - interval '60 day'
       and r.status in ('pending_ship','shipped','completed','pending_pay')
  ) as ref_orders_last60d
from profiles p
where p.id = 'PUT_REFERRER_ID_HERE';
*/
