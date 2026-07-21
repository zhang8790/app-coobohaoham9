# 根因分析报告 · 两单纯情绪豆订单佣金未发

**日期**：2026-07-20
**场景**：调试复盘（根因分析）
**参与成员**：排障手（gstack-investigator）；主理人汇编
**关联任务**：gstack-commission-debug（来店有喜 · 佣金不分了 根因排查与统一分佣设计组）

---

## 📌 TL;DR（执行摘要）

- 整体结论：🔴 复发（与 2026-07-19 `00135_backfill_2_pending_commission` 同源）
- 两单纯情绪豆订单走 **`create-order` 纯豆路径**（`pay_mode='pure_gold'`），佣金未发的直接根因是**分佣触发失败被静默吞掉**，不复用 微信路径的加权算法使让利池基数也可能算错。
- 两条根因：
  - **B（致零发放，主因）**：`create-order` 与 `wechat-payment-callback` 调用 `distribute-commission` 都是"fire-and-forget"，失败只 `console.error`，从不回写 `commission_distributed`、不重试、不留失败标记。引擎中途抛错 → 订单永远 `commission_distributed=false` → 佣金真漏发（与 00135 的"distribute-commission 在 commissions.insert 前静默崩了"完全同构）。
  - **A（致算错，统一缺口）**：`create-order` 纯豆分支只传**门店级 flat `referral_rate`**，未像 微信路径那样按"商品自身让利点 × 金额加权"混合；多商品不同让利点下让利池基数算错，两条路径算法不统一。
- 另有 1 个真实 bug：微信回调 `net_amount` 用 `goldBeansUsed * 0.01`（应为 `*1`，1 豆=1 元），仅影响通道费基数，不影响佣金额。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🔴 需修复后补发 |
| 严重度分布 | 🔴 2（B 静默吞失败、A 纯豆不加权）/ 🟠 1（net_amount 缩放错） |
| 关键行动项 | 3 条 |
| 建议负责人 | 排障手定位 → 产品官出统一算法 → 质量门神补发+回归 |

---

## 1. 分佣触发链路总览（两条路径）

| 路径 | 入口 | 触发 distribute-commission 的位置 | 传入 discount_rate |
|------|------|----------------------------------|--------------------|
| 纯豆（情绪豆） | `supabase/functions/create-order/index.ts` `pay_mode==='pure_gold'` | 行 182-212，同步 `functions.invoke` 包 try/catch | **门店级 flat 率**（行 186-195） |
| 微信（含混合） | `supabase/functions/wechat-payment-callback/index.ts` | 行 167-177，异步 `.catch` | **按商品金额加权混合率**（行 121-141） |

分佣引擎：`supabase/functions/distribute-commission/index.ts`（V5 动态分佣）。

---

## 2. 根因 A —— 纯豆路径未对多商品让利点加权（算法不统一）

**位置**：`create-order/index.ts:186-207`

```ts
let discountRate = 0.09
if (order.store_id) {
  const { data: sd } = await supabase.from('stores')
    .select('referral_rate, referral_rate_enabled').eq('id', order.store_id).maybeSingle()
  const enabled = sd?.referral_rate_enabled !== false
  discountRate = enabled ? (Number(sd?.referral_rate ?? 0.09)) : 0   // ← 只有门店级 flat 率
}
await supabase.functions.invoke('distribute-commission', {
  body: { ..., discount_rate: discountRate }   // ← flat 率喂给引擎
})
```

对比 **微信路径** `wechat-payment-callback/index.ts:121-141` 已正确实现：

```ts
// 每商品用【自身 discount_rate（整数%÷100）】，未设则回退门店率；按金额(price×quantity)加权
let totalAmt = 0, weightedSum = 0
for (const it of items) {
  const amt = price*qty
  const pRate = (typeof pct === 'number' && pct > 0) ? pct/100 : storeFallback
  totalAmt += amt; weightedSum += amt * pRate
}
if (totalAmt > 0) effectiveRate = weightedSum / totalAmt
```

**问题**：纯豆订单若含多商品、且各商品 `discount_rate`（让利点）不同，纯豆路径用门店 flat 率算让利池，而微信路径用加权混合率——**同一购物车，两种支付方式佣金基数不同**，与用户"统一多商品不同让利点加权算法"诉求直接冲突。

