# 来店有喜 · Supabase Edge Function 部署清单（上线前收尾 A 项）

**日期**：2026-07-18
**场景**：QA 测试与发布（Edge Function 部署清单 + 命令）
**参与成员**：质量门神（gstack-qa-lead）
**项目路径**：`C:\Users\zhanglin\Desktop\app-coobohaoham9`

---

## 📌 TL;DR（执行摘要）

- 整体结论：🟢 **Go** —— 全部目标函数源码干净，可直接部署
- 阻塞项数量：**0**
- 需部署函数（8 个）：`distribute-commission` / `wechat-payment-callback` / `create-wechat-payment` / `delete-account` / `send-notification`（强依赖）+ `create-order` / `refund-order` / `wechat-refund-callback`（建议一并部署，死代码/休眠，无害）
- 残留旧命名扫描：**0 处命中**（gold_beans / 旧段位名 / balance 列误用全部清零）
- 下一步：配置 Secrets → 按依赖顺序 `supabase functions deploy` → 部署后验证

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟢 Go |
| 严重度分布 | 🔴 0 / 🟠 0 / 🟡 0 / 🟢 全绿 |
| 关键行动项 | 8 条（见行动清单） |
| 建议负责人 | 张林（本机执行 supabase CLI） |
| 项目 ref | `pyqgsxcjmijtbstwthbn`（取自 deploy-functions.ps1） |

---

## 1. 质量门神核心结论

- **核心判断**：7 个目标函数 + `send-notification` 源码与最新迁移（金豆→情绪豆合并、段位改名、V5 分佣、幂等守卫）已 **100% 对齐**；无 `_shared` 共享模块包袱，每个函数自包含，可直接部署。
- **关键建议**：先 `supabase secrets set` 再 deploy；`create-order` / `refund-order` 是当前架构下的历史遗留死代码（前端已改为客户端直写 DB），`wechat-refund-callback` 处于休眠（退款走客户端直写、未发起真实微信退款），三者一并部署以备后续接回，不影响本次 Go 判定。

---

## 2. 逐函数核查结论

| 函数 | 部署判定 | 生产是否被调用 | 核查结果 |
|------|---------|--------------|---------|
| **distribute-commission** | ✅ 必须部署 | 是（客户端 `api.ts:1138` + 回调内部触发） | V5 算法 / 六段位 / 幂等守卫 / `commission_balance` 全对齐，干净 |
| **wechat-payment-callback** | ✅ 必须部署 | 是（微信支付服务器回调） | 验签→解密→扣混合豆→触发 distribute-commission + send-notification，干净 |
| **create-wechat-payment** | ✅ 必须部署 | 是（客户端 `api.ts:2150`） | JSAPI 预支付，读 `tb_used` 计算微信金额，干净 |
| **delete-account** | ✅ 必须部署 | 是（客户端 `api.ts:50`） | 清多表 + `auth.users`，含 `tongbao_logs`/`emotion_tongbao_logs`，干净 |
| **send-notification** | ✅ 必须部署（被依赖） | 间接（被 4 个函数内部 `functions.invoke`） | 强依赖，缺失则通知静默失败（代码已 `.catch`） |
| **create-order** | ⚠️ 建议部署（疑似遗留） | 否（客户端用 `createOrderV2` 直写 DB，`api.ts:1006`） | 仅出现在 mock/脚本/文档，疑似死代码，部署无害 |
| **refund-order** | ⚠️ 建议部署（疑似遗留） | 否（客户端用 `applyRefund` 直写 DB，`api.ts:2246`） | 死代码；`notify_url` 指向 wechat-refund-callback |
| **wechat-refund-callback** | ⚠️ 建议部署（休眠） | 否（仅 refund-order 触发，而 refund-order 未调用） | 当前退款流绕过微信，webhook 不会被触发；预留接回 |

---

## 3. 前端真实依赖的函数名（grep `functions.invoke(` 结果）

**小程序 `src/`**：`force-login` · `wechat_miniapp_login` · `delete-account` · `emotion-compile` · `distribute-commission` · `create-wechat-payment` · `get-wechat-openid` · `generate-qrcode` · `product-mutate` · `send-redpacket` · `food-therapy-ai` · `article-fetch`

**管理后台 `admin-web/src/`**：`send-notification` · `emotion-compile`

**微信服务器回调（非前端调用）**：`wechat-payment-callback` · `wechat-refund-callback`

> 特别注意：`create-wechat-payment` → 前端调用（`api.ts:2150`）；`wechat-refund-callback` → 非前端调用（微信退款回调 webhook，当前休眠）；`create-order` / `refund-order` → 生产前端路径均未被 `functions.invoke` 调用，确认为历史遗留。

---

## 4. 残留旧命名扫描

对全部函数执行 grep（模式 `gold_beans|gold_bean_logs|gold_beans_used|江湖散修|外门弟子|内门弟子|核心弟子|长老|掌门` + 裸 `balance` 列误用）→ **0 处命中**。

