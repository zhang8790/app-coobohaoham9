# 迁移版本号冲突 · 重编号方案

> 关联审计：`合规审查报告.md`（数据库重复章节）
> 工具：`scripts/renumber_migrations.py`（默认 dry-run，需连库自查后才可 `--apply`）

## 一、问题
`supabase/migrations/` 存在 **12 组版本号前缀冲突**（同前缀 2~3 个文件，共 28 个文件），
会导致 `supabase db push` / 迁移应用时版本号冲突，部分表结构可能从未在云端生效。

## 二、冲突清单（12 组 / 28 文件）
| 前缀 | 文件 |
|---|---|
| 00094 | 00094_buyer_order_write_policy.sql · 00094_product_emotion_merchant_write_policy.sql |
| 00107 | 00107_auto_tag_products.sql · 00107_fix_handle_new_user_trigger.sql |
| 00108 | 00108_add_commission_distributed_to_orders.sql · 00108_diagnose_member_rank.sql · 00108_rename_member_ranks.sql |
| 00109 | 00109_create_videos_bucket.sql · 00109_diagnose_1856_1870.sql · 00109_diagnose_1856_1870_v2.sql |
| 00110 | 00110_repair_1856_1870_commission.sql · 00110_repair_1856_1870_v2.sql |
| 00123 | 00123_fix_legacy_tb_used_unit.sql · 00123_saved_withdrawal_accounts.sql |
| 00124 | 00124_add_self_operated_store.sql · 00124_fix_tongbao_logs_balance_after_numeric.sql |
| 00137 | 00137_reconcile_l2_buyer_points_part1.sql · 00137_reconcile_l2_buyer_points_part2.sql |
| 00138 | 00138_fix_get_nearby_products_is_platform.sql · 00138_merchant_path_isolation.sql |
| 00139 | 00139_add_partner_brand_to_nearby.sql · 00139_coupons_table.sql |
| 20260705 | 20260705_fix_user_store_relation_schema.sql · 20260705_update_claim_campaign_with_lock.sql |
| 20260720 | 20260720_add_order_item_commissions.sql · 20260720_add_orders_effective_rate_commission_error.sql · 20260720_order_item_commissions_refund.sql |

## 三、先自查（必须，连库后执行）
在 Supabase SQL Editor 执行，拿到**已应用**的版本号：
```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```
把返回的前缀（如 `00139,00140,00133,00120`）传给脚本 `--applied`。
**已应用的版本保持原号不动**，仅重编号未应用的冲突文件，避免重复执行报错。

## 四、默认重编号映射（未自查时的建议，存在误重编风险，仅供参考）
保留每组首个（字母序），其余编到 00142+ 新区间：

| 原文件 | → 新文件 |
|---|---|
| 00094_product_emotion_merchant_write_policy.sql | 00142_product_emotion_merchant_write_policy.sql |
| 00107_fix_handle_new_user_trigger.sql | 00143_fix_handle_new_user_trigger.sql |
| 00108_diagnose_member_rank.sql | 00144_diagnose_member_rank.sql |
| 00108_rename_member_ranks.sql | 00145_rename_member_ranks.sql |
| 00109_diagnose_1856_1870.sql | 00146_diagnose_1856_1870.sql |
| 00109_diagnose_1856_1870_v2.sql | 00147_diagnose_1856_1870_v2.sql |
| 00110_repair_1856_1870_v2.sql | 00148_repair_1856_1870_v2.sql |
| 00123_saved_withdrawal_accounts.sql | 00149_saved_withdrawal_accounts.sql |
| 00124_fix_tongbao_logs_balance_after_numeric.sql | 00150_fix_tongbao_logs_balance_after_numeric.sql |
| 00137_reconcile_l2_buyer_points_part2.sql | 00151_reconcile_l2_buyer_points_part2.sql |
| 00138_merchant_path_isolation.sql | 00152_merchant_path_isolation.sql |
| 00139_coupons_table.sql | 00153_coupons_table.sql |
| 20260705_update_claim_campaign_with_lock.sql | 00154_update_claim_campaign_with_lock.sql |
| 20260720_add_orders_effective_rate_commission_error.sql | 00155_add_orders_effective_rate_commission_error.sql |
| 20260720_order_item_commissions_refund.sql | 00156_order_item_commissions_refund.sql |

## 五、重编号后必须处理（防重复执行报错）
对重编号文件内含 `CREATE POLICY` / `CREATE TRIGGER` / `CREATE FUNCTION` 的，
在文件顶部补 `DROP ... IF EXISTS` 前置（具体名见脚本 `--plan` 输出的 ⚠ 提示）。

## 六、执行步骤
```bash
# 1) 预览（不改动）
python scripts/renumber_migrations.py --plan --applied <已应用版本逗号分隔>

# 2) 确认映射无误后，真实重命名
python scripts/renumber_migrations.py --apply --applied <已应用版本逗号分隔>

# 3) 连库推送
supabase db push
```
