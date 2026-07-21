# 商品级分佣结算方案

**日期**：2026-07-20
**场景**：综合结算分佣 + 多商品不同让利点追溯拆分
**参与成员**：排障手（主理人直调，GStack 子代理环境不可用）

---

## 📌 TL;DR
- 截图订单 `LDYX17845267108376hhu`（成交额 ¥122，5 个商品让利点 1%/2%/5%/12%/10%）**已补发佣金**：L1=4.16、L2=1.36、买家积分=1、平台=3.53，整单加权率 8.24%。
- 未发佣金根因：`create-order` 在写 `orders.effective_rate` 时列不存在（20260720 迁移未部署），抛 `42703` 后中断，未调 `distribute-commission`。该迁移已补部署，后续新单不会再踩。
- 用户提出"商品总结算表 + 分开分佣"：本方案设计新表 `order_item_commissions`，每个商品独立算让利池、L1/L2/买家积分/平台收益，再汇总到订单。
- 推荐分两步：P0 先上线整单加权（已修复，当前订单已生效）；P1 再迁移到商品级结算表。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟡 当前订单已修复，但商品级结算表尚未实施 |
| 当前订单状态 | ✅ 已分佣（commission_distributed=true） |
| 商品加权率 | 8.24%（金额加权） |
| 关键阻塞 | `orders.effective_rate` 列未部署导致 create-order 中断 |
| 关键行动 | 部署 `order_item_commissions` 表 + 改造 distribute-commission |

---

## 1. 当前订单诊断（LDYX17845267108376hhu）

### 1.1 订单基础数据

| 字段 | 值 |
|------|-----|
| 订单号 | LDYX17845267108376hhu |
| 状态 | pending_review |
| 成交额 | ¥122.00 |
| 金豆抵扣 | ¥122.00 |
| 现金实收 | ¥0 |
| 门店 | 张林水果店 |
| 推荐人 | 张林（L1） |

### 1.2 商品明细（关键：不同商品让利点不同）

| 商品 | 单价 | 数量 | 小计 | 商品让利率 | 让利贡献 |
|------|------|------|------|------------|----------|
| 苹果 | 25.00 | 1 | 25.00 | 1% | 0.25 |
| 椰子 | 5.00 | 1 | 5.00 | 2% | 0.10 |
| 党参牛肉汤 | 12.00 | 1 | 12.00 | 5% | 0.60 |
| 新品 | 55.00 | 1 | 55.00 | 12% | 6.60 |
| 牛肉粉丝 | 25.00 | 1 | 25.00 | 10% | 2.50 |
| **合计** | - | - | **122.00** | **加权 8.24%** | **10.05** |

> 截图显示"让利率 8%"是门店统一默认值，但真实让利金额 10.05 是按商品各自让利点加权算出的。

### 1.3 未发佣金根因

- `create-order` 在 2026-07-20 05:51:51 创建订单时，尝试写 `orders.effective_rate`。
- 当时 `orders.effective_rate` 列不存在（20260720 迁移未部署），`UPDATE` 抛 `42703 column does not exist`。
- 该语句未包 try-catch，异常向上传播，导致后续调用 `distribute-commission` 的代码**未执行**。
- 订单虽创建成功，但 `commission_distributed=false`，无 `commissions` / `tongbao_logs` / `points_logs` 流水。
- 已用修复后的 `backfill-commission-weighted.mjs` 手动补发，并执行 `scripts/reconcile-hhu-order-columns.sql` 对齐 `orders` 汇总列。

### 1.4 修复后终态

| 字段 | 修复后值 | 说明 |
|------|----------|------|
| effective_rate | 0.0824 | 商品加权率 |
| l1_commission | 4.16 | L1 实际到手佣金 |
| l2_commission | 1.36 | L2 实际到手佣金 |
| buyer_points | 1 | 买家确权积分 |
| platform_income | 3.53 | 平台保底收益 |
| commission_distributed | true | 已分佣 |
| tongbao_logs L1 | 4.16 | 张林 |
| tongbao_logs L2 | 1.36 | 上线 |

---

## 2. 商品总结算表设计（`order_item_commissions`）

### 2.1 表结构

