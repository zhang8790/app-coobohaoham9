# 商家货款结算体系（方案 A）— 设计与交付说明

> 状态：**代码包已落地，两端编译验证通过**（admin-web `tsc -b` ✅ / `vite build` ✅；小程序 `taro build --type weapp` ✅）。
> 2026-07-19 追加：修复 payout 分账链路两个硬伤（`orders.transaction_id` 列名错误、`merchant_settlement_ids` 未分配），新增 `00121` 补充迁移。
> 本文档说明架构设计、三个已确认决策的落点、本机执行步骤，以及真实分账打款的接入点。

---

## 一、问题背景（真实缺口）

原模型中，用户用「情绪豆」支付购买商家商品时：

- 豆只从买家 `tb_balance` 扣减后**焚毁**；
- 商家端仅有 GMV **展示数字**，**没有任何货款入账**（无 `merchant_balance`、无结算逻辑、无分账）；
- 资金链实际是「用户充 RMB → 平台收款 → 商家 0 入账」，构成资产缺口。

用户提问确认后，选定 **方案 A：完整商家货款以 RMB 结算、可提现**，且**不走情绪豆转让红线**，合规走**微信支付服务商分账**。

---

## 二、设计模型（三账隔离 + 净额结算）

### 2.1 三个互相隔离的资产账户

| 账户 | 字段 | 性质 | 是否可提现 | 备注 |
|---|---|---|---|---|
| 情绪豆 | `profiles.tb_balance` | 平台内部消费币 | ❌ 不可 | 1:1 锚定 RMB，不可二级转让（既有规则不变） |
| 推广佣金 | `profiles.commission_balance` | 拉新获客成本 | ✅ 可 | 与货款严格隔离（既有规则不变） |
| **商家货款** | `stores.merchant_balance` | **本次新增** | ✅ 可 | 销售回款，与情绪豆/佣金三账隔离 |

> 合规姿态：情绪豆与佣金/货款**永不直接互转**；货款是真实的销售回款，渠道是微信分账，**平台不池化商家销售资金（规避二清）**。

### 2.2 结算公式（净额结算，豆付等值计入）

订单 `status → 'completed'` 时，由 `fn_settle_order` 自包含算出商家应收（**不依赖** distribute-commission 是否已跑，纯情绪豆订单也能结算）：

```
现金部分  cash    = max(0, total_amount − tb_used)
让利率    rate    = stores.referral_rate > 1 ? referral_rate/100 : referral_rate   -- 单位归一（>1 当百分比）
让利池    pool    = round(total_amount × rate, 4)                                  -- 含豆付等值部分
通道费    channel = round(cash × 0.006, 4)                                         -- 仅对真实现金部分计提
应收货款  settle  = max(0, round(total_amount − pool − channel, 4))
```

要点：

- **情绪豆支付部分「等值计入」结算额**，由平台以自有资金垫付（用户充值时平台已收 RMB，垫付无额外成本），**不要求商家持有/接收情绪豆**；
- **微信通道费仅对真实现金部分（total − tb_used）计提**，纯豆订单通道费 = 0；
- 让利池按订单**全额**计提（覆盖推广/L1/L2/买家积分/平台），与 distribute-commission 的口径独立、互不干扰。

### 2.3 结算触发路径（覆盖全链路）

- **触发器 `trg_orders_settle`**：`orders.status` 由非 `completed` 变为 `completed` 时自动 `PERFORM fn_settle_order(NEW.id)`；
- 触发器**吞掉内部异常**，结算失败**绝不阻断**订单完成；
- 覆盖多条完成路径，**纯情绪豆订单也能在此触发结算**：
  - 买家提交评价（`submitReviews` → `status='completed'`）；
  - **商家确认完成**（`merchantCompleteOrder` / 后台 `handleComplete`，从 `pending_receive`/`pending_pickup`/`pending_review` 直接置 `completed`）——已按用户决策「商家确认即完成」实现，不依赖买家评价，契合水果店到店/自提场景；
  - **超时自动完成（兜底）**：`auto-complete-orders` Edge Function 定时扫描 `status='pending_review'` 且 `verified_at` 早于 `AUTO_COMPLETE_DAYS`（默认 7 天，环境变量可覆盖）的订单，自动置 `completed`；覆盖「买家不评价 + 商家不点确认完成」导致货款永久挂账的场景；与商家确认完成**并存、互不冲突**（已 completed 的订单不再被匹配）；
