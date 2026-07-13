# 部署状态总表（来电有喜 V5 · 截至 2026-07-09）

> 本文是云函数 + 数据库迁移的**权威核对表**，由沙箱代码/脚本实测得出（非记忆）。
> 沙箱无法 deploy/db push（无 token + CLI win32 不兼容），以下均供**用户本机**执行。

---

## 一、云函数三向对照

| 函数 | 本地代码 | 脚本部署 | 代码调用 | 状态 |
|---|:---:|:---:|:---:|---|
| `wechat_miniapp_login` | ✅ | ✅ | ✅ AuthContext:337 | **已闭环**（2026-07-09 重建，原本地代码丢失） |
| `delete-account` | ✅ | ✅ | ✅ api.ts:35 | 正常（脚本已补列） |
| `generate-qrcode` | ✅ | ✅ | ✅ api.ts:1988 | 正常；⚠️ Dashboard 有旧 slug `/qrcodes` 死函数待删 |
| `emotion-compile` | ✅ | ✅ | ✅ api.ts:523/536 + admin-web×2 | 正常 |
| `create-order` | ✅ | ✅ | ✅（mock 拦截器证明） | 正常（下单核心） |
| `refund-order` | ✅ | ✅ | ✅（mock 拦截器证明） | 正常（退款核心） |
| `create-wechat-payment` | ✅ | ✅ | ✅ api.ts:1748 | 正常 |
| `get-wechat-openid` | ✅ | ✅ | ✅ api.ts:1755 + campaign-claim:89 | 正常 |
| `send-redpacket` | ✅ | ✅ | ✅ campaign-claim:199 | 正常 |
| `article-fetch` | ✅ | ✅ | ✅ content-center/make:152 | 正常 |
| `wechat-payment-callback` | ✅ | ✅ | 微信服务器 POST | 正常（支付回调） |
| `wechat-refund-callback` | ✅ | ✅ | 微信服务器 POST | 正常（退款回调） |
| `distribute-commission` | ✅ | ✅ | ❌ 无调用 | ⚠️ **僵尸函数**（代码已改用 `distributeCommissionDirect` 直接 DB 操作，api.ts:957；保留部署无害，可标注弃用） |
| `rapid-task` | ❌ 无 | ❌ | ❌ | Dashboard 孤儿（本地无代码、脚本不部署），待确认保留/删 |

**结论**：本地 13 个函数目录 ↔ 脚本部署列表 已对齐（含新建 `wechat_miniapp_login` 与补齐的 `delete-account`）。唯一需注意：`distribute-commission` 已弃用但仍被脚本部署（无害）；`rapid-task` 是 Dashboard 历史孤儿。

---

## 二、待执行数据库迁移（14 个，按序）

| 文件 | 内容 | 备注 |
|---|---|---|
| `00050_add_product_emotion_dimension_fields` | 情绪编译字段 | 幂等 |
| `00050_lower_rank_thresholds` | 段位阈值下调 | 同号重复编号（与上式 00050 并存） |
| `00051_create_emotion_funnel_events` | 情绪漏斗埋点表 | |
| `00052_create_emotion_claims` | 消费即确权表 | |
| `00053_create_emotion_assets_and_badges` | 通宝/徽章独立表 | |
| `00054_emotion_rollback_and_rules` | 回滚/封禁函数 | 依赖 cv_total/tb_balance（由 00060 补） |
| `00055_add_ship_and_verify_columns` | 发货核销字段 | |
| `00056_enhance_product_mood_dimensions` | 心情标签增强 | |
| `00057_emotion_lexicon` | 情绪词库 | |
| `00058_separate_commission_and_points` | 佣金/积分分离（建 commission_balance 列） | **代码已就绪，必须先执行建列** |
| `00059_pipi_privacy_consent` | 隐私同意 | |
| `00060_ensure_profiles_cv_tb` | **新建补丁**：补 cv_total/tb_balance | 修复 00054 隐藏依赖 |
| `20260705_fix_user_store_relation_schema` | 锁客/用户-门店关系 | |
| `20260705_update_claim_campaign_with_lock` | claim_campaign 加锁 | |

> 合并可执行文件：`deliverables/pending_migrations_2026-07-09.sql`（含全部 14 个，1016 行）
> 重复编号提醒：`00019`/`00035`/`00049`/`00050` 各有两份同名编号（Supabase 按文件名执行不报错，但管理混乱，建议后续重命名）。

---

## 三、本机执行速查

```bash
# 1. 一键部署（迁移 dry-run 预览 → 确认 → db push → 部署 13 函数）
npm run deploy
#   或 bash scripts/deploy-all.sh

# 2. Dashboard 手动收尾
#   - 删 generate-qrcode 的旧 /qrcodes 死函数
#   - 确认 Secrets（特别是 MERCHANT_APP_ID / WX_SECRET，新建登录函数强依赖）
supabase secrets list

# 3. 微信开发者工具开 dist/ 走一遍链路验手感
```

**依赖就绪链**：`00058` 建 `commission_balance` 列 → 代码侧提现/佣金链路才能跑通；`00060` 补 `cv_total/tb_balance` → `00054` 回滚/封禁函数运行时才不报列不存在。
