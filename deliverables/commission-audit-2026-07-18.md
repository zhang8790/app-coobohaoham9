# 分佣通道畅通性审计报告

> 审计时间：2026-07-18 20:59
> 审计范围：前端小程序 / 后端 Edge Functions / 管理后台 admin-web 三端分佣全链路
> 审计方式：全代码静态走查 + 数据库迁移列核对（沙箱无线上写凭证，运行态需本机确认）

## 一、总结论

**分佣通道在「代码 + 数据库」层面是畅通的**，三端均具备正确的读取/写入路径：

| 端 | 角色 | 畅通性 | 说明 |
|----|------|--------|------|
| 后端 distribute-commission | 分佣发放 | ✅ 畅通 | 纯情绪豆 / 微信双路径都触发，V5 算法完整，写 commissions + 累加 commission_balance + 发通知 |
| 前端小程序 | 分佣显示 | ✅ 畅通 | my-promotion / commission-detail 直读 commissions 表（RLS 本人可读）+ get_rank_progress RPC（SECURITY DEFINER） |
| 管理后台 admin-web | 分佣显示 | ✅ 畅通（依赖配置） | 用 service_role 客户端绕过 RLS 读全量 commissions |

「测不出分佣」更可能是**运行态问题**（函数未部署/未触发、环境未配置），而非代码断点。

---

## 二、全链路视图

```
订单支付
  ├─ 纯情绪豆(pure_gold) ── createOrderV2(api.ts:1174) ──► invoke distribute-commission
  └─ 微信/混合(wxpay) ────── wechat-payment-callback(:139) ──► invoke distribute-commission
                                                        │
                                                        ▼
                              distribute-commission/index.ts (V5 算法)
                                ├─ 幂等守卫 commission_distributed
                                ├─ 写 commissions 表（L1/L2 行）
                                ├─ 累加 profiles.commission_balance（净额）
                                └─ send-notification(commission_arrived)
                                                        │
                  ┌─────────────────────────────────────┼───────────────────────────┐
                  ▼                                     ▼                           ▼
          前端 my-promotion                     前端 commission-detail          admin-web Ledgers/Finance
          (commissions + RPC 余额)              (getMyCommissions)             (service_role 全量读)
```

---

## 三、各环节明细

### A. 后端 Edge Functions

**distribute-commission/index.ts**（分佣核心）
- V5 算法完整：RANK_TABLE 已收敛（无心境/悟心/静心/明心/初心/凡心），ACTIVE_ORDER_STATUSES 已修正（去除 22P02 枚举越界值 `paid`/`used`）。
- 幂等守卫 `commission_distributed` 防重复分佣 ✅
- 写入：`commissions` 表 + 累加 `profiles.commission_balance`（净额，已扣通道费+个税）+ 推送 `commission_arrived` 通知 ✅
- 纯情绪豆支持：`net_amount=0` 且 `total_amount>0` 时走 `isGoldOrder` 分支，以 `total_amount` 作分佣基数、`channelFee=0` ✅

**触发路径（双保险）**
- 纯情绪豆：`src/db/api.ts:1174` 在 `createOrderV2` 内 `invoke('distribute-commission', { net_amount: 0, ... })` ✅
- 微信/混合：`supabase/functions/wechat-payment-callback/index.ts:139` 在回调成功后 `invoke('distribute-commission')` ✅

### B. 前端小程序

- `my-promotion/index.tsx`：
  - 佣金概览 → `commissions` 表（`beneficiary_id = auth.uid()`，RLS 通过）按 status 汇总
  - 佣金余额 → `get_rank_progress(uuid)` RPC（`SECURITY DEFINER`，返回 `commission_balance`）
- `commission-detail/index.tsx`：`getMyCommissions(0,50)` 直读 `commissions` 表 ✅
- RLS：`beneficiary_read_own_commissions`（`beneficiary_id = auth.uid()`）→ 本人可读 ✅

### C. 管理后台 admin-web

- `src/lib/supabase.ts:18`：`export const supabase = serviceKey ? createClient(url, serviceKey, ...) : supabaseAuth`
  → **配置了 `VITE_SUPABASE_SERVICE_ROLE_KEY` 时走特权客户端，BYPASS RLS 读全量** ✅
- `Ledgers.tsx`（佣金流水）、`FinanceDashboard.tsx`（推广佣金支出）、`Withdrawals.tsx`（佣金兑付）、`Orders.tsx`（单笔佣金合计）均从 `commissions` / `profiles.commission_balance` 读取 ✅

