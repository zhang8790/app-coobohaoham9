# get-wechat-openid 404 排查与部署 SOP

> 适用场景：小程序日志出现 `POST https://...functions.supabase.co/get-wechat-openid 404`

## 一、现象
```
POST https://pyqgsxcjmijtbstwthbn.functions.supabase.co/get-wechat-openid 404
```
通常在「营销活动领奖页」(campaign-claim) 打开时静默出现（该页 mount 时拉 openid 用于真发钱），
或在微信支付分支 `fetchOpenidWithRetry()` 调用时出现。

## 二、根因（已确认，非代码 bug）
`get-wechat-openid` Edge Function **未部署**到 Supabase 线上（目录存在 ≠ 已上线）。
- 源码：`supabase/functions/get-wechat-openid/index.ts` —— 完整可用，直连微信官方 `jscode2session`，零外部依赖。
- 部署脚本：`scripts/deploy-functions.sh` 第 22 行已含该函数。
- 此前只部署了 `create-order` + `refund-order`（金豆支付链路），微信支付/发钱链路的其余函数全部未上线。

## 三、影响范围
| 能力 | 状态 | 说明 |
|---|---|---|
| 金豆支付 | ✅ 不受影响 | 走 `create-order`（已部署），不调用 openid |
| 微信支付 | ❌ 不可用 | 缺 `get-wechat-openid`(openid) + `create-wechat-payment`(预支付参数) + `wechat-payment-callback`(回调) |
| 营销活动真发钱/领奖 | ❌ 受影响 | campaign-claim 页 mount 静默拉 openid 失败 → 即本日志 |

## 四、本机前置条件（一次性）
```bash
# 1. 确认 CLI 可用
npx supabase@latest --version

# 2. 登录（二选一）
supabase login                                          # 浏览器交互登录
# 或：export SUPABASE_ACCESS_TOKEN=你的token && supabase login --token "$SUPABASE_ACCESS_TOKEN"

# 3. 链接项目（之前做过可跳过）
supabase link --project-ref pyqgsxcjmijtbstwthbn
```

## 五、⚠️ 必须配置 Secrets（否则函数部署后报 400）
函数运行依赖两个 Supabase Secret（`supabase/functions/get-wechat-openid/index.ts` 第 21-22 行读取）：
- `MERCHANT_APP_ID` = `wxb5bdfdbb471a500f`（小程序 appid，源码注释已写明）
- `WX_SECRET` = 小程序 AppSecret（微信公众平台 → 开发管理 → 开发设置 → AppSecret，没有则点「生成」）

配置位置：**Supabase Dashboard → Project Settings → Edge Functions → Secrets → 新增**。
同理 `create-wechat-payment` 若也用商户 appid/key，需确认其各自依赖的 Secret 已配（参考 `supabase/functions/create-wechat-payment/index.ts` 顶部注释）。

## 六、部署命令
推荐一次全量（含微信支付全套，最省事）：
```bash
cd <项目根目录>
bash scripts/deploy-functions.sh
```
或仅补齐缺失的三个：
```bash
supabase functions deploy get-wechat-openid --project-ref pyqgsxcjmijtbstwthbn
supabase functions deploy create-wechat-payment --project-ref pyqgsxcjmijtbstwthbn
supabase functions deploy wechat-payment-callback --project-ref pyqgsxcjmijtbstwthbn
```

## 七、验证
1. 部署后，小程序打开「营销活动领奖页」，日志应**不再出现 404**，控制台无 `[Campaign] 确保 openid 失败`。
2. 函数上线探测（需 Bearer，用 anon key）：
```bash
curl -X POST 'https://pyqgsxcjmijtbstwthbn.functions.supabase.co/get-wechat-openid' \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"code":"test"}'
```
- 返回 `{"success":false,"error":"获取 openid 失败：..."}`（非 404）→ 函数已上线 ✅
- 返回「微信登录未配置...」→ `WX_SECRET` 没配，回去补 Secret
- 仍 404 → 函数未部署成功，重跑第六步

## 八、小结
这是**纯部署缺失**问题，源码无 bug，无需改代码。金豆支付链路此前已修复且不受影响；
本 SOP 解决的是微信支付与真发钱能力上线所需的函数部署 + Secret 配置。