- 幂等：`fn_settle_order` 对已结算订单直接返回既有记录。

---

## 三、三个已确认决策的落点

| # | 决策 | 落点 |
|---|---|---|
| q-0 | **资金下发 = 微信服务商分账直达** | `merchant-payout` EF `action:'payout'` 调微信 v3 `profitsharing.orders`，资金直达 `stores.wx_sub_mch_id`（子商户号），平台不池化 → 规避二清 |
| q-1 | **结算口径 = 净额结算，豆付等值** | `fn_settle_order` 公式（§2.2）；豆付部分 `tb_portion` 记入台账、平台垫付 |
| q-2 | **本期范围 = 可执行代码包** | 迁移 SQL + Edge Function + 小程序 UI + 网页后台 UI 全部落地；**真实打款留接入点**（缺证书/子商户号时返回 `NEED_CONFIG` / `NEED_SUB_MCH` / `MANUAL_PAYOUT`），需用户本机配置后启用 |

---

## 四、交付物清单

### 数据库（需用户本机执行）
- `supabase/migrations/00120_merchant_settlement.sql`（基础货款结算体系）
  - `stores` 加 `merchant_balance` / `settlement_frozen` / `wx_sub_mch_id`
  - 新建 `merchant_settlements` 台账（DISABLE RLS）
  - `withdrawals` 加 `kind`(`commission`/`settlement`) / `merchant_settlement_ids`
  - RPC：`fn_settle_order` / `fn_reverse_settlement` / `fn_merchant_withdraw` / `fn_get_store_settlement`
  - 触发器：`trg_orders_settle`
- `supabase/migrations/00121_fix_merchant_payout_allocation.sql`（payout 链路修复）
  - `merchant_settlements` 加 `withdrawal_id` 及索引
  - **重写 `fn_merchant_withdraw`**：创建货款提现时按 FIFO 分配未提现的结算台账行，回填 `withdrawals.merchant_settlement_ids`
  - **重写 `fn_reverse_settlement`**：回冲时清除 `withdrawal_id`
  - schema cache reload
- `supabase/migrations/00122_fix_settle_order_tb_portion.sql`（fn_settle_order 热修，可选）
  - 仅 `CREATE OR REPLACE` 重设 `fn_settle_order`，把台账 `tb_portion` 改为 `LEAST(tb_used, total_amount)` 兜底，保证「豆付+现金=全额」恒成立
  - 适用：若你**先部署了未含 LEAST 兜底的旧版 00120**，跑本文件即热修；若 00120 已是修后版本，本文件等同一次无害重设
  - 不改动表结构/数据/触发器，可重复执行

### Edge Function（接入点，需部署）
- `supabase/functions/merchant-payout/index.ts`
  - `ledger` 台账查询 · `backfill` 历史补结算 · `payout` 微信服务商分账
  - `payout` 逻辑：读取提现单关联的 `merchant_settlement_ids` → 按订单读取 `orders.wechat_transaction_id` → 每笔订单的**微信现金实付部分**调微信 v3 分账；**情绪豆垫付部分**走 `MANUAL_PAYOUT` 自有资金通道
- `supabase/functions/auto-complete-orders/index.ts`（**超时自动完成兜底**）
  - 定时（建议每日 02:00）扫描 `status='pending_review'` 且 `verified_at` 早于阈值（默认 `AUTO_COMPLETE_DAYS=7`，环境变量可覆盖）的订单，批量置 `completed`；
  - 由 `trg_orders_settle` 触发器自动结算货款；无需额外 Secrets（仅 service_role key 直改库）；
  - 部署后需在 Supabase Dashboard → Database → Scheduled Functions 配置每日调用（见步骤 2.5）。

