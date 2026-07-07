# 云函数部署状态排查与修复（2026-07-07）

## 一、排查结论（实测，非猜测）

用项目 anon key 对 `https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/{name}` 逐个 POST 探测：

- **✅ 已部署(1)：** `article-fetch`
- **❌ 未部署(11)：** `wechat_miniapp_login` / `emotion-compile` / `create-wechat-payment` / `get-wechat-openid` / `generate-qrcode` / `send-redpacket` / `create-order` / `refund-order` / `distribute-commission` / `wechat-payment-callback` / `wechat-refund-callback`

> 判定标准：404 = 未部署；其他状态码 = 已部署（article-fetch 返回 400 证明端点可达、函数已上线）。

## 二、影响面

| 函数 | 后果 |
|---|---|
| create-order | 扫码购物无法真正下单 |
| create-wechat-payment / get-wechat-openid | 无法发起微信支付 |
| generate-qrcode | 商家扫码上架/分享二维码失败 |
| send-redpacket | 活动领红包失败 |
| distribute-commission | 分销佣金发不出去 |
| refund-order + 两个回调 | 退款与支付回调失效 |
| wechat_miniapp_login | 微信授权登录失效（当前靠 password 通道绕过） |

根因：Edge Function 不会随迁移脚本上线，必须逐个 `supabase functions deploy`。

## 三、已修复（前端兜底，立即可用，不依赖云端）

1. **网页版 admin-web**：`emotion.ts` 新增 `localCompileEmotion()`；`EmotionStudio.tsx` / `Products.tsx` 编译失败回退本地规则。
2. **小程序端商家管理**：`src/db/api.ts` 的 `compileProductEmotion` / `understandEmotion` 云端 404 时回退 `localCompile`（三阶段结构）/ `localUnderstand`（关键词分类）；`merchant-emotion-compile/index.tsx` 提示「云端未部署，已用本地规则生成」。

> 情绪编译在两端现已可正常使用；但下单/支付/退款/佣金等无法前端假装成功，必须真部署。

## 四、必须由用户执行（需 Supabase 凭证，本地 CLI 当前异常）

```bash
npx supabase@latest --version          # 先修本地坏掉的 CLI
supabase login                         # 浏览器或 export SUPABASE_ACCESS_TOKEN 后 --token
supabase link --project-ref pyqgsxcjmijtbstwthbn
bash scripts/deploy-functions.sh       # 一键部署全部 12 个函数
```

⚠️ 部署前确认支付类函数所需微信商户号密钥已在 `supabase/config.toml` 的 secrets 中配置。
