# 修复概述：二级佣金与购买者确权积分缺失

## 问题
用户截图反馈订单 `LDYX1784503450195bort`（买家 123，成交额 ¥32）在管理后台显示：
- 二级佣金：¥0
- 购买者确权积分：¥0

但买家 123 存在二级上线（张林的上线「凌云一笑」）。

## 根因
1. 2026-07-19 23:23–23:24 两单纯金豆订单（¥32、¥50）在 `create-order` 后，`distribute-commission` Edge Function 静默崩溃，导致 `orders.commission_distributed` 一直为 `false`。
2. 00135 兜底补发脚本只补了 L1 佣金，**遗漏了 L2 佣金和买家确权积分**。
3. 00136 去重回收脚本因 `tongbao_logs.type` CHECK 约束不含 `commission_revoke` 而执行失败，造成旧记录重复、状态混乱。

## 修复动作
1. 修正 `supabase/migrations/00136_reconcile_00135_double_exec.sql`：扩展 `tongbao_logs_type_check` 加入 `commission_revoke`，成功去重并回收多发的 0.89 金豆。
2. 新建 `supabase/migrations/00137_reconcile_l2_buyer_points_part1.sql`：清理两单旧 `commissions`/`tongbao_logs`（保留 `commission_revoke` 审计）、`points_logs`，并重置订单分佣状态。
3. 新建 `supabase/migrations/00137_reconcile_l2_buyer_points_part2.sql`：从 `commissions` 聚合回写 `orders.l1_commission`、`l2_commission`、`buyer_points`、`platform_income`；补 `points_logs` 并给买家 `profiles.points +2`。
4. 新建 `scripts/retry-distribute.mjs`：用 anon key 直接调用 `distribute-commission` v5 Edge Function，对两单重新完整分佣。

## 结果
| 订单 | 成交额 | 让利池 | 一级佣金 | 二级佣金 | 购买者确权积分 | 平台收益 |
|---|---|---|---|---|---|---|
| LDYX1784503450195bort | ¥32 | ¥2.20 | ¥0.90 | ¥0.30 | 1 | ¥0.00 |
| LDYX1784503431430r9gq | ¥50 | ¥5.00 | ¥2.07 | ¥0.68 | 1 | ¥1.26 |

- 二级上线「凌云一笑」金豆余额：118.21 → 119.87
- 买家 123 积分：2 → 6（含其他来源）
- `commissions`、`tongbao_logs`、`orders` 字段已对齐，无重复记录

## 注意
原前端显示「一级佣金 ¥0.7」是 00135 被重复执行导致的（0.35 × 2）。去重并按 v5 算法重算后，订单 1 的一级佣金正确值为 **¥0.90**。

## 待跟进
- 若后续还有 00135 之前未完整分佣的历史订单，可复用 `scripts/retry-distribute.mjs` 批量处理。
- 建议检查 `distribute-commission` 云端部署版本是否与本地 v5 源码一致（本次发现 `orders.buyer_points` 与 `points_logs` 未由 EF 写入，已在 00137 中手动回补）。