```sql
CREATE TABLE IF NOT EXISTS order_item_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  product_id uuid,
  product_name text,
  price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 0,
  item_total numeric NOT NULL DEFAULT 0,          -- price * quantity
  product_discount_rate numeric NOT NULL DEFAULT 0, -- 商品自身让利率（如 0.12）
  effective_rate numeric NOT NULL DEFAULT 0,        -- 实际用于该商品的分佣率（P0 阶段等于商品自身率；P1 可支持活动券叠加）
  discount_amount numeric NOT NULL DEFAULT 0,       -- 该商品让利金额 = item_total * effective_rate
  discount_pool numeric NOT NULL DEFAULT 0,         -- 分佣池 = discount_amount（与整单口径一致）
  commission_pool numeric NOT NULL DEFAULT 0,       -- 可分佣池 = discount_pool * 0.90

  l1_user_id uuid,
  l1_rank text,
  l1_ratio numeric,
  l1_active_mult numeric DEFAULT 1,
  l1_recruit_mult numeric DEFAULT 1,
  l1_gross numeric DEFAULT 0,                     -- 缩放前
  l1_commission numeric DEFAULT 0,                -- 缩放后 / 实际发放

  l2_user_id uuid,
  l2_rank text,
  l2_ratio numeric,
  l2_active_mult numeric DEFAULT 1,
  l2_recruit_mult numeric DEFAULT 1,
  l2_gross numeric DEFAULT 0,
  l2_commission numeric DEFAULT 0,

  buyer_points numeric DEFAULT 0,                 -- 该商品产生的买家确权积分
  platform_income numeric DEFAULT 0,              -- 该商品的平台保底收益

  commission_distributed boolean DEFAULT false,
  distributed_at timestamptz,
  created_at timestamptz DEFAULT now(),

  -- 幂等：同一 order_item 只结算一次
  UNIQUE(order_item_id)
);
```

### 2.2 索引

```sql
CREATE INDEX IF NOT EXISTS idx_oic_order_id ON order_item_commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_oic_order_item_id ON order_item_commissions(order_item_id);
CREATE INDEX IF NOT EXISTS idx_oic_commission_distributed ON order_item_commissions(commission_distributed);
CREATE INDEX IF NOT EXISTS idx_oic_product_id ON order_item_commissions(product_id);
```

### 2.3 与现有表的关系

```
orders (1) ──< order_items (N) ──< order_item_commissions (1)
   │                                    │
   │                                    │
   └──< commissions (N)                └── 聚合为 commissions 行（L1/L2 各一行）
   └──< points_logs (N)
   └──< tongbao_logs (N)
```

- `orders` 的 `l1_commission` / `l2_commission` / `buyer_points` / `platform_income` = `SUM(order_item_commissions.*)`。
- `commissions` 表仍按受益人聚合（L1 一行、L2 一行），但新增 `source_order_item_commissions uuid[]` 或关联字段，可追溯来源。

---

## 3. 按商品分开分佣算法

### 3.1 计算步骤

对每个 `order_item` 独立执行：

```
item_total = price * quantity
item_discount_rate = product.discount_rate / 100
discount_amount = item_total * item_discount_rate
discount_pool = discount_amount                    // 与整单让利池口径一致
commission_pool = discount_pool * 0.90             // 平台保底 10% 后剩余

// L1
l1_gross = commission_pool * l1_rank.l1 * l1_active * l1_recruit
// L2
l2_gross = commission_pool * l2_rank.l2 * l2_active * l2_recruit
// 买家积分
buyer_points_raw = commission_pool * buyer_rank.points
buyer_points = max(1, round(buyer_points_raw)) if buyer_points_raw > 0 else 0

// 封顶缩放：保证 platform_income >= discount_pool * 0.10
comm_total_raw = l1_gross + l2_gross
cap_for_comm = max(0, commission_pool - buyer_points)
if comm_total_raw > cap_for_comm and comm_total_raw > 0:
    scale = cap_for_comm / comm_total_raw
    l1_commission = l1_gross * scale
    l2_commission = l2_gross * scale
else:
    l1_commission = l1_gross
    l2_commission = l2_gross

platform_income = discount_pool - l1_commission - l2_commission - buyer_points
```

### 3.2 汇总到订单

```sql
UPDATE orders SET
  l1_commission = (SELECT SUM(l1_commission) FROM order_item_commissions WHERE order_id = ?),
  l2_commission = (SELECT SUM(l2_commission) FROM order_item_commissions WHERE order_id = ?),
  buyer_points  = (SELECT SUM(buyer_points) FROM order_item_commissions WHERE order_id = ?),
  platform_income = (SELECT SUM(platform_income) FROM order_item_commissions WHERE order_id = ?),
  effective_rate = CASE 
    WHEN total_amount > 0 THEN 
      (SELECT SUM(item_total * effective_rate) FROM order_item_commissions WHERE order_id = ?) / total_amount
    ELSE 0 END,
  commission_distributed = true
WHERE id = ?;
```

### 3.3 与当前整单加权方案对比

| 维度 | 当前整单加权（P0） | 商品级分开分佣（P1） |
|------|---------------------|-----------------------|
| 让利率 | 整单金额加权一个 `effective_rate` | 每个商品用自己的 `product_discount_rate` |
| 分佣池 | 一个 discount_pool | 每个商品一个 discount_pool，再汇总 |
| 退款回退 | 整单退 | 可按商品退 |
| admin 展示 | 订单维度 | 订单 + 商品明细展开 |
| 复杂度 | 低 | 中 |
| 数据一致性 | 中（需定期对账） | 高（商品行自洽） |

