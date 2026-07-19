-- 最近 15 笔订单的分佣全景（无需订单号，复制即跑）
-- 只读，安全。把 NOTICE 里的表格结果贴回给我即可。
select
  o.order_no,
  o.total_amount,
  o.tb_used,
  o.status,
  o.commission_distributed,
  o.referrer_id,
  p.nickname as 推荐人昵称,
  (select count(*) from commissions c where c.order_id = o.id) as 佣金行数,
  (select coalesce(sum(c.commission_amount),0) from commissions c where c.order_id = o.id) as 佣金总额,
  o.created_at
from orders o
left join profiles p on p.id = o.referrer_id
order by o.created_at desc
limit 15;
