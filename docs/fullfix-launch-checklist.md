# 来电有喜 V3 · 全面修复上线清单

> 最后更新：2026-07-07 12:41（基于云端 schema 探查结果第三次修正）

## 已完成的代码改动（本地）

| 文件 | 改动内容 |
|---|---|
| `supabase/migrations/00045_add_profiles_openid.sql` | profiles 补 openid 列（幂等） |
| `supabase/migrations/00046_fix_claims_store_id_and_rpc.sql` | 删错误外键→改 UUID→重建 FK→防重约束→重写 claim_campaign 函数 |
| `supabase/migrations/00047_harden_redpacket_payouts.sql` | accepted 中间态 + CHECK 约束 + 唯一约束 |
| `supabase/migrations/00048_merchant_members_masked.sql` | 锁客名单脱敏 RPC（SECURITY DEFINER） |
| `supabase/functions/get-wechat-openid/index.ts` | 删第三方代理→直连微信 jscode2session |
| `supabase/functions/send-redpacket/index.ts` | accepted 中间态 + 唯一冲突兜底 |
| `src/pages/campaign-claim/index.tsx` + `.scss` | claim_id 透传 + 渐变改 scss class |
| `src/pages/merchant-campaigns/create/index.tsx` | 红包金额上限 200 校验 |
| `src/pages/merchant-members/index.tsx` | 手机号脱敏（phone_masked） |

## 第 1 步：跑 SQL 迁移（在 Supabase 控制台操作）

### 方法：5 段分步执行

**⚠️ 必须按顺序一段段跑，每段新建查询标签页！不能整段一起粘！**

文件：`supabase/apply_fullfix_migrations.sql`

| 段 | 内容 | 预期输出 |
|---|---|---|
| **第 1 段** | 00045 openid + 00046 删旧外键 + store_id 改 UUID | `✅ 第1段完成` |
| **第 2 段** | 00046 建新外键 → stores(id) + 防重唯一约束 | `✅ 第2段完成` |
| **第 3 段** | 00046 claim_campaign 函数重建 | `✅ 第3段完成` |
| **第 4 段** | 00047 redpacket_payouts 约束加固 | `✅ 第4段完成` |
| **第 5 段** | 00048 锁客脱敏函数创建 | `✅ 第5段完成` |

### 操作步骤

1. 打开 Supabase 控制台 → SQL Editor
2. 打开 `supabase/apply_fullfix_migrations.sql`
3. 找到 `【第 1 段】` 标记，复制该段内容
4. 在控制台**新建一个查询标签页**，粘贴，点 Run
5. 看到 `✅ 第1段完成` 后，继续第 2 段……以此类推到第 5 段

### ⚠️ 注意事项

- **每段必须单独新建标签页粘贴运行**
- **第 1 段的 ALTER TYPE UUID 只能成功一次**：如果之前已经跑过（store_id 已经是 UUID 了），重复跑这句会报错——这是正常的，说明类型已改好，直接跳过第 1 段从第 2 段继续即可
- 如果某段报错，**把红字贴给开发者**，不要继续下一段

## 第 2 步：部署 Edge Functions

在项目根目录执行：

```bash
# 部署 get-wechat-openid（已改为直连微信官方）
supabase functions deploy get-wechat-openid

# 部署 send-redpacket（含 accepted 中间态 + 并发兜底）
supabase functions deploy send-redpacket
```

## 第 3 步：配置 Secrets

在 Supabase 控制台 → Settings → Edge Functions 配置：

| Secret | 值 | 说明 |
|---|---|---|
| `WX_SECRET` | 小程序 AppSecret | 微信公众平台 → 开发管理 → 开发设置 |
| `MERCHANT_APP_ID` | 小程序 AppID（`wxb5bdfdbb471a500f`） | 确认和微信小程序一致 |
| `REDPACKET_PAYOUT_ENABLED` | `false` | ⚠️ 先关闭验证，走通后再开 true |

## 第 4 步：商户平台开通

在 [微信商户平台](https://pay.weixin.qq.com) 操作：

1. 进入「产品中心」→ 找到「商家转账到零钱」→ 申请开通
2. 开通后进入「商家转账到零钱」→ 「产品设置」→ 添加场景
3. 场景 ID 填 **`1000`**（与代码里一致）
4. 上传相关资质，等待审核通过

## 第 5 步：验证流程

1. **openid 链路**：小程序启动 → 调用 get-wechat-openid → profiles.openid 被填充
2. **领取活动**：用户扫门店码领红包 → claim_campaign → user_campaign_claims 写入（store_id=UUID）+ 锁客建立
3. **发钱落库**：调用 send-redpacket → redpacket_payouts 写入 status='pending_manual'（因为 REDPACKET_PAYOUT_ENABLED=false）
4. **开启真发钱**：确认 2~3 正常后，把 REDPACKET_PAYOUT_ENABLED 改为 true
5. **脱敏验证**：商家后台查看锁客名单 → 手机号显示为 `138****1234` 格式

## 故障排查

| 报错 | 原因 | 解决方法 |
|---|---|---|
| `42804: uuid and integer incompatible` | 外键类型不匹配 | 确认先跑完第 1 段（ALTER TYPE UUID）再跑第 2 段（ADD FK） |
| `42P01: relation does not exist` | SQL Editor 切割了函数体内分号 | 确保函数段（3/5 段）是**单独标签页**粘贴 |
| `23505: unique constraint violation` | 重复领取被唯一约束拦截 | 正常行为，前端应展示"您已领取" |
| `get-wechat-openid 404` | 函数未部署 | 执行第 2 步 deploy |