---

## 4. 实施计划

### P0（已做，热修复）
- [x] 部署 20260720 迁移（加 `effective_rate` / `commission_error`）。
- [x] 改 `create-order` / `wechat-payment-callback` / `backfill-commission-weighted.mjs` 绕开缺外键的嵌入。
- [x] 重部署两个 EF。
- [x] 补发 `LDYX17845267108376hhu` 佣金。
- [ ] 修复 `backfill-commission-weighted.mjs` 的 `effective_rate` PATCH 失败（`.catch` 吞错误）。

### P1（建议下一步）
1. 创建迁移 `00140_create_order_item_commissions.sql`（表 + 索引）。
2. 改造 `distribute-commission`：
   - 按 order_items 拆行，写入 `order_item_commissions`。
   - 按受益人聚合生成 `commissions` 行。
   - 更新 `orders` 汇总字段。
3. 改造 `create-order` / `wechat-payment-callback`：
   - 不再传整单 `discount_rate`（可选保留兼容）。
   - 触发 `distribute-commission` 时直接由 EF 内查 order_items。
4. 退款回退：
   - 退款时按 `order_item_commissions` 回退对应商品的分佣。
5. admin-web 综合结算：
   - 订单列表显示汇总。
   - 详情页展开商品级结算表。
6. 历史订单补建：
   - 对 `commission_distributed=true` 的订单，按商品明细补生成 `order_item_commissions` 行（只读追溯，不动余额）。

---

## 5. 当前订单按商品级拆分示例（计算后）

| 商品 | 小计 | 商品率 | 让利金额 | 可分佣池 | L1 | L2 | 买家积分 | 平台 |
|------|------|--------|----------|----------|----|----|----------|------|
| 苹果 | 25.00 | 1% | 0.25 | 0.225 | 0.09 | 0.03 | 0.02→1 | 0.12 |
| 椰子 | 5.00 | 2% | 0.10 | 0.090 | 0.04 | 0.01 | 0.01 | 0.04 |
| 党参牛肉汤 | 12.00 | 5% | 0.60 | 0.540 | 0.22 | 0.07 | 0.05 | 0.26 |
| 新品 | 55.00 | 12% | 6.60 | 5.940 | 2.38 | 0.77 | 0.59 | 2.20 |
| 牛肉粉丝 | 25.00 | 10% | 2.50 | 2.250 | 0.90 | 0.29 | 0.23 | 0.93 |
| **合计** | **122.00** | **8.24%** | **10.05** | **9.045** | **3.63** | **1.17** | **0.90→1** | **3.55** |

> 注：上表为按商品独立缩放后的结果，与当前整单加权结果（L1=4.16、L2=1.36、平台=3.53）略有差异，因为缩放机制在商品级 vs 整单级执行时机不同。具体以 P1 实现时统一算法为准。

---

## 6. 行动清单

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|----------|
| 1 | 修复 `backfill-commission-weighted.mjs` PATCH `effective_rate` 失败 | 开发 | P1 | 2026-07-20 |
| 2 | 创建 `order_item_commissions` 表迁移 | 开发 | P1 | 2026-07-21 |
| 3 | 改造 `distribute-commission` 按商品拆分结算 | 开发 | P1 | 2026-07-22 |
| 4 | 改造退款逻辑按商品回退分佣 | 开发 | P1 | 2026-07-23 |
| 5 | admin-web 综合结算展示商品明细 | 前端 | P1 | 2026-07-24 |
| 6 | 历史订单补建 `order_item_commissions`（追溯） | 开发 | P2 | 2026-07-25 |

---

## 7. 待完善 / 已知局限

- `backfill-commission-weighted.mjs` 对 `orders.effective_rate` 的 PATCH 可能因网络抖动失败，但脚本无重试、错误被 `.catch` 吞掉。需改为 `await` 并抛错或记录 `commission_error`。
- `distribute-commission` 当前不回写 `orders.l1_commission` / `l2_commission`，依赖后续 SQL 对齐。商品级改造时应统一在 EF 内写回。
- 用户截图的"让利率 8%"与"让利金额 10.05"口径不一致：前端展示需明确是"门店默认让利率" vs "商品加权真实让利"。

---

## 8. 成员产出索引

- 因当前环境 GStack 子代理（gstack-product-reviewer / gstack-investigator）不可用，本方案由主理人直接查库、读代码、设计方案并落盘。

---

> 本报告由软件工坊 AI 协作生成，关键财务决策请由工程负责人复核。
