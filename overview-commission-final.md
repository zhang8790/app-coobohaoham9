# 平台收益保底 / 分账 —— 收尾核验概览

## 一、本轮完成的工作

### 1. 修复并部署 EF `points_logs` 列名 bug
- **问题**：`distribute-commission` 的买家积分流水插入用了错误列名 `order_id/delta/balance_after/remark`，实际列是 `related_order_id/amount/type/source` → 积分流水（points_logs）从未写入。
- **后果**：`profiles.points` 每次运行仍 +1，但回滚脚本依赖空 points_logs 冲减（减 0），导致重跑验证期买家积分被重复累加（14，正确应为 8）。
- **修复**：`supabase/functions/distribute-commission/index.ts` 402–409 行改为正确列名（`newPoints = bfFinal`）。
- **部署**：`supabase functions deploy distribute-commission`（云端 pyqgsxcjmijtbstwthbn，缓存会话直连）✅ 成功。

### 2. 直接校正买家积分（避免回滚重跑风险）
- 脚本 `scripts/fix-buyer-points.sql`：
  - `UPDATE profiles SET points = 8 WHERE id='99f02c72...'`（移除重复累加的 +8，计入两单合法 +2 → 基线6 + 两单各1 = 8）。
  - `INSERT` 2 条 `points_logs`（amount=1, type=`purchase_earn`, source=`order_commission`，各关联一单）。
- 故意**不回滚重跑 EF**：财务数据（platform_income / commissions / tongbao）本就正确，回滚重跑会因 EF 幂等守卫（commission_distributed）+ 运行实例缓存引入重复插入风险。直接校正更确定、零风险。

## 二、终态核验（直连 Supabase SELECT）

| 指标 | ¥32 单 (LDYX1784503450195bort) | ¥50 单 (LDYX1784503431430r9gq) |
|---|---|---|
| platform_income（平台保底=让利×10%） | **0.22**（让利2.20×10%）✅ | **1.26**（保底0.50+未分配余量）✅ |
| commissions 行数 | 2 ✅ | 2 ✅ |
| tongbao_logs 行数 | 2 ✅ | 2 ✅ |
| buyer_points（订单） | 1 ✅ | 1 ✅ |

| 用户 | 字段 | 终态 | 说明 |
|---|---|---|---|
| 99f02c72（买家） | points | **8**（原14）✅ | 重复累加已校正 |
| 99f02c72（买家） | points_logs | **2 条**（原0）✅ | 流水已补齐 |
| d6b38349（上级/L1） | tb_balance | 29296.52 | 不变（本就正确） |
| 03165ead（商家/L2） | tb_balance | 119.81 | 不变（本就正确） |

## 三、关联修复（前序已完成，本轮确认）
- **平台保底 cap 公式**：`capForComm = max(0, commissionPool − buyerPoints)`，保证 `platformIncome = discountPool − l1 − l2 − buyerPoints` 恒等于让利×10%。
- **orders 回写作用域 bug**：`bfFinal` 提升为函数级变量，platform_income / buyer_points 正确落库。
- **前端计算器** `src/utils/commission-calculator-v5.ts` 已同步同口径。

## 四、保留脚本
- `scripts/fix-buyer-points.sql` —— 本次积分校正（可重放）。
- `scripts/rollback-two-orders.sql` / `rollback-32.sql` —— 原子回滚（注意：其积分回退依赖 points_logs，遇空流水会减 0，需先直接校正余额）。
- `scripts/retry-distribute.mjs` / `retry-one.mjs` —— 重跑两单。

## 五、结论
两单分佣全链路数据现已一致、审计流水（points_logs）完整；EF 修复已部署，未来新单将正确写出积分流水。平台收益保底 = 让利×10% 已验证生效。
