-- =============================================================
-- 00060 补建 profiles.cv_total / tb_balance
-- ------------------------------------------------------------
-- 漏洞修复：00054 的 fn_void_emotion_claim / fn_ban_user_rollback /
-- fn_total_cv 大量引用这两列，但此前任何迁移都未创建它们
-- （grep 全 migrations 仅 00054 引用，无 CREATE）。不补建则
-- 函数虽能创建成功，调用时必报 "column cv_total does not exist"。
-- 类型对齐 00054：cv_total numeric(12,4) / tb_balance numeric(12,2)
-- 幂等可重复执行。
-- =============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cv_total   numeric(12,4) NOT NULL DEFAULT 0;  -- 个人累计贡献值(CV)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tb_balance numeric(12,2) NOT NULL DEFAULT 0;  -- 情绪通宝余额(独立账户)

COMMENT ON COLUMN public.profiles.cv_total
  IS '个人累计贡献值(CV)：情绪确权/裂变附加分累加，封禁时清零(§5.2)';
COMMENT ON COLUMN public.profiles.tb_balance
  IS '情绪通宝余额(独立账户)：回滚时按退款比例扣减';

SELECT '✅ 00060 完成：profiles 已补 cv_total / tb_balance' AS result;
