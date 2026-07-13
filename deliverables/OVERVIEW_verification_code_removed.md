# 取消"核销码"，到店消费即视为已使用

> 改动日期：2026-07-09 ｜ 编译：`taro build --type weapp` 23.01s，BUILD_EXIT=0

## 背景（用户场景澄清）
到店扫码点餐、当场就消费，中间不需要"出示核销码 → 商家核销"环节。
原 `pending_pickup`(待核销) 流程与场景不匹配，且"核销"还连着佣金/确权触发，
不能只删 UI——必须在支付成功时自动补上核销效果（`is_used=true`）。

## 用户拍板
- 堂食 / 自取（到店消费）：支付成功 → 直接 `pending_review`(待评价) + `is_used=true` + `verified_at`，跳过待核销。
- 自取同样去掉核销。
- 外卖配送维持 `pending_ship`，不变。

## 代码改动
| 文件 | 改动 |
|---|---|
| `src/db/api.ts` (`createOrderV2`) | `isInStore = service_type!=='delivery'`；纯金豆到店订单插入即 `status:'pending_review'` 并条件展开 `{is_used:true, verified_at:now}`（支付即已使用，最可靠，不依赖后续 update）。外卖仍 `pending_ship`。 |
| `src/pages/payment/index.tsx` | `paidStatus()` → `paidOrderUpdate()`：返回完整 update 载荷（到店 `{status:'pending_review', is_used:true, verified_at, paid_at}`，外卖 `{status:'pending_ship', paid_at}`）。4 处更新点（confirmMultiStoreOrders / 单店金豆 / 微信支付成功双分支）全部替换。 |
| `src/pages/order-center/index.tsx` | 删 `verifyModal` state、"出示核销码"按钮、`{verifyModal&&...}` 弹窗、TABS 中 `pending_pickup` 项。 |
| `src/pages/merchant-orders/index.tsx` | 删 `merchantVerifyPickup` import、`handleVerify`、"核销"按钮、tab 中 `pending_pickup` 项及 label/color/filtered 分支；`tab` 类型收窄。 |
| `src/pages/trade-rules/index.tsx` / `user-agreement/index.tsx` | 同步把"凭核销码到店核销"文案改为"支付成功即视为已使用/到店消费即视为完成"。 |

## 保留项（无害，未删）
- `types.ts` 的 `OrderStatus` 仍含 `pending_pickup`（PG 枚举也还在）。
- `api.ts` 的 `merchantVerifyPickup()` 函数成为死代码（无调用方），留着不报错。

## 验证（dist 产物 grep）
- payment: `pending_pickup`=0，`is_used`=1，`pending_review`=1 ✓
- order-center: `verifyModal`=0，`核销`=0 ✓
- merchant-orders: `核销`=0，`merchantVerifyPickup`=0 ✓
- common.js(createOrderV2): `is_used`=1，`pending_pickup`=0 ✓

## 复测建议
微信开发者工具热重载后，用 `18701410500 / 123456` 登录，到店金豆/微信下单：
预期订单直接落到 `pending_review` 且 `is_used=true`；订单中心无"待核销"tab 与核销码弹窗；
商家端无"核销"按钮。佣金/确权仍按 `is_used` 正常触发。
