# 资金流（Money Flow）测试

来店有喜后端资金流（建单 / 退款 / 分佣）的测试骨架。目标是把「金额口径」收口为
纯函数单一事实源，并为其建立可自动跑的单元 + 集成测试，防止资损类回归。

## 文件结构

```
supabase/functions/
├─ _shared/
│  ├─ money.ts            # 资金纯函数（无 Deno/supabase 依赖）★ 单一事实源
│  ├─ commission.ts        # 分佣 V5 纯函数（无 Deno/supabase 依赖）★ 单一事实源
│  ├─ supabase-mock.ts     # 内存版 Supabase 客户端（测试注入用）
│  ├─ money.test.ts        # 纯函数单测（deno test）
│  ├─ commission.test.ts    # 分佣 V5 单测（deno test）
│  ├─ flow.test.ts          # 建单→退款 全链路集成测试（注入 Mock）
│  └─ _sanity.ts           # node 直跑的纯函数冒烟（34 断言，无 deno 依赖）
├─ create-order/index.ts   # handleCreateOrder(req, deps?) 已留测试入口
└─ refund-order/index.ts   # handleRefundOrder(req, deps?) 已留测试入口
```

## 关键不变量（改公式必须先同步测试）

1. 🔴 **微信退款交易额（分）** = `(订单全额 − 健康豆抵扣) × 100`。
   误传 `total_amount*100`（含健康豆）会被微信以「订单金额不一致」拒绝 →
   所有混合支付订单退款必然失败。见 `money.ts::computeWechatRefundTotalCents`。
2. 可退款状态白名单 `['pending_ship','pending_receive','pending_review','completed','pending_pickup']`
   必须与前端「申请退款」入口一致（含 `pending_review` 纯健康豆堂食单）。
3. `payment_method` 合法枚举仅 `('wxpay','emotion_beans')`；旧 `gold_beans` 作废。
4. 跨门店拆单时健康豆只记首单（`beanUsedForSubOrder`），否则退款无法对账。
5. 分佣 V5：平台恒抽让利池 10%，三方按比例归一，任何段位不亏损。

## 本地运行

### 纯函数冒烟（无需 deno / 网络，最快）

```bash
node --experimental-strip-types supabase/functions/_shared/_sanity.ts
```

### 全套测试（deno，CI 同款）

```bash
deno test supabase/functions/_shared/
```

> `flow.test.ts` import 了真实 Edge Function（含 `jsr:@supabase/supabase-js` /
> `npm:wechatpay-axios-plugin`），只能在 deno 下跑；`money.test.ts` /
> `commission.test.ts` / `_sanity.ts` 仅依赖纯函数，node 亦可跑。

## 接入 CI（GitHub Actions 片段）

```yaml
money-flow-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: denoland/setup-deno@v2
      with: { deno-version: v2.x }
    - name: Run money-flow tests
      run: deno test supabase/functions/_shared/
```

建议作为「观察项→硬门禁」演进：先 `|| true` 跑通一轮，确认稳定后去掉 `|| true`
使其成为合并门禁（当前小程序 CI 为观察态，见 `.github/workflows/ci.yml`）。

## 扩展指引

- 新增金额口径 → 先在 `money.ts` / `commission.ts` 加纯函数，再在对应 `.test.ts` 加断言。
- 新增 EF 测试入口 → 把 `Deno.serve(fn)` 改为
  `export async function handleXxx(req, deps?) { ... if (import.meta.main) Deno.serve(handleXxx) }`，
  并在 `flow.test.ts` 注入 `MockSupabaseClient` + `getUser`。
- `supabase-mock.ts` 不做 RLS；如需模拟越权，请在测试里手动清表 / 断言返回 null。
