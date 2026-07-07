-- ============================================================
-- 金豆 = 余额：全站统一用户余额字段
-- 产品定义：金豆与余额是同一概念（1 金豆 = 1 元，1:1）
-- 代码层已全部改为读写 gold_beans；本脚本将冗余的 balance 列
-- 同步对齐为 gold_beans 的值，防御任何遗漏读取 balance 的角落。
-- 用法：Supabase SQL Editor → New query → 粘贴 → Run
-- ============================================================

-- 1) 全量同步：让 balance 恒等于 gold_beans
UPDATE public.profiles
SET balance = COALESCE(gold_beans, 0)
WHERE balance IS DISTINCT FROM COALESCE(gold_beans, 0);

-- 2) 验证（看你本人 18701410500）
SELECT phone, gold_beans, balance
FROM public.profiles
WHERE phone = '18701410500';
-- 期望：gold_beans = 1000，balance = 1000