### 小程序端（已编译通过）
- `src/db/types.ts`：`Store` 补 `merchant_balance/settlement_frozen/wx_sub_mch_id`；`Withdrawal` 补 `kind` 等
- `src/db/api.ts`：新增 `getMerchantSettlement` / `getMerchantSettlements` / `applyMerchantWithdrawal`
- `src/pages/merchant-center/index.tsx`：商家中心加「可结算货款」绿松石卡 + 去提现按钮
- `src/pages/withdraw/index.tsx`：提现页支持 `?kind=settlement&storeId=` 货款提现模式

### 网页后台（已编译通过）
- `admin-web/src/types/index.ts`：`Withdrawal` / `MerchantSettlement` 类型（含 `withdrawal_id`）
- `admin-web/src/api/admin.ts`：`getMerchantSettlements` / `getMerchantSettlementSummary` / `getStoreSettlementBalances` / `triggerSettlementBackfill` / `triggerSettlementPayout` / `paySettlementWithdrawal` / `rejectSettlementWithdrawal`（驳回时释放 `merchant_settlements.withdrawal_id`）
- `admin-web/src/pages/MerchantSettlements.tsx`：货款结算台账页（汇总卡 + 补结算按钮 + 安全说明）
- `admin-web/src/pages/Withdrawals.tsx`：提现审核支持「佣金 / 货款」类型切换，货款走分账打款
- `admin-web/src/App.tsx` + `Layout.tsx`：路由 `/merchant-settlements` + 导航「货款结算」

---

## 五、本机执行步骤

### 步骤 1：执行迁移 SQL（沙箱无 CLI/Token，需用户本机）
三选一（推荐 Dashboard SQL Editor 最省事），**00120 与 00121 都要执行**（若你先部署过旧版 00120，再补跑 **00122** 热修）：

```bash
# 方式 A：Supabase CLI（本机已配 token）
supabase db push            # 或 supabase migration up

# 方式 B：psql 直连（用连接串）
psql "$DATABASE_URL" -f supabase/migrations/00120_merchant_settlement.sql
psql "$DATABASE_URL" -f supabase/migrations/00121_fix_merchant_payout_allocation.sql
psql "$DATABASE_URL" -f supabase/migrations/00122_fix_settle_order_tb_portion.sql   # 热修（可选，见上）

# 方式 C：Supabase Dashboard → SQL Editor → 依次粘贴 00120、00121、00122 全文执行
```
执行后留意结尾 `RAISE NOTICE` 诊断输出，确认 `stores`(3 列) / `withdrawals`(2 列) / `merchant_settlements`(withdrawal_id) 已新增；00122 会输出 `fn_settle_order 已重设（含 tb_portion LEAST 兜底）`。
若 PostgREST schema cache 未自动刷新，到 Dashboard → Database → 点 **Reload schema cache**。

### 步骤 2：部署 merchant-payout Edge Function
```bash
supabase functions deploy merchant-payout
```

### 步骤 2.5：部署 auto-complete-orders 并配置定时任务（超时兜底）
```bash
supabase functions deploy auto-complete-orders
```
部署后在 Supabase Dashboard → Database → **Scheduled Functions**（底层 pg_cron）新建每日 02:00 定时任务，调用 `auto-complete-orders`；
如需调整超时天数，在该 Function 的环境变量里设置 `AUTO_COMPLETE_DAYS`（默认 7）。
> 也可本机 cron 定时 `curl -X POST https://<project>.supabase.co/functions/v1/auto-complete-orders -H "Authorization: Bearer <service_role_key>"`。

### 步骤 3：配置微信支付证书 Secrets（真实分账前置）
在 Supabase Dashboard → Edge Functions → Secrets 或与 `create-wechat-payment` **共用同一套**环境变量：

```
MERCHANT_ID
MERCHANT_APP_ID
MCH_CERT_SERIAL_NO
MCH_PRIVATE_KEY
WECHAT_PAY_PUBLIC_KEY_ID
WECHAT_PAY_PUBLIC_KEY
```
> 未配置时，`payout` 会返回 `NEED_CONFIG` 并提示线下转账后手动置「已打款」。

