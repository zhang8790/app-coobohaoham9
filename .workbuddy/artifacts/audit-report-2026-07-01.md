# 端到端业务流程审计报告
**日期**: 2026-07-01  
**审计范围**: 用户申请入驻 → 总后台审核 → 商家商品上架 → 用户下单 → 二级锁客 → 分润 → 积分

---

## 审计结论

| 环节 | 状态 | 说明 |
|------|------|------|
| 数据库表结构 | ✅ 完整 | 17张表全部定义，字段齐全 |
| 前端API层 | ✅ 完整 | api.ts 函数定义完整 |
| 商家申请入驻 | ✅ 完整 | merchant-apply 页面 + submitMerchantApplication API |
| 总后台审核 | ✅ 完整 | admin-web Merchants.tsx + adminApproveApplication |
| 商家商品上架 | ✅ 完整 | 商家管理中心 + admin-web 商品审核 |
| 用户下单支付 | ⚠️ **HTML标签问题** | payment/index.tsx 用了div/button/p/input |
| 锁客机制 | ⚠️ **Mock层未实现** | bind_referrer RPC Mock返回null，未实际绑定 |
| 二级锁客 | ⚠️ **Mock层未实现** | 佣金计算逻辑在Mock层缺失 |
| 分润 | ⚠️ **Mock层未实现** | create-order Mock只建订单，未建commissions |
| 积分 | ⚠️ **Mock层未实现** | points_logs Mock返回空数组 |

---

## 详细问题清单

### 🔴 严重问题（需立即修复）

#### 1. 支付页面HTML标签导致白屏
**文件**: `src/pages/payment/index.tsx`  
**问题**: 全部使用HTML标签（div, button, p, input, h1, h2, h3, span）  
**影响**: 微信小程序不识别HTML标签 → 支付页面白屏  
**修复**: 全部改为Taro组件（View, Text, Button, Input）

#### 2. Mock层锁客未实际绑定
**文件**: `src/client/supabase.mock.ts` 第290-293行  
**问题**: `rpc('bind_referrer')` Mock实现返回 `{ data: null, error: null }`  
**影响**: 本地开发时，用户通过分享链接注册后，推荐关系未绑定  
**修复**: Mock层需要实现 `profiles.update({ referrer_id: ... })`

#### 3. Mock层分润逻辑缺失
**文件**: `src/client/supabase.mock.ts` 第245-256行  
**问题**: `create-order` Edge Function Mock只创建orders记录，未：
- 创建 order_items 记录
- 计算并创建 commissions 记录
- 创建 points_logs 记录
- 更新 profiles.points 和 balance

**影响**: 本地开发时，支付成功后看不到佣金和积分变化  
**修复**: Mock层需要在 `create-order` 中模拟完整逻辑

---

### 🔶 中等问题（影响开发测试）

#### 4. Mock数据不完整
- `commissions` 表返回空数组 → 推广中心看不到佣金数据
- `points_logs` 表返回空数组 → 积分记录看不到
- `order_items` 表返回空数组 → 订单详情不完整

**修复**: 在 mockData.ts 中添加 mockCommissions, mockPointsLogs, mockOrderItems

#### 5. admin-web类型定义不完整
**文件**: `admin-web/src/types/index.ts`  
**问题**: 
- `Profile` 缺少 `referral_code`, `referrer_id`, `coupons_count`
- `Product` 缺少 `main_image`, `sub_images`, `detail_images`, `video_url`, `mood_tags`, `scene_tags`, `barcode`, `discount_rate`
- 缺少 `Commission`, `PointsLog`, `OrderItem` 等类型

**影响**: admin-web开发时类型检查不完整  
**修复**: 更新 admin-web/src/types/index.ts

---

### ✅ 已完成对接的部分

#### 数据库表 ↔ 类型定义
| 表名 | types.ts | admin-web/types | Mock数据 |
|------|----------|-------------------|----------|
| profiles | ✅ | ⚠️ 不完整 | ✅ |
| stores | ✅ | ❌ 未定义 | ✅ |
| store_categories | ✅ | ❌ 未定义 | ✅ |
| products | ✅ | ⚠️ 不完整 | ✅ |
| cart_items | ✅ | ❌ 未定义 | ✅ |
| orders | ✅ | ❌ 未定义 | ✅ |
| order_items | ✅ | ❌ 未定义 | ❌ 空数组 |
| articles | ✅ | ✅ | ✅ |
| merchant_applications | ✅ | ✅ | ✅ |
| announcements | ✅ | ✅ | ✅ |
| commissions | ✅ | ❌ 未定义 | ❌ 空数组 |
| withdrawals | ✅ | ✅ | ✅ |
| refunds | ✅ | ✅ | ✅ |
| points_logs | ✅ | ❌ 未定义 | ❌ 空数组 |
| user_addresses | ✅ | ❌ 未定义 | ✅ |
| favorites | ✅ | ❌ 未定义 | ✅ |
| footprints | ✅ | ❌ 未定义 | ✅ |
| product_reviews | ✅ | ❌ 未定义 | ❌ 空数组 |
| coupons | ✅ | ❌ 未定义 | ✅ |

#### 前端页面 ↔ API对接
| 页面 | API函数 | 状态 |
|------|---------|------|
| 商家申请入驻 | submitMerchantApplication | ✅ |
| 总后台审核 | adminApproveApplication | ✅ |
| 商家商品管理 | getMerchantProducts, createProduct, updateProduct | ✅ |
| 商品审核 | adminApproveProduct | ✅ |
| 支付下单 | createOrderV2 | ⚠️ HTML标签问题 |
| 锁客 | handleInviterFromQuery → bind_referrer RPC | ⚠️ Mock未实现 |
| 佣金查看 | getMyCommissions | ⚠️ Mock返回空 |
| 积分查看 | getMyPointsLogs | ⚠️ Mock返回空 |

---

## 修复优先级建议

### P0（立即修复）
1. **payment/index.tsx** - 改HTML标签为Taro组件
2. **supabase.mock.ts** - 实现 bind_referrer RPC Mock
3. **supabase.mock.ts** - 实现 create-order 完整逻辑（佣金+积分）

### P1（本周内修复）
4. **mockData.ts** - 添加 mockCommissions, mockPointsLogs, mockOrderItems
5. **admin-web/src/types/index.ts** - 补全类型定义

### P2（有时间就做）
6. 确认Supabase真实后端是否已部署对应Edge Functions
7. 添加端到端自动化测试

---

## 附：完整业务流程图

```
用户申请入驻
    ↓
总后台审核 (admin-web/Merchants.tsx)
    ↓ approve
创建stores记录 (adminApproveApplication)
    ↓
商家上架商品 (merchant-products/index.tsx)
    ↓
总后台审核商品 (admin-web/Products.tsx)
    ↓ approve
商品上线 (products.is_active = true)
    ↓
用户浏览商品 → 分享带ref参数 (useShareWithReferral)
    ↓
好友通过分享链接注册 → bind_referrer RPC绑定推荐关系
    ↓
好友下单支付 (payment/index.tsx → createOrderV2)
    ↓
Edge Function create-order:
  - 创建orders记录
  - 创建order_items记录
  - 计算佣金 → 创建commissions记录
  - 发放积分 → 创建points_logs记录
    ↓
商家查看订单 (merchant-orders/index.tsx)
    ↓
佣金结算 (withdraw/index.tsx)
```

---

**总结**: 前后端、商家管理中心、总后台、数据库表的**框架已对接好**，但**本地开发的Mock层未实现完整业务逻辑**（锁客、分润、积分）。支付页面有HTML标签问题需立即修复。
