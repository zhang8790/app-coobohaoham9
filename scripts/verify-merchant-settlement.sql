-- ============================================================================
-- 商家货款结算体系 · 本机自检脚本（方案 A）
-- 用途：在用户本机执行 00120 + 00121 迁移后运行，验证「迁移是否生效」+「结算公式是否正确」。
-- 安全：PART A / PART B 均为【只读 + 纯计算】，绝不 INSERT/UPDATE 任何真实业务数据。
-- 运行：Supabase Dashboard → SQL Editor → 粘贴整段 → Run。
-- 说明：本脚本不依赖沙箱，纯在用户自己的 Supabase 库执行（沙箱无 CLI/Token，无法代跑）。
-- ============================================================================


-- ============================================================================
-- PART A：结构存在性检查 —— 回答「迁移 00120 / 00121 真的生效了吗？」
-- 全部应为 t（true）。若有 f，说明对应迁移没跑或没跑全。
-- ============================================================================
SELECT 'stores.merchant_balance'        AS item,
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='stores'        AND column_name='merchant_balance') AS ok
UNION ALL
SELECT 'stores.settlement_frozen',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='stores'        AND column_name='settlement_frozen') AS ok
UNION ALL
SELECT 'stores.wx_sub_mch_id',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='stores'        AND column_name='wx_sub_mch_id') AS ok
UNION ALL
SELECT 'merchant_settlements 表',
       EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='merchant_settlements') AS ok
UNION ALL
SELECT 'merchant_settlements.withdrawal_id',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='merchant_settlements' AND column_name='withdrawal_id') AS ok
UNION ALL
SELECT 'withdrawals.kind',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='withdrawals'   AND column_name='kind') AS ok
UNION ALL
SELECT 'withdrawals.merchant_settlement_ids',
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='withdrawals'   AND column_name='merchant_settlement_ids') AS ok
UNION ALL
SELECT 'RPC fn_settle_order',
       EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_settle_order') AS ok
UNION ALL
SELECT 'RPC fn_merchant_withdraw',
       EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_merchant_withdraw') AS ok
UNION ALL
SELECT 'RPC fn_reverse_settlement',
       EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_reverse_settlement') AS ok
UNION ALL
SELECT 'RPC fn_get_store_settlement',
       EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_get_store_settlement') AS ok
UNION ALL
SELECT '触发器 trg_orders_settle',
       EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_orders_settle') AS ok;


-- ============================================================================
-- PART B：结算公式正确性 —— 回答「fn_settle_order 算出来的货款对不对？」
-- 用虚拟订单做纯 SQL 计算，与迁移里的公式逐字对齐，预期值见每行注释。
-- 公式：
--   cash    = max(0, total - tb_used)
--   rate    = referral_rate > 1 ? referral_rate/100 : referral_rate     -- 单位归一（>1 当百分比）
--   pool    = round(total * rate, 4)                                    -- 让利池（含豆付等值部分）
--   channel = round(cash * 0.006, 4)                                    -- 微信通道费仅现金部分
--   settle  = max(0, round(total - pool - channel, 4))                  -- 应收货款
-- ============================================================================
WITH cases AS (
  SELECT '现金100/让利10%'      AS name, 100.00 AS total, 0.00  AS tb, 10.00 AS rate UNION ALL
  SELECT '豆付5+现金95/让利10%', 100.00,       5.00,        10.00        UNION ALL
  SELECT '纯情绪豆50/让利10%',   50.00,        50.00,       10.00        UNION ALL
  SELECT '让利口径=小数0.09',    100.00,       0.00,        0.09
)
SELECT
  name,
  total,
  tb                            AS tb_used,
  rate                          AS raw_rate,
  round(total * (CASE WHEN rate>1 THEN rate/100 ELSE rate END), 4)                       AS discount_pool,
  round(greatest(0, total - tb) * 0.006, 4)                                              AS channel_fee,
  round(greatest(0, total
       - total * (CASE WHEN rate>1 THEN rate/100 ELSE rate END)
       - greatest(0, total - tb) * 0.006), 4)                                            AS settle_expected
FROM cases;
-- 预期：
--   现金100/让利10%       → pool=10,   channel=0.60, settle=89.40
--   豆付5+现金95/让利10%   → pool=10,   channel=0.57, settle=89.43   （豆付等值计入，平台垫付）
--   纯情绪豆50/让利10%     → pool=5,    channel=0.00, settle=45.00   （无现金，通道费=0）
--   让利口径=小数0.09      → pool=9,    channel=0.60, settle=90.40   （rate≤1 当小数，归一正确）


-- ============================================================================
-- PART C（可选 · 受控端到端）：用「你库里真实已存在的 completed 订单」补跑结算，验证 RPC + 触发器产物
-- ⚠️ 这段会真实写入 merchant_settlements 并累加 merchant_balance，请先在小号/测试库确认无误。
-- ⚠ 取消下方注释前，先把 <你的某个 completed 订单 id> 换成真实值；本段默认注释掉不执行。
-- ============================================================================
-- -- 对一笔已完成但未结算的订单补跑（验证 fn_settle_order 可调 + 台账生成）
-- SELECT public.fn_settle_order('<你的某个 completed 订单 id>'::uuid);
--
-- -- 查看该订单是否生成台账、金额拆分是否正确
-- SELECT order_no, total_amount, tb_portion, cash_portion,
--        referral_rate, discount_pool, channel_fee, settle_amount, status
-- FROM merchant_settlements
-- WHERE order_id = '<你的某个 completed 订单 id>'::uuid;
--
-- -- 查看对应门店货款余额是否累加
-- SELECT s.name, s.merchant_balance
-- FROM stores s
-- JOIN orders o ON o.store_id = s.id
-- WHERE o.id = '<你的某个 completed 订单 id>'::uuid;