### 步骤 4：维护每个商家的子商户号 `stores.wx_sub_mch_id`
- 微信支付服务商模式下，每个入驻商家需有**子商户号**；
- 在 admin 后台「商家管理」维护（或 `UPDATE stores SET wx_sub_mch_id='...' WHERE id='...'`）；
- 未配置时，`payout` 返回 `NEED_SUB_MCH`，需平台以自有资金经银行转账完成（审核页「执行分账打款」会提示）。

### 步骤 5：历史补结算（已有「已完成」订单）
- **后台按钮**：网页后台「货款结算」页 → 点「历史补结算」→ 调 `merchant-payout` 的 `backfill`；
- **或手动 SQL**：
  ```sql
  SELECT public.fn_settle_order(id) FROM orders
   WHERE status='completed' AND store_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM merchant_settlements WHERE order_id=orders.id);
  ```

---

## 六、真实分账打款接入点（运营流程）

1. 订单完成 → 触发器自动结算 → `stores.merchant_balance` 累加，并写入 `merchant_settlements`；
2. 商家在「货款提现」页申请 → `fn_merchant_withdraw` 原子扣减余额，**按 FIFO 分配未提现的结算台账行**，回填 `withdrawals.merchant_settlement_ids`，写 `withdrawals(kind='settlement', status='pending')`；
3. 后台「货款兑付」审核 → 点「审核通过」(`pending→approved`)；
4. 点「执行分账打款」→ `triggerSettlementPayout` → `merchant-payout` `payout`：
   - 读取提现单关联的结算台账，按订单获取 `orders.wechat_transaction_id`；
   - 每笔订单的**微信现金实付部分**调微信 v3 分账，`PROFITSHARING_SENT` → 本地置 `paid`；
   - 每笔订单的**情绪豆垫付部分**走 `MANUAL_PAYOUT`，需平台自有资金经银行转账/企业付款完成；
   - 缺配置 → `NEED_CONFIG` / `NEED_SUB_MCH`，提示线下处理；
5. 驳回 → `rejectSettlementWithdrawal` 退回货款到 `merchant_balance`，**清除结算台账的 `withdrawal_id` 占用**，再置 `rejected`。

> 退款/争议时：`fn_reverse_settlement` 回冲对应 `merchant_settlements` 并扣减 `stores.merchant_balance`（不允许负）。

---

## 七、验证与回滚

- **编译验证**（已完成）：
  - admin-web：`tsc -b` 通过、`vite build` 通过；
  - 小程序：`taro build --type weapp` 通过，`dist/app.js` 产出。
- **运行前置**：迁移 00120 + 00121 必须先在线上执行（源码已按新列编写，未跑迁移则运行时报 `column does not exist`）。
- **回滚**：如需回滚，先删 00121（恢复 `fn_merchant_withdraw` 等），再删 00120（触发器、RPC、4 个新列与 `merchant_settlements` 表）；注意先归档台账数据。小程序/后台旧代码不依赖新表，可独立回滚 UI。

---

## 八、已知限制（本期留接入点，非 bug）

1. 微信分账须先有 `wechat_transaction_id`（订单支付回调 `wechat-payment-callback` 已落库）；纯情绪豆订单无交易号，其货款部分走 `MANUAL_PAYOUT` 自有资金通道。
2. 每笔订单的微信现金实付部分（`cash_portion`）才允许走微信分账；情绪豆垫付部分（`tb_portion`）由平台自有资金支付。
3. 分账状态为异步（`PROCESSING`→`FINISHED`），本期在成功发起后即乐观置 `paid`（与既有佣金打款乐观策略一致）；如需严格对账可后续加 webhook 终态回调。
4. `fn_merchant_withdraw` 已按 FIFO 分配未提现的结算台账行，并写入 `withdrawals.merchant_settlement_ids`；若后续调整分配策略（如允许按订单选择），需同步修改 `merchant-payout` 的查询逻辑。
5. **超时自动完成**（`auto-complete-orders`）默认 7 天阈值、以 `orders.verified_at`（进入待评价的时间戳）为起算点；仅覆盖已「确认收货/核销」但无人收尾的订单。一直处于 `pending_receive`（用户从未确认收货）的订单不被本任务处理，需商家主动点「确认完成」兜底。
