-- 00135: 兜底补发 + 修 tongbao_logs.delta 列类型
-- 背景：
--   2026-07-19 23:23~23:24，123 在张林水果店连下两单纯金豆订单（¥32 + ¥50），
--   createOrderV2 端 commission_calculated=true 已写入 l1_commission=0.35 / 0.54，
--   但 distribute-commission EF 在 commissions.insert 之前静默崩了，commission_distributed 一直 false，
--   commissions 表 0 行，张林金豆未到账。
-- 顺手修：tongbao_logs.delta 是 integer，0.35 金豆会被强转 0，导致全库历史佣金流水 delta 全部为 0，
--   改 numeric 保留小数（一次性 ALTER，无数据丢失）。

BEGIN;

-- 1) 修列类型：integer → numeric（历史 0 值不受影响）
ALTER TABLE public.tongbao_logs
  ALTER COLUMN delta TYPE numeric USING delta::numeric;

-- 2) 补 commissions 行（Order 1：¥32 → 张林 L1=0.35）
INSERT INTO public.commissions (
  order_id, order_no, beneficiary_id, payer_id, level,
  rank_at_time, ratio, pool_amount, commission_amount,
  b_coef, status, channel_fee, tax_withheld, net_amount, created_at
) VALUES (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  'LDYX1784503450195bort',
  'd6b38349-dded-4879-9eac-3165a646436a',  -- 张林
  '99f02c72-b238-4f76-8817-73b2848d8d65',  -- 123
  1,
  '凡心', 0.40,
  2.20,  -- 让利池（与 admin-web 显示 ¥2.2 一致）
  0.35,
  1.0, 'pending',
  0, 0, 0.35,
  '2026-07-19 23:24:11+00'
);

-- 3) 补 commissions 行（Order 2：¥50 → 张林 L1=0.54）
INSERT INTO public.commissions (
  order_id, order_no, beneficiary_id, payer_id, level,
  rank_at_time, ratio, pool_amount, commission_amount,
  b_coef, status, channel_fee, tax_withheld, net_amount, created_at
) VALUES (
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141',
  'LDYX1784503431430r9gq',
  'd6b38349-dded-4879-9eac-3165a646436a',
  '99f02c72-b238-4f76-8817-73b2848d8d65',
  1,
  '凡心', 0.40,
  5.00,  -- 让利池（admin 显示 ¥5）
  0.54,
  1.0, 'pending',
  0, 0, 0.54,
  '2026-07-19 23:23:52+00'
);

-- 4) 张林金豆到账 +0.89（一次性加总额，原子）
UPDATE public.profiles
SET tb_balance = tb_balance + 0.89
WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a';

-- 5) tongbao_logs 流水（两笔，delta 改 numeric 后可存小数）
INSERT INTO public.tongbao_logs (user_id, order_id, type, delta, balance_after, remark, created_at)
VALUES
  ('d6b38349-dded-4879-9eac-3165a646436a', '322d436a-a1c7-4919-8e08-1f5424e95043',
   'commission_earn', 0.35, 29288.96 + 0.35,
   '订单LDYX1784503450195bort推广佣金（金豆）[00135 兜底补发]', '2026-07-19 23:24:11+00'),
  ('d6b38349-dded-4879-9eac-3165a646436a', '2eefcdee-919b-4eb0-95ce-1a4cf72dc141',
   'commission_earn', 0.54, 29288.96 + 0.89,
   '订单LDYX1784503431430r9gq推广佣金（金豆）[00135 兜底补发]', '2026-07-19 23:23:52+00');

-- 6) 把两单标记 commission_distributed=true + 写回 EF 应写的字段
UPDATE public.orders
SET
  commission_distributed = true,
  channel_fee = 0,
  channel_fee_rate = 0.006,
  tax_withheld = 0
WHERE id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
);

COMMIT;
