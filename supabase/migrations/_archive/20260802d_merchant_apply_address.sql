-- 20260802d_merchant_apply_address.sql
-- P7 自营门店申请补 address 字段，审核通过时一并写入 stores
-- 背景：申请页精简到「门店名称 + 联系人手机号 + 门店地址」三字段（之前只有名称/手机），同时去掉业务类型/简介跨类目敏感字段。
-- 注意：merchant_applications 的 RLS 不动（00095/00127 已固化：owner 本人 + admin 全权）。

ALTER TABLE public.merchant_applications
  ADD COLUMN IF NOT EXISTS address text NULL;
