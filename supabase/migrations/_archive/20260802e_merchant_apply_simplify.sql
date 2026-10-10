-- 20260802e_merchant_apply_simplify.sql
-- P7 自营门店申请：去掉跨类目的「联系人姓名/经营类型/简介」三个敏感字段
-- 申请页精简为「门店名称 + 联系人手机号 + 门店地址」三字段
-- 老数据保留（contact_name/business_type 允许 NULL 不破坏历史行），新申请不再写入

ALTER TABLE public.merchant_applications
  ALTER COLUMN contact_name DROP NOT NULL,
  ALTER COLUMN business_type DROP NOT NULL;
