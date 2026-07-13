# 金豆支付报错 `INVALID_PRODUCT` 排查手册

## 根因

`createOrderV2` 在落单前会**强制回查 `products` 表**，用数据库里的真实价格覆盖前端传价（防压价资损）。

报错 `INVALID_PRODUCT` 表示：当前购物车/立即购买里的商品，在 `products` 表里**找不到、未上架、或价格 ≤ 0**。

## 为什么金豆/混合付会触发，微信支付可能不触发？

微信支付如果也走同一个 `createOrderV2`，同样会触发。只是日志里这次恰好是金豆路径。不是金豆通道本身的问题，是商品状态问题。

## 立即排查（Supabase Dashboard → SQL Editor 执行）

### 1. 查这个商品的状态

把下面 SQL 里的 `product_id 占位符` 换成支付页实际商品的 ID（可以从开发者工具 Network 或 `console.log` 里找到 `product_id`）。

```sql
-- 替换 '你的商品ID'
SELECT id, name, price, original_price, is_active, stock, store_id, review_status
FROM public.products
WHERE id = '你的商品ID';
```

### 2. 批量查所有购物车商品的状态

如果购物车是批量购买，跑一次这个看哪些商品有问题：

```sql
-- 查购物车表里有问题的商品
SELECT
  ci.id AS cart_item_id,
  ci.product_id,
  p.id AS product_exists,
  p.name,
  p.price,
  p.is_active,
  p.stock
FROM public.cart_items ci
LEFT JOIN public.products p ON p.id = ci.product_id
WHERE ci.user_id = 'd6b38349-dded-4879-9eac-3165a646436a';  -- 替换成实际用户ID
```

### 3. 常见原因与对应修复

| 现象 | 原因 | 修复 |
|---|---|---|
| `product_exists` 为 `null` | 商品已被删除，但购物车/缓存残留 | 清理该 cart_item：`DELETE FROM public.cart_items WHERE id = 'cart_item_id';` |
| `is_active = false` | 商品已下架 | 在商家后台重新上架，或前端移除该商品 |
| `price` 为 `null` 或 `0` | 商品价格未设置 | 在商家后台填写价格 |
| `stock <= 0` | 库存不足 | 补充库存，或前端做售罄态 |

### 4. 一键清理所有失效购物车（谨慎执行）

```sql
-- 删除购物车中关联已删除或已下架商品的记录
DELETE FROM public.cart_items
WHERE product_id NOT IN (SELECT id FROM public.products WHERE is_active = true AND price > 0);
```

## 代码侧已做的改进

本次提交已增强 `createOrderV2` 的日志：

```
[createOrderV2] 回查 products: [...]
[createOrderV2] 回查结果: [...]
[createOrderV2] INVALID_PRODUCT: 商品不存在或已下架, product_id=xxx, name=xxx, clientPrice=29.90
```

下次再遇到同样报错，看日志里的 `product_id` 和 `reason` 就能秒定位。

## 建议的后续动作

1. ~~前端支付页加一层「下单前校验」~~ ✅ **已完成（2026-07-11）**：`src/pages/payment/index.tsx` 新增 `verifyProducts()`，进入支付页即回查 `products` 真实状态（is_active/price），发现失效商品时：
   - 渲染红色警示卡（列出商品名 + 具体原因：已下架或不存在 / 价格未设置）
   - 灰掉「确认支付」按钮并改为文案「含失效商品，无法支付」
   - `handlePay` 开头加守卫，**预校验 `loading` 状态也禁止点击**，防止用户抢先点击导致 createOrderV2 报错
   - 查询列与 `createOrderV2` 完全一致（`id, price, is_active`），杜绝因列差异导致结果不一致

> 注意：若之前出现「按钮仍然能点、点完才报 INVALID_PRODUCT」的情况，就是预校验尚未完成时用户已点击。新版已修复：校验完成前按钮会显示「商品校验中...」并禁用点击。
2. 购物车列表长期展示时，对 `is_active=false` 或 `price <= 0` 的商品打「已失效」标签，避免用户勾选（待做）。

## 验证状态

- 代码层：`src/db/api.ts` 的 `createOrderV2` 增强日志 + `src/pages/payment/index.tsx` 的下单前预校验，均已编译验证通过（`BUILD_EXIT=0`）。
- 数据层：失效商品的**根因修复**（上架/补价/清购物车残留）仍需在 Supabase Dashboard 执行本手册 SQL。
