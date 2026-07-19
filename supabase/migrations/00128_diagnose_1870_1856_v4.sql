-- 00128 诊断：1870(下级) 的订单 referrer=1856(上级) 但 1856 没收到佣金
-- 用途：跑完看 NOTICE，定位是「函数没跑 / activeMult=0 / referrer 漂移」哪一关
-- 账号：1856=03165ead-8fef-46c4-8f57-bc5a905ac716  1870=d6b38349-dded-4879-9eac-3165a646436a
do $$
declare
  v_1856_id uuid := '03165ead-8fef-46c4-8f57-bc5a905ac716';
  v_1870_id uuid := 'd6b38349-dded-4879-9eac-3165a646436a';
  v_ord record;
  v_l1_cnt int;
  v_l1_amt numeric;
  v_ref60 int;
  v_tb numeric;
  v_cb numeric;
begin
  raise notice '===== 1) 1870 的订单：referrer_id / status / 分佣标记 =====';
  for v_ord in
    select id, order_no, referrer_id, status, commission_distributed, total_amount, tb_used
    from orders where user_id = v_1870_id order by created_at desc limit 10
  loop
    raise notice 'order_no=%  referrer_id=%  status=%  distributed=%  全额=¥%  豆抵扣=¥%',
      v_ord.order_no, v_ord.referrer_id, v_ord.status, v_ord.commission_distributed,
      v_ord.total_amount, v_ord.tb_used;
  end loop;

  raise notice '===== 2) 1870 订单对应的 commissions 行（谁拿到了佣金） =====';
  select count(*), coalesce(sum(c.commission_amount),0)
    into v_l1_cnt, v_l1_amt
  from commissions c
  join orders o on o.id = c.order_id
  where o.user_id = v_1870_id;
  raise notice '1870 订单关联的佣金行数=%  总额=¥%', v_l1_cnt, v_l1_amt;

  raise notice '===== 3) 1856 是否在这些佣金行的 beneficiary 里 =====';
  select count(*)
    into v_l1_cnt
  from commissions c
  join orders o on o.id = c.order_id
  where o.user_id = v_1870_id and c.beneficiary_id = v_1856_id;
  raise notice '1856 作为 beneficiary 的佣金行数=%（0=确实没发给 1856）', v_l1_cnt;

  raise notice '===== 4) 1856 当前余额（情绪豆 / 旧佣金列） =====';
  select tb_balance, commission_balance into v_tb, v_cb
  from profiles where id = v_1856_id;
  raise notice '1856 tb_balance(情绪豆)=¥%  commission_balance(旧)=¥%', v_tb, v_cb;

  raise notice '===== 5) 1856 作为 referrer 的近60天成交单数（决定 activeMult） =====';
  select count(*) into v_ref60
  from orders
  where referrer_id = v_1856_id
    and created_at >= now() - interval '60 days'
    and status in ('completed','pending_ship','pending_receive','pending_review','pending_pickup');
  raise notice '1856 近60天推荐成交单=% → activeMult=%',
    v_ref60, case when v_ref60>0 then '1.0(应发)' else '0(不发！)' end;

  raise notice '===== 6) 1870.referrer_id 是否真的等于 1856.id =====';
  select count(*) into v_ref60 from profiles where id = v_1870_id and referrer_id = v_1856_id;
  raise notice '1870.referrer_id == 1856.id ? %（0=绑定仍漂移）', v_ref60;

  raise notice '===== 结论速判 =====';
  raise notice 'A. 若第1步 distributed=false → 分佣函数没跑（部署缺口/纯豆未触发）';
  raise notice 'B. 若 distributed=true 且 第3步=0 且 第5步=0 → activeMult=0 把佣金算没了';
  raise notice 'C. 若 第6步=0 → referrer 仍漂移，需重绑 1870→1856';
end $$;
