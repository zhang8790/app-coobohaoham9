# 现金红包「真发钱」上线指南

> 适用：来电有喜小程序 `red_packet` 类活动，领取后通过微信支付 v3「商家转账到零钱」把真实现金打到用户微信零钱。
> 代码改动：`supabase/functions/send-redpacket/index.ts`（服务端自取 openid / 防重复 / 金额校验）、`src/pages/campaign-claim/index.tsx`（进页自动补齐 openid）。

---

## 一、前置条件（必须满足，否则打开开关必失败）

1. **商户号已开通「商家转账到零钱」产品**（微信支付商户平台 pay.weixin.qq.com → 产品中心）。
2. **已申请转账场景 `1000`（现金营销）并通过审批**。（若改用其他场景 ID，需改 `send-redpacket` 中的 `TRANSFER_SCENE_ID`）
3. **`MERCHANT_APP_ID` 必须是小程序 appid**（不是公众号 appid），且该小程序已绑定到上述商户号。

> 这 4 个密钥（`MERCHANT_ID` / `MERCHANT_APP_ID` / `MCH_CERT_SERIAL_NO` / `MCH_PRIVATE_KEY`）与现有 JSAPI 支付（`create-wechat-payment`）**共用**，应已存在，仅需核对值正确。

---

## 二、Supabase Secrets 配置

新增一个开关 Secret：

| Key | Value |
| --- | --- |
| `REDPACKET_PAYOUT_ENABLED` | `true` |

设置方式（二选一）：
- **控制台**：Supabase 后台 → Project Settings → Edge Functions → Secrets → 新增 `REDPACKET_PAYOUT_ENABLED` = `true`
- **CLI**：
  ```bash
  supabase secrets set REDPACKET_PAYOUT_ENABLED=true
  ```

---

## 三、部署函数

```bash
supabase functions deploy send-redpacket
```

> 函数内部已用 `getUser()` 鉴权，无需 `--no-verify-jwt`；前端 `functions.invoke` 会自动携带登录态 token。

---

## 四、验证

1. 用真实微信用户（在小程序内打开，openid 会自动补齐）进入一个 `campaign_type='red_packet'` 的活动页并领取。
2. 查 `redpacket_payouts` 表：该用户本次记录 `status` 应为 `success`，`wx_transfer_bill_no` 非空。
3. 用户微信零钱应收到对应金额（异步，通常秒到）。
4. 测试账号（邮箱/手机号登录）首次进页也会自动通过 `wx.login` 补齐 openid，可正常发钱。

---

## 五、灰度与回滚

- **上线前先用极小金额活动（如 0.1 元）验证一笔**，确认链路通再放大额。
- **暂停真发钱**：把 `REDPACKET_PAYOUT_ENABLED` 改为 `false`。新领取仅记录 `pending_manual`，已受理（`success`/`processing`）的不受影响。
- **失败排查**：看 `redpacket_payouts.error_msg`，常见为「场景未开通」「openid 与 appid 不匹配」「金额超限」「商户密钥缺失」。
- **失败批量重试**：当前需人工/脚本重跑；后续可加管理后台重试入口（P2 待办）。

---

## 六、安全与防资损要点

- 密钥仅存于 Supabase Secrets，绝不下发前端。
- `send-redpacket` 已做**同一用户+活动防重复发放**（已 `success`/`processing` 直接返回，绝不再打款）。
- 单笔金额强制 0.1~200 元（微信「商家转账到零钱」限额），超限直接拒绝。
- 开关关闭期间所有红包仅落 `pending_manual`，不影响线上其他功能。