新命名已正确使用且普遍存在：
- `tb_balance` / `tb_used`（create-order、wechat-payment-callback、refund-order、delete-account 等）
- `tongbao_logs` / `emotion_tongbao_logs`（delete-account、wechat-payment-callback）
- `payment_method: 'emotion_beans'`（create-order、refund-order）
- `commission_balance` / `total_commission`（distribute-commission、refund-order、wechat-refund-callback）
- 六段位 `凡心/初心/明心/静心/悟心/无心境`（distribute-commission 的 RANK_TABLE）

**结论：函数侧货币模型与段位改名已 100% 对齐，无遗漏。**

---

## 5. 共享模块

- 无任何 `_shared` 目录，也无 `../_shared` 或 `./_shared` import（grep 0 命中）。
- 每个函数自包含，仅依赖 `jsr:@supabase/supabase-js@2` + 个别 npm 包（`wechatpay-axios-plugin@0.9.4`、`short-unique-id`）。
- 各函数目录**均无 `deno.json`** → 使用 Supabase 默认 Deno 运行时，npm 包部署时自动拉取。
- **无需把共享代码打进每个函数包**，直接 `supabase functions deploy` 即可。

---

## 6. 所需 Secrets（按代码实际 `Deno.env.get` 读取整理）

> `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 由平台自动注入，**不要手动 set**。

**支付类（必填）**
- `MERCHANT_ID` — create-wechat-payment、refund-order
- `MERCHANT_APP_ID` — create-wechat-payment
- `MCH_CERT_SERIAL_NO` — create-wechat-payment、refund-order
- `MCH_PRIVATE_KEY` — create-wechat-payment、refund-order
- `WECHAT_PAY_PUBLIC_KEY_ID` — create-wechat-payment、wechat-payment-callback、refund-order
- `WECHAT_PAY_PUBLIC_KEY` — create-wechat-payment、wechat-payment-callback、refund-order
- `MCH_API_V3_KEY` — wechat-payment-callback、wechat-refund-callback
- `WX_APPID`、`WX_SECRET` — send-notification

**可选（有默认值，不填不报错）**
- `TMPL_ORDER_PAID` / `TMPL_COMMISSION_ARRIVED` / `TMPL_WITHDRAW_PROGRESS` / `TMPL_REFUND_RESULT` / `TMPL_ANNOUNCEMENT`（send-notification，默认 `''`）
- `CHANNEL_FEE_RATE`（默认 `0.006`）、`COMMISSION_TAX_RATE`（默认 `0.20`）、`COMMISSION_TAX_THRESHOLD`（默认 `800`）— distribute-commission

> 附：同仓库 `product-mutate` 读取的是 `SERVICE_ROLE_KEY`（应为 `SUPABASE_SERVICE_ROLE_KEY`，疑似 typo，上线会读空）。因不在 8 个目标函数内，不阻塞本次，但建议顺手修。

---

## 7. 部署清单（可直接复制）

### 前置条件
```bash
# 1) 安装 CLI（若未装）
npm i -g supabase

# 2) 登录（有 PAT 则 --token 免弹窗）
supabase login            # 或：supabase login --token $SB_TOKEN

# 3) 关联项目（config.toml 当前无 project_id，必须 link）
#    PROJECT_REF = pyqgsxcjmijtbstwthbn（取自 deploy-functions.ps1）
#    获取方式：supabase projects list  / 或 Dashboard 设置页 URL 里的 ref
supabase link --project-ref pyqgsxcjmijtbstwthbn
```
> ⚠️ 迁移已执行（用户确认 00095/00096/00108/V5 列）。部署前建议核对以下列/表存在：
> `profiles`: `tb_balance`、`commission_balance`、`total_commission`；`orders`: `tb_used`、`commission_distributed`、`channel_fee`(00082/00083)；`tongbao_logs`。

### 配置 Secrets
```bash
supabase secrets set \
  MERCHANT_ID="你的商户号" \
  MERCHANT_APP_ID="wx开头的AppID" \
  MCH_CERT_SERIAL_NO="商户证书序列号" \
  MCH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..." \
  WECHAT_PAY_PUBLIC_KEY_ID="微信支付公钥ID" \
  WECHAT_PAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..." \
  MCH_API_V3_KEY="微信支付APIv3密钥" \
  WX_APPID="wx开头的AppID" \
  WX_SECRET="小程序AppSecret" \
  --project-ref pyqgsxcjmijtbstwthbn
# 可选模板消息（send-notification）：
#  TMPL_ORDER_PAID / TMPL_COMMISSION_ARRIVED / TMPL_WITHDRAW_PROGRESS / TMPL_REFUND_RESULT / TMPL_ANNOUNCEMENT
```

### 按依赖顺序部署（先被调用方，后回调方）
```bash
# 1) 基础依赖（被 4 个函数内部 invoke）
supabase functions deploy send-notification          --project-ref pyqgsxcjmijtbstwthbn