### D. 数据库列完整性

| 列 | 表 | 状态 | 迁移 |
|----|----|------|------|
| commission_balance | profiles | ✅ | 00058 |
| commission_distributed | orders | ✅ | 00003 / 00108 |
| channel_fee / channel_fee_rate / tax_withheld | orders | ✅ | 00082 / 00083 |
| channel_fee / tax_withheld / net_amount | commissions | ✅ | 00083 |

---

## 四、发现的问题（按优先级）

### ⚠️ P1 — `orders.net_amount` 列缺失（影响段位精度，不阻断发佣）
- `distribute-commission` 的 `fetchBeneficiaryMetrics` 读取 `orders.net_amount`（第 125 行），但**该列在 orders 表从未创建**（00083 只给 `commissions` 加了 `net_amount`）。
- 后果：该查询抛 PGRST 错误 → 被 catch 降级为 `profiles.total_consumption`（终身消费）+ 系数不衰减（activeMult=1, recruitMult=1）。
- **不影响发佣发放和比例**（凡心兜底 l1=0.40），但「近6月滚动段位 / 活跃衰减 / 拓新衰减」系数拿不到真实值。
- 修复：补列（纯 SQL，不需重部署函数）
  ```sql
  ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS net_amount numeric(12,2) NOT NULL DEFAULT 0;
  COMMENT ON COLUMN public.orders.net_amount
    IS '实际现金支付净额（扣除情绪豆抵扣），分佣基数参考';
  ```

### ⚠️ P2 — `wechat-payment-callback` 混合支付基数少乘 100 倍（需重部署）
- `index.ts:138`：`const netCashAmount = Math.max(0, total - goldBeansUsed * 0.01)`
- 应为 `* 1`（项目约定 1 情绪豆 = 1 元，见 `payment/index.tsx` 的 `GOLD_BEAN_RATE = 1`）。
- 后果：微信**混合支付**订单的分佣基数偏大（`*0.01` 导致扣太少豆），平台让利偏多。纯情绪豆（`net_amount` 硬编码 0）与纯微信订单不受影响。
- 修复：改 `* 0.01` → `* 1`，然后 `supabase functions deploy wechat-payment-callback`。

### ⚠️ P3 — 段位名称前后端不一致（仅显示，不影响金额）
- 前端 V5：`凡心 / 初心 / 明心 / 静心 / 悟心 / 无心境`
- 后端 RPC `get_rank_progress`：`江湖散修 / 外门弟子 / 内门弟子 / 核心弟子 / 长老 / 掌门`
- 阈值完全一致（0/200/800/2000/6000/20000），分佣比例一致，仅用户看到的段位名不同。建议统一（二选一对齐）。

---

## 五、运行态确认项（沙箱无线上凭证，需你本机验证）

1. **distribute-commission 函数是否在线且为最新版**（2026-07-18 优化版：含 RANK_TABLE 收敛 + ACTIVE_ORDER_STATUSES 修正）。旧版有 22P02 枚举越界 → 全员不分佣。
2. **admin-web 是否配置 `VITE_SUPABASE_SERVICE_ROLE_KEY`**。未配置则退化 anon → 后台佣金列表读 0 行（空白）。检查 `admin-web/.env` 或部署环境变量。
3. **1870 是否已完成登录并真实下单触发分佣**（需先跑 `scripts/fix-1870-password.sql`，且 1870.profile.referrer_id 指向 1856）。

---

## 六、如何验证分佣真的发出（跑 00118）

```
打开 Supabase Dashboard → SQL Editor → 运行 scripts/00118_verify_1856_commission.sql
```

预期结果应能看到：
- 1856 的 `commissions` 表出现 1 条 `level=1` 记录（beneficiary_id = 1856.id）
- `profiles.commission_balance`（1856）相应增加
- `notifications` 表出现 `commission_arrived` 通知（注意列名是 `read_at`，不是 `read`）
- 1870 订单 `commission_distributed = true`

若 1856 的 commissions 无记录 → 说明 distribute-commission 未触发/未在线 → 回到「五、运行态确认项」逐条排查。

---

## 七、本次审计未改动代码（仅静态走查）

如需我直接落地修复，建议顺序：P1（补列 SQL，立即跑）→ P2（改回调 + 重部署）→ P3（统一段位名）。确认后我再动手。
