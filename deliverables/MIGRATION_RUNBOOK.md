# 待执行数据库迁移 — 执行手册（2026-07-09）

## 背景
盘点发现以下迁移**本地已建、但极可能尚未在远端 Supabase 执行**（沙箱无 token 无法查 `supabase_migration_history`）。本次同时修复了一个 **schema 漏洞**：`00054` 的回滚/封禁函数引用 `profiles.cv_total` / `tb_balance`，但此前任何迁移都未创建这两列 → 新建 `00060` 补丁补齐。

## 清单（14 个，按执行顺序）
| # | 文件 | 作用 | 幂等 |
|---|---|---|---|
| 1 | 00050_add_product_emotion_dimension_fields | product_emotion 补 dimension_tags/quality_score/review_status | ✅ |
| 2 | 00050_lower_rank_thresholds | get_rank_progress 段位阈值下调 | ✅ |
| 3 | 00051_create_emotion_funnel_events | 情绪漏斗埋点表 | ✅ |
| 4 | 00052_create_emotion_claims | 消费即确权记录表 | ✅ |
| 5 | 00053_create_emotion_assets_and_badges | 通宝/徽章独立表 + 预置徽章 | ✅ |
| 6 | 00054_emotion_rollback_and_rules | 确权回滚/封禁函数 + 规则版本表 | ✅ |
| 7 | 00055_add_ship_and_verify_columns | orders 发货/核销字段 | ✅ |
| 8 | 00056_enhance_product_mood_dimensions | 存量商品 mood_tags 增强 | ✅(UPDATE 重复无害) |
| 9 | 00057_emotion_lexicon | 情绪词库表 + 种子 | ✅ |
| 10 | 00058_separate_commission_and_points | 推广佣金/消费积分账户分离 | ✅(UPDATE 重复无害) |
| 11 | 00059_pipi_privacy_consent | profiles.privacy_consented_at | ✅ |
| 12 | **00060_ensure_profiles_cv_tb** | **补建 cv_total/tb_balance（漏洞修复）** | ✅ |
| 13 | 20260705_fix_user_store_relation_schema | user_store_relation 补锁客字段 | ✅ |
| 14 | 20260705_update_claim_campaign_with_lock | claim_campaign 加锁客逻辑 | ✅ |

## 执行方式

### 方式 A（推荐）：`supabase db push`
自动增量——只执行远端 `migration_history` 里没有的迁移，每文件独立事务，自动记录历史。最稳。
```bash
cd /path/to/app-coobohaoham9
supabase db push
```
执行前先确认登录：`supabase status` 或 `supabase db push --dry-run`（dry-run 会列出将要执行的文件，不实际改动）。

### 方式 B：合并 SQL 文件手动执行
已生成 `deliverables/pending_migrations_2026-07-09.sql`（14 文件按序拼接，含补丁）。
- Dashboard：SQL Editor 粘贴整段 → Run
- 或 CLI：`psql "$DATABASE_URL" -f deliverables/pending_migrations_2026-07-09.sql`

> 注意：方式 B 一次性执行，若中间某句报错会停止后续。建议先 dry-run（方式 A）确认范围。

## 执行前确认远端已跑过哪些
```sql
select * from supabase_migration_history order by inserted_at desc;
```
对比本清单文件名，已存在的跳过（但所有语句幂等，重跑也无碍）。

## 关键修复说明
- **cv_total / tb_balance 漏洞**：00054 函数 `fn_void_emotion_claim` / `fn_ban_user_rollback` / `fn_total_cv` 引用这两列，原无任何迁移创建。已在 `00060` 用 `ADD COLUMN IF NOT EXISTS` 补齐（numeric(12,4) / numeric(12,2)）。部署后这些函数才能正常调用，否则报 "column does not exist"。

## 关联待办（非本次迁移范围）
- 云函数部署：本机 `bash scripts/deploy-functions.sh`（含新建的 `wechat_miniapp_login` 登录函数）。Dashboard 删 `generate-qrcode` 的旧 `/qrcodes` 死函数。
- 00058 配套代码改造**经核查已完成**：api.ts（getMyBalance/approveWithdrawal/adminApproveWithdrawal/distributeCommissionV4）+ 前端 withdraw/my-promotion/admin-withdrawals + refund-order 的 triggerClawback 均已切到 `commission_balance`；全局 `gold_beans` 仅用于消费抵扣/退款返还，无提现余额误用。00058 迁移注释的"必须同步改代码"是 7月7日旧状态，代码后已更新。**唯一必须做的是先执行 00058 迁移建 `commission_balance` 列**（见本清单第10项），否则代码运行时该列为空、提现余额恒为 0
