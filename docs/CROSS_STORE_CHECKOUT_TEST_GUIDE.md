# 跨门店合并结算功能 - 测试指南

## 📋 功能概述

实现跨门店合并结算，用户只需**1次支付**，后台自动按门店拆分成多个子订单。

## ✅ 已完成的修改

### 1. 购物车页面 (`src/pages/cart/index.tsx`)
- ✅ 添加底部统一结算栏（显示已选商品总数和总金额）
- ✅ 去掉每个门店的单独"结算"按钮
- ✅ 点击"去结算"按钮，传递所有已选商品到支付页面

### 2. 支付页面 (`src/pages/payment/index.tsx`)
- ✅ 支持接收多门店商品数据
- ✅ 创建订单时支持跨门店拆单
- ✅ 支付成功后自动确认所有子订单
- ✅ 添加 `confirmMultiStoreOrders` 函数（确认跨门店订单）

### 3. 后端 Edge Function (`supabase/functions/create-order/index.ts`)
- ✅ 自动按 `store_id` 分组商品
- ✅ 为每个门店创建独立的子订单
- ✅ 所有子订单共享同一个 `parent_order_no`
- ✅ 返回所有子订单信息给前端

### 4. 数据库迁移 (`supabase/migrations/00014_add_parent_order_no.sql`)
- ✅ 添加 `parent_order_no` 字段（关联同一笔结算的子订单）
- ✅ 添加索引 `idx_orders_parent_order_no`

## 🧪 测试步骤

### 前置准备
1. **执行数据库迁移**：
   ```sql
   -- 在 Supabase SQL 编辑器中执行
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_no TEXT;
   CREATE INDEX IF NOT EXISTS idx_orders_parent_order_no ON orders(parent_order_no);
   ```

2. **部署 Edge Function**：
   ```bash
   supabase functions deploy create-order
   ```

### 测试流程

#### 1. 添加商品到购物车
- 登录账号（测试账号：`18701410500` / `123456`）
- 浏览商品，添加**不同门店**的商品到购物车
- 例如：
  - 测试江湖客栈：烤鱼 × 2（¥136）
  - 书香阁：内功篇 × 1（¥45）

#### 2. 购物车页面检查
- 进入"行囊"页面
- 确认底部结算栏显示：
  - 已选 3 件
  - 合计 ¥181.00
  - "去结算"按钮
- 确认每个门店区域**没有**单独的"结算"按钮

#### 3. 支付页面检查
- 点击"去结算"
- 确认进入支付页面
- 确认订单金额显示正确（¥181.00）
- 选择支付方式（微信支付 / 金豆支付 / 混合支付）

#### 4. 支付成功检查
- 完成支付（本地开发模式会自动成功）
- 确认跳转到"待收货"页面
- 在"我的订单"中确认：
  - 应该看到 **2个订单**（每个门店一个）
  - 订单号类似：`PARENT-xxx-1` 和 `PARENT-xxx-2`
  - 两个订单的 `parent_order_no` 相同

#### 5. 后端数据检查
在 Supabase 中查询：
```sql
-- 查看刚创建的订单
SELECT order_no, parent_order_no, store_id, total_amount, status
FROM orders
WHERE parent_order_no IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

应该看到类似：
```
order_no          | parent_order_no | store_id | total_amount | status
------------------|-----------------|----------|--------------|----------
PARENT-xxx-1      | PARENT-xxx      | store-001| 136.00       | pending_ship
PARENT-xxx-2      | PARENT-xxx      | store-002| 45.00        | pending_ship
```

## 🐛 预期问题 & 解决方案

### 问题1：支付页面报错
**原因**：后端 Edge Function 未部署
**解决**：运行 `supabase functions deploy create-order`

### 问题2：订单未拆分成多个
**原因**：数据库迁移未执行
**解决**：在 Supabase SQL 编辑器中执行迁移 SQL

### 问题3：支付成功后只显示一个订单
**原因**：订单中心页面未按 `parent_order_no` 分组显示
**解决**：需要修改订单中心页面，按 `parent_order_no` 分组显示（可选优化）

## 📝 后续优化建议

1. **订单中心页面**：按 `parent_order_no` 分组显示跨门店订单
2. **订单详情页面**：显示"来自同一笔结算"的提示
3. **退款功能**：支持按子订单单独退款
4. **物流跟踪**：每个子订单独立的物流信息

## ✅ 编译检查
- 编译时间：14.41秒
- 错误数：0
- 状态：✅ 成功

## 📦 Git 提交
- Commit: `3e579e1`
- 分支: `main`
- 状态: ✅ 已推送到远程
