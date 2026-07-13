# Supabase Secrets 配置清单（来电有喜 V5）

> **配置入口**
> - Dashboard：Project Settings → API（查看 URL / anon / service_role）
> - Dashboard：Edge Functions → 任意函数 → Secrets（设自定义业务密钥）
> - CLI（本机登录后）：`supabase secrets set KEY=VALUE --project-ref pyqgsxcjmijtbstwthbn`
> - 查看已配：`supabase secrets list --project-ref pyqgsxcjmijtbstwthbn`

---

## 一、Supabase 自动注入（无需手动配，仅知悉）

| Secret | 说明 | 自动注入 |
|---|---|---|
| `SUPABASE_URL` | 项目 URL | ✅ |
| `SUPABASE_ANON_KEY` | 公开 anon key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥 | ✅ |

部署 Edge Functions 时 Supabase **自动注入**这三项，不要手动设（设了也覆盖不了系统值）。

---

## 二、业务 Secrets（需手动配置）

### A. 微信小程序（登录 / OpenID / 支付商户初始化）
| Secret | 必需 | 用途 | 被哪些函数用 |
|---|---|---|---|
| `MERCHANT_APP_ID` | ✅ | 微信小程序 appid（wxb5bdfdbb471a500f） | wechat_miniapp_login、get-wechat-openid、create-wechat-payment、send-redpacket |
| `WX_SECRET` | ✅ | 小程序 app secret | 同上 |

> 推测已配：get-wechat-openid（静默取 openid）此前可用 → 这两项应已存在。
> **本次重点**：wechat_miniapp_login（新建登录函数）强依赖这两项，缺失会登录失败。

### B. 微信支付（商户，真金白银支付 / 退款 / 红包）
| Secret | 必需 | 用途 |
|---|---|---|
| `MERCHANT_ID` | ✅ | 微信支付商户号 |
| `MCH_CERT_SERIAL_NO` | ✅ | 商户 API 证书序列号 |
| `MCH_PRIVATE_KEY` | ✅ | 商户 API 私钥（pem 全文） |
| `WECHAT_PAY_PUBLIC_KEY_ID` | ✅ | 微信支付平台证书 ID |
| `WECHAT_PAY_PUBLIC_KEY` | ✅ | 微信支付平台证书公钥（pem 全文） |
| `MCH_API_V3_KEY` | ✅ | 微信支付 APIv3 密钥 |

> 被用：create-wechat-payment、refund-order、wechat-payment-callback、wechat-refund-callback、send-redpacket
> 推测已配：若线上支付 / 退款可用 → 应已存在。

### C. generate-qrcode 专用（⚠️ 注意 ≠ `MERCHANT_APP_ID`）
| Secret | 必需 | 用途 |
|---|---|---|
| `THIRD_PARTY_LOGIN_APP_ID` | ✅ | generate-qrcode 调微信 `getwxacodeunlimit` 用的 appid（可能是公众号 / 开放平台，与小程序 `MERCHANT_APP_ID` **是两套**） |
| `THIRD_PARTY_LOGIN_APP_SECRET` | ✅ | 对应 secret |

> 被用：generate-qrcode 唯一
> 推测已配：Dashboard 上存在 `/qrcodes`、`/generate-qrcode` 且此前能生成小程序码 → 应已存在。
> 删旧 `/qrcodes` 死函数后，保留的 `/generate-qrcode` 仍读这两项是**独立配置**，别和 `MERCHANT_APP_ID` 混淆。

### D. emotion-compile LLM（⚪ 可选）
| Secret | 必需 | 默认值 | 用途 |
|---|---|---|---|
| `LLM_API_KEY` | ⚪ 可选 | 无 | 云端 LLM 语义编译；**未配则走本地规则引擎兜底** |
| `LLM_BASE_URL` | ⚪ 可选 | `https://api.openai.com/v1` | LLM 端点 |
| `LLM_MODEL` | ⚪ 可选 | `gpt-4o-mini` | 模型名 |

> 被用：emotion-compile。未配 `LLM_API_KEY` 时编译降级为本地规则，不影响主流程。

### E. 红包开关
| Secret | 必需 | 默认值 | 用途 |
|---|---|---|---|
| `REDPACKET_PAYOUT_ENABLED` | ⚪ | `false` | 是否真发现金红包；`true` 才调微信支付企业付款，`false` 时红包仅记账不发钱 |

---

## 三、一键检查当前已配哪些（本机）
```bash
supabase secrets list --project-ref pyqgsxcjmijtbstwthbn
```
Dashboard：Project Settings → API → 底部 "Edge Functions Secrets" 可查看已设密钥（值脱敏显示）。

---

## 四、本次部署需特别确认
1. **`MERCHANT_APP_ID` / `WX_SECRET`** —— wechat_miniapp_login（新建登录函数）强依赖，缺失会微信登录失败。
2. 删 generate-qrcode 旧 `/qrcodes` 死函数后，保留的 `/generate-qrcode` 读 `THIRD_PARTY_LOGIN_APP_ID` / `THIRD_PARTY_LOGIN_APP_SECRET`（与小程序 `MERCHANT_APP_ID` 是两套，别混淆）。
3. `LLM_API_KEY` 不配也能跑（走本地规则），但情绪编译质量会低一档；如需 LLM 增强需补配。
