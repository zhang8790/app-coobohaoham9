# 退款链路重构（方案A）交付概览

> 日期：2026-07-20 ｜ 角色：Senior Developer（高级开发工程师）

## 结论：退款链条原本"不通"，现已修复并部署

诊断发现整条退款链存在多处资损级断点，已按方案A（以 `refund-order` Edge Function 为唯一退款引擎）完成重构。

## 一、原本为什么不通

| 断点 | 影响 |
|---|---|
| 前端 `applyRefund` 客户端直连 DB，用 anon key 直接 update 受益人 `profiles` | 跨用户写被 RLS 拦截 → 佣金扣回**静默失败 = 资损** |
| 同一函数**完全没调微信退款 API** | 微信支付订单点退款后状态变完成，但**用户实付款退不回来** |
| `refund-order` EF 是死代码（前端从未调用），且与前端写死 `status:'completed'` 冲突 | 两套实现并存、维护灾难 |
| admin-web 审核页只等 `pending_review` 才显示按钮，前端永远写 `completed` | 审核页永远空、且"通过"也不退钱 |
| **schema 漂移**：EF 引用已删除列 `refunded_amount`/`wechat_transaction_id` 与已移除 RPC `get_refundable_amount`/`update_order_refunded_amount` | EF 一上来 `select` 即 500，**从未真正跑起来** |

## 二、已修复内容

### `supabase/functions/refund-order/index.ts`（已部署）
- 删除失效 RPC/列引用；可退金额**内联计算**；已退金额**直写** `refund_amount`/`refund_ratio`/`refund_status`。
- 金豆返还从"仅纯金豆单"改为**所有路径按占比返还**（修混合单金豆部分永不退的 bug）。
- `Math.floor(refund_amount/0.01)` ×100 资损 bug → `Math.round(refund_amount*100)/100`（1 豆=1 元）。
- 佣金 clawback 从错误的 `commission_balance` 改扣 **`tb_balance`** + 写 `tongbao_logs type=commission_revoke`（2026-07-19 起佣金发 tb_balance）。
- `points_logs` 列名 `order_id/delta/balance_after/remark` → `related_order_id/amount/type/source`。
- 微信发起守卫 `wechat_transaction_id`（不存在）→ `payment_method==='wxpay'`。

### `supabase/functions/wechat-refund-callback/index.ts`（已部署）
- 已退金额 RPC → 直写 `refund_amount`/`refund_ratio`/`refund_status`/`status='after_sale'`。
- 佣金扣回覆盖 `in('pending','settled')` 且按 ratio 扣 `tb_balance` + `commission_revoke` 流水。
- `points_logs` 列名修正。

### 前端
- `src/db/api.ts` `applyRefund` 重写为调用 `supabase.functions.invoke('refund-order', {body})`（自动带用户会话），仅留轻量前置校验（登录/幂等/金额上界）。前端不再碰任何资金账户。
- `src/pages/refund-apply/index.tsx` 补 `processing`/`abnormal`/`closed` 状态图例；修正「已退款金额」读取字段。
- `src/db/types.ts` `Order.refunded_amount` → `refund_amount`（与线上真实列对齐）；`refund-apply` 三处 `refunded_amount` 读取同步改为 `refund_amount`（此前会显示成 0/undefined）。
- 上述三文件的失效列引用已 grep 全量排查，确认 `src` 目录内无残留 `refunded_amount`/`wechat_transaction_id`/失效 RPC。

### admin-web
- `Refunds.tsx` 改为**监控视图**：默认全部、补 `abnormal` 标签、移除失效的"通过/驳回"按钮（实际不退钱）；`getRefunds` 已支持 `'all'`。

## 三、验证结果
- 两 EF `supabase functions deploy` → EXIT=0（Deno 打包通过，无语法/类型错误）。
- admin-web `tsc -b` → EXIT=0。
- 只读 SQL 在真实订单模拟 EF 计算：纯金豆单 `wx=0`、`bean=全额`、每单 1 笔佣金待回冲 → 逻辑与列引用正确。
- 小程序 Taro 构建（`rm -rf .taro && taro build --type weapp`）后台执行中（冷构建约 20min+，项目常态），完成后即可将 dist 重传微信开发者工具验证。

## 四、遗留边界（已知，未在本任务处理）
1. **历史订单买家积分不扣回**：旧单因此前 `points_logs` 列名 bug 无 `purchase_earn` 流水，退款时积分扣回找不到流水 → 买家积分保留。新单已修。
2. **支付回调同受 schema drift**：`wechat-payment-callback` 仍向不存在的 `orders.wechat_transaction_id` 写 → 支付回调也是隐患，独立未修。
3. **微信实时退款未做端到端**：生产环境跑真实微信退款有资金风险，需在**测试环境 + 测试单**验证（建议下一步）。

## 五、建议的下一步
- 在测试环境用一笔 `emotion_beans` 测试单做端到端退款（无微信依赖，安全），核对：refunds 记录、tb_balance 返还、佣金回冲、积分扣回、订单状态。
- 用一笔 `wxpay` 测试单 + 微信沙箱/测试商户号验证微信退款发起与回调闭环。
- 修 `wechat-payment-callback` 的 `wechat_transaction_id` schema drift（独立隐患）。
