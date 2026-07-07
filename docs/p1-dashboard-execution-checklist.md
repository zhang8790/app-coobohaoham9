# P1 执行清单 · Supabase Dashboard 手动操作（无需任何凭证）

> 生成时间：2026-07-07 20:44 · 配套提交 `837f83c`
> 项目 ref：`pyqgsxcjmijtbstwthbn`（URL：`https://pyqgsxcjmijtbstwthbn.supabase.co`）
> 所有 SQL 均**幂等**（IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING），可放心重复执行。

## 入口
1. 打开 `https://supabase.com/dashboard` → 项目 **pyqgsxcjmijtbstwthbn** → 左侧 **SQL Editor** → **New query**
2. 每个步骤用**独立查询标签页**粘贴运行（函数体含分号，避免整段切割报错）

---

## 步骤 1 · 下调段位阈值（修复 my-promotion 进度条显示错误）

**文件**：`supabase/migrations/00050_lower_rank_thresholds.sql`
**操作**：全选复制 → 粘贴 → Run
**预期**：无报错。该脚本 `DROP FUNCTION IF EXISTS` + `CREATE`，幂等可重跑。
**验证**：
```sql
-- 用测试用户 UUID（d6b38349-dded-4879-9eac-3165a646436a）试跑
SELECT current_rank, next_rank, l1_ratio, l2_ratio
FROM get_rank_progress('d6b38349-dded-4879-9eac-3165a646436a');
-- 期望 l1_ratio 在新阈值下返回（如 total_consumption>=200 → 外门弟子 l1=0.45）
```

---

## 步骤 2 · 确认并补齐 pending_referrals（修复未注册用户推广码预锁客静默失败）

### 2a 探测云端是否已存在（先跑这个）
```sql
SELECT to_regclass('public.pending_referrals') AS tbl,
       (SELECT proname FROM pg_proc WHERE proname='convert_pending_referral') AS fn;
```
- `tbl` 返回 `pending_referrals` 且 `fn` 返回 `convert_pending_referral` → **已存在，跳到步骤 3**
- 任一为 `NULL` → 执行 **2b**

### 2b 补齐（仅当缺失）
**文件**：`supabase/migrations/00035_add_pending_referrals.sql`
**操作**：复制全部 → 粘贴 → Run（建表 + 索引 + RLS 策略 + `convert_pending_referral` 函数，全部幂等）
**验证**：重跑 2a，两列都应非空。

---

## 步骤 3 · 情绪系统补齐表（现已合并为 1 个文件，一次跑通）

> 已把 6 个幂等 SQL（`00038` + `apply_missing_emotion_tables` + `00050` + `00051` + `00052` + `00053`）合并为单一文件，**共 12 张表全部 `IF NOT EXISTS` 幂等**。
> ⚠️ **不要跑**根目录 `add_mood_tags_to_campaigns.sql` / `sql/add_mood_tags_to_campaigns.sql` —— 它 `ALTER TABLE marketing_campaigns`，而本项目无此表（前端无引用），会报"不存在"。也已排除 `create_user_emotion_preferences.sql`（与合并文件内的 `user_emotion_preferences` 重复）。

**文件**：`docs/emotion-all-in-one.sql`
**操作**：全选复制 → 粘贴到 SQL Editor → Run（一次即可，无需切多个标签页）
**它建/补的表**（前端真实引用）：
`emotion_keywords` · `emotion_content` · `category_emotion_profiles` · `product_emotion`(+维度字段) · `emotion_taxonomy` · `user_emotion_preferences` · `emotion_funnel_events` · `emotion_claims` · `emotion_assets` · `emotion_tongbao_logs` · `emotion_badge_defs` · `emotion_badge_grants`

**验证**（跑完）：
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE '%emotion%'
   OR table_name IN ('category_emotion_profiles','product_emotion','user_emotion_preferences')
ORDER BY table_name;
-- 期望返回上述 12 张表名，无报错
```

---

## 步骤 4 · 重部署 distribute-commission 云函数（修复备用链路 500）

**为什么**：本地源码已改（平台抽成 10%、新段位阈值、移除 team_performance），但云端仍是旧版 → 旧版读已删除的 `team_performance` 列会 500。主链路 `distributeCommissionDirect`（api.ts）不走此函数，不受影响；此步仅为备用/独立调用路径一致。

**操作**：
1. Dashboard 左侧 **Edge Functions** → 找到 `distribute-commission`（已部署）→ **Edit / Redeploy**
2. 清空编辑器 → 打开本地 `supabase/functions/distribute-commission/index.ts` → 全选复制 → 粘贴
3. slug 必须小写连字符 `distribute-commission` → **Deploy**
4. 若提示需要 secrets，确认 `SUPABASE_*` 服务角色密钥已自动注入（部署时默认带），无需额外配置

**验证**（本地探测或 curl，带登录 JWT）：
```bash
curl -X POST 'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/distribute-commission' \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"order_id":"00000000-0000-0000-0000-000000000000"}'
# 期望返回 JSON（旧版会 500，因读 team_performance 列已删）
```

---

## ✅ 完成判定
- 步骤 1–3 跑完：my-promotion 进度条、推广码预锁客、情绪编译/详情/漏斗/领取/徽章页面依赖的表全部就绪
- 步骤 4 跑完：备用分佣云函数与前端 10% 抽成 + 新阈值一致

## 🚫 不在本清单（归 P2，需微信商户号 + 小程序认证）
以下 7 个云函数仍 404，部署后才能启用支付/红包/退款/微信登录：
`create-wechat-payment` · `get-wechat-openid` · `send-redpacket` · `refund-order` ·
`wechat-payment-callback` · `wechat-refund-callback` · `wechat_miniapp_login`
（拿到商户号后跑 `scripts/deploy-functions.sh`）

## ⚠️ 已知坑：迁移编号重复
`00035` / `00049` / `00050` 各有 2 个同名前缀文件（`00050` 同时有 `lower_rank_thresholds` 与 `add_product_emotion_dimension_fields`）。手动按**完整文件名**跑不受影响，但后续建议统一重命名消除歧义。本清单已用完整路径区分，照跑即可。