> 注意：A 自身通常导致"算错金额"而非"零发放"（只要门店率非 0 且引擎成功）。但它解释了为何两条路径结果不一致，是统一机制要消灭的缺口。

---

## 3. 根因 B —— 分佣触发失败被静默吞掉（真·零发放主因）

**证据链（与 00135 同源）**：

1. `create-order/index.ts:208-210`：`distribute-commission` 调用包在 try/catch，**只 `console.error`**，不回写 `commission_distributed`、不重试。
2. `wechat-payment-callback/index.ts:177`：`.catch(e => console.error(...))`，异步 fire-and-forget；回调已 `return SUCCESS`，引擎若 500/抛错，佣金永不上账。
3. `distribute-commission/index.ts:520-522`：引擎任意异常返回 HTTP 500 `{error}`，且**全程不设置 `commission_distributed`**。
4. 引擎幂等保护（行 219-222）仅在 `commission_distributed=true` 时跳过；一旦中途崩溃没走到行 485 的标记，订单永远 `false`。
5. 历史 `00135` 迁移注释明确：*"distribute-commission EF 在 commissions.insert 之前静默崩了，commission_distributed 一直 false，commissions 表 0 行，张林金豆未到账"* → 手动补齐。

**结论**：两单纯情绪豆订单佣金未发 = 根因 B 复发。引擎在 `commissions.insert`（行 427）之前或 `fetchBeneficiaryMetrics`/画像读取环节抛错（RLS、枚举越界、null 解引用等历史诱因都还在），订单创建成功但佣金静默丢失，且无任何失败标记可供补跑脚本可靠捕获（补跑脚本依赖 `commission_distributed=false`，但也可能被"已完成/已标记"状态误判跳过）。

---

## 4. 附：其他发现的真实 bug

| # | 位置 | 问题 | 影响 |
|---|------|------|------|
| C | `wechat-payment-callback/index.ts:166` | `goldBeansUsed * 0.01` 缩放错误（应为 `*1`，1 情绪豆=1 元）；且未对 `total_amount` 封顶 | `net_amount`（微信通道费基数）被少算 100×，仅影响通道费计提，不影响佣金额 |
| D | `create-order/index.ts:204` | 纯豆路径 `net_amount: 0` 固定 | 纯豆无微信现金，正确；但混合支付若复用此分支会漏算通道费（当前混合走微信回调，影响有限） |

---

## ✅ 行动清单（排障手建议）

| # | 行动 | 负责方 | 紧急度 |
|---|------|--------|--------|
| 1 | **统一加权算法**：将微信路径的"按商品让利点×金额加权"抽为共享函数，`create-order` 纯豆分支复用，消除根因 A | 产品官 + 排障手 | P0 |
| 2 | **消除静默吞失败（根因 B）**：触发调用加 `commission_distributed` 失败标记/重试队列；引擎崩溃前先置 `commission_failed=true`，补跑脚本据此重发，杜绝"假成功/真漏发" | 排障手 | P0 |
| 3 | 修复 `net_amount` 缩放 bug（根因 C） | 排障手 | P1 |
| 4 | 用截图两单的 order_no 在 `orders`/`commissions` 拉取实际状态，定性是 B、A 还是 referrer 缺失导致，并补发 | 质量门神 | P0（依赖截图） |

---

## ⚠️ 待完善 / 已知局限

- 本报告基于代码静态分析 + 历史迁移 `00135`/`00130`。**两单的精确归属（order_no / order_id）需用户提供截图**才能落地补发与定性（是 B 静默崩、A 算错、还是 referrer_id 缺失导致"假分佣"）。
- 未读前端 `commission-calculator-v5.ts` 与支付页预览，前后端加权口径一致性需产品官复核。

---

## 📚 成员产出索引

- 排障手（gstack-investigator）原始产出：本文档
- 待产品官（gstack-product-reviewer）产出：统一加权分佣算法定稿 `feature-commission-weighted-2026-07-20.md`
- 待质量门神（gstack-qa-lead）产出：补发脚本 + 双路径回归

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