# 2) 客户端直调 / 直写类
supabase functions deploy create-wechat-payment     --project-ref pyqgsxcjmijtbstwthbn
supabase functions deploy create-order              --project-ref pyqgsxcjmijtbstwthbn
supabase functions deploy delete-account           --project-ref pyqgsxcjmijtbstwthbn

# 3) 分佣（被回调 与 客户端兜底 调用）
supabase functions deploy distribute-commission     --project-ref pyqgsxcjmijtbstwthbn

# 4) 微信回调（最后，确保上面 callee 已就绪）
supabase functions deploy wechat-payment-callback  --project-ref pyqgsxcjmijtbstwthbn
supabase functions deploy refund-order             --project-ref pyqgsxcjmijtbstwthbn
supabase functions deploy wechat-refund-callback   --project-ref pyqgsxcjmijtbstwthbn
```
> Supabase 各函数独立部署、无编译期耦合，顺序仅为逻辑安全（避免刚上线就被调用而 callee 尚未就绪）。

### 部署后验证
```bash
# A. 确认已上线
supabase functions list --project-ref pyqgsxcjmijtbstwthbn

# B. 健康检查（缺密钥应返回 400 配置缺失，证明函数活且读 env；若 404 即未部署）
supabase functions invoke create-wechat-payment --project-ref pyqgsxcjmijtbstwthbn --body '{}'

# C. 回调端点存活探测（应回 JSON {code:'FAIL'...}，非 404）
curl -s -X POST https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/wechat-payment-callback \
  -H "Content-Type: application/json" -d '{}'

# D. 实时日志（支付一笔后看回调 + 分佣是否触发）
supabase functions logs wechat-payment-callback --project-ref pyqgsxcjmijtbstwthbn
supabase functions logs distribute-commission   --project-ref pyqgsxcjmijtbstwthbn

# E. 端到端（建议）：小程序走一笔真实/沙箱单 → 微信支付成功 →
#    查 commissions 表是否生成、profiles.commission_balance 是否累加、用户是否收到「佣金到账/订单支付成功」订阅消息
```

### 回滚预案（Supabase 无版本回退按钮）
- **保留旧代码即等于可回滚**：部署前先打 tag `git tag release-edge-<日期>`，保留当前干净版本。
- 单个函数回滚：`git checkout <旧commit> -- supabase/functions/<name>` 后重新 `supabase functions deploy <name> --project-ref ...`。
- 全局回滚：`git stash` / `git checkout <旧commit> -- supabase/functions` 后批量重 deploy。
- 紧急止血：若新函数写坏数据，最快是把该函数改回安全逻辑（或直接 checkout 旧版）重新 deploy；Supabase 函数**不可“禁用”**，只能重部署旧版或改代码。
- Secrets 无需回滚（与代码版本无关）。

---

## 8. 阻塞项

**无。** 8 个目标函数 + send-notification 源码全部干净，可直接部署。

---

## 9. 已知提示（非阻塞）

- `create-order` / `refund-order` 是当前架构下的死代码（前端已改直写 DB），部署无害，建议保留以备后续接回。
- `wechat-refund-callback` 当前休眠（退款流未接真实微信），部署后待后续把 `applyRefund` 改为真实发起微信退款时自动激活。
- `product-mutate` 读取 `SERVICE_ROLE_KEY`（应为 `SUPABASE_SERVICE_ROLE_KEY`，疑似 typo，上线会读空）——不在本次 8 个函数内，不阻塞，但建议顺手修。

---

## ✅ 行动清单

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | `supabase login` + `supabase link --project-ref pyqgsxcjmijtbstwthbn` | 张林 | P0 | 部署前 |
| 2 | `supabase secrets set` 配置 9 个必填支付密钥 | 张林 | P0 | 部署前 |
| 3 | 部署 `send-notification`（强依赖，最先） | 张林 | P0 | 发版日 |
| 4 | 部署 `create-wechat-payment` / `create-order` / `delete-account` | 张林 | P0 | 发版日 |
| 5 | 部署 `distribute-commission`（分佣核心） | 张林 | P0 | 发版日 |
| 6 | 部署 `wechat-payment-callback` / `refund-order` / `wechat-refund-callback` | 张林 | P0 | 发版日 |
| 7 | 部署后跑验证 D+E（一笔测试单看佣金到账+订阅消息） | 张林 | P1 | 发版后 |
| 8 | 顺手修 `product-mutate` 的 `SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` typo | 张林 | P2 | 下个迭代 |

---

## 📚 成员产出索引

- gstack-qa-lead（质量门神）原始产出：见上方「逐函数核查 / 前端依赖 / 残留扫描 / Secrets / 部署清单」全部章节，由质量门神基于 `supabase/functions/` 真实源码核查后产出。

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
