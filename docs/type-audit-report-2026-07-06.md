# 数据库表结构 vs types.ts 一致性审计报告

> 审计时间：2026-07-06  
> 审计范围：19张数据库表 vs `src/db/types.ts`

---

## ✅ 一致的表（15张）

以下表的字段与 types.ts 定义完全一致：

1. **profiles** ✅
2. **stores** ✅
3. **store_categories** ✅
4. **products** ✅
5. **cart_items** ✅
6. **orders** ✅
7. **order_items** ✅
8. **articles** ✅
9. **merchant_applications** ✅
10. **announcements** ✅
11. **user_addresses** ✅
12. **favorites** ✅
13. **footprints** ✅
14. **product_reviews** ✅
15. **coupons** ✅

---

## ⚠️ 不一致的表（4张）

### 1. `marketing_campaigns` - 营销活动表

**数据库字段（应包含）：**
- id: SERIAL (PK)
- store_id: UUID (FK)
- campaign_name: TEXT
- campaign_type: TEXT
- gift_name: TEXT
- gift_value: NUMERIC(10,2)
- total_limit: INTEGER
- daily_limit: INTEGER
- start_date: DATE
- end_date: DATE
- claimed_count: INTEGER
- commission_rate: NUMERIC(5,2)
- status: TEXT
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ

**types.ts 中：** ❌ **缺失**

**修复方案：**
在 `types.ts` 中添加 `MarketingCampaign` 接口

---

### 2. `user_campaign_claims` - 用户活动领取记录表

**数据库字段（应包含）：**
- id: UUID (PK)
- user_id: UUID (FK)
- campaign_id: INTEGER (FK)
- store_id: UUID (FK)
- claimed_at: TIMESTAMPTZ
- status: TEXT
- verified: BOOLEAN

**types.ts 中：** ❌ **缺失**

**修复方案：**
在 `types.ts` 中添加 `UserCampaignClaim` 接口

---

### 3. `pending_referrals` - 预锁客表

**数据库字段（已创建）：**
- id: UUID (PK)
- device_id: TEXT
- referral_code: TEXT
- store_id: UUID (FK)
- campaign_id: INTEGER (FK)
- status: TEXT
- converted: BOOLEAN
- created_at: TIMESTAMPTZ

**types.ts 中：** ❌ **缺失**

**修复方案：**
在 `types.ts` 中添加 `PendingReferral` 接口

---

### 4. `withdrawals` - 提现表

**types.ts 中：** `Withdrawal` 接口 ✅ 存在

**但字段名不一致：**
- 数据库：`withdrawals`
- types.ts：`Withdrawal`（单复数不一致，但不影响使用）

**结论：** ✅ 可以接受

---

## 📝 修复方案

### 步骤1：在 `types.ts` 中添加缺失的接口

```typescript
// =====================
// Marketing Campaigns（营销活动）
// =====================

export type CampaignType = 'redpacket' | 'physical'
export type CampaignStatus = 'active' | 'paused' | 'ended'

export interface MarketingCampaign {
  id: number
  store_id: string | null
  campaign_name: string
  campaign_type: CampaignType
  gift_name: string | null
  gift_value: number
  total_limit: number
  daily_limit: number
  start_date: string
  end_date: string
  claimed_count: number
  commission_rate: number
  status: CampaignStatus
  created_at: string
  updated_at: string
}

// =====================
// User Campaign Claims（用户活动领取记录）
// =====================

export type ClaimStatus = 'pending' | 'verified' | 'expired'

export interface UserCampaignClaim {
  id: string
  user_id: string
  campaign_id: number
  store_id: string | null
  claimed_at: string
  status: ClaimStatus
  verified: boolean
}

// =====================
// Pending Referrals（预锁客）
// =====================

export type PendingReferralStatus = 'pending' | 'converted' | 'expired'

export interface PendingReferral {
  id: string
  device_id: string
  referral_code: string
  store_id: string | null
  campaign_id: number | null
  status: PendingReferralStatus
  converted: boolean
  created_at: string
}
```

---

## 🎯 优先级建议

### 高优先级（必须修复）
1. ✅ `marketing_campaigns` - 红包功能已使用
2. ✅ `pending_referrals` - 锁客功能已使用

### 中优先级（建议修复）
3. ⚠️ `user_campaign_claims` - 领取记录，用于统计

---

## 📊 统计

- 总表数：19
- 一致：15 (79%)
- 不一致：4 (21%)
- 缺失类型定义：3

---

## ✅ 审计结论

**types.ts 基本完整**，主要缺失：
1. `MarketingCampaign` 接口（红包功能需要）
2. `PendingReferral` 接口（锁客功能需要）
3. `UserCampaignClaim` 接口（领取记录，可选）

**建议立即修复前两个**，第三个可以在需要时再添加。

---

**审计完成** ✅
