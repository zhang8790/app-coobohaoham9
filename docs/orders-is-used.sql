-- 订单增加「是否已使用」标记，用于情绪确权闸门（使用前不可确权）
-- 在 Supabase Dashboard → SQL Editor 中执行整段。
alter table orders
  add column if not exists is_used boolean not null default false;

alter table orders
  add column if not exists used_at timestamptz;

-- 验证：应能看到 is_used / used_at 两列
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'orders'
  and column_name in ('is_used', 'used_at');
