export type UserRole = 'user' | 'admin' | 'merchant'
export type MerchantStatus = 'none' | 'pending' | 'approved' | 'rejected'
export type WithdrawStatus = 'pending' | 'approved' | 'rejected' | 'paid'
export type WithdrawMethod = 'bank' | 'alipay' | 'wechat'
export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  username: string | null
  phone: string | null
  nickname: string
  avatar_url: string | null
  role: UserRole
  member_rank: string
  points: number
  balance: number
  merchant_status: MerchantStatus
  created_at: string
}

export interface MerchantApplication {
  id: string
  user_id: string
  store_name: string
  contact_name: string
  contact_phone: string
  business_type: string
  description: string | null
  status: MerchantStatus
  reject_reason: string | null
  created_at: string
}

export interface Product {
  id: string
  store_id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  original_price: number | null
  image_url: string | null
  main_image: string | null
  sub_images: string[] | null
  detail_images: string[] | null
  video_url: string | null
  stock: number
  cost_price: number | null
  discount_rate: number | null   // 商品让利% (0~100)
  is_active: boolean
  review_status: ReviewStatus
  created_at: string
  stores?: { name: string } | null
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  store_id: string | null
  store_name: string | null
  product_name: string
  product_image: string | null
  price: number
  quantity: number
  created_at: string
}

export interface Withdrawal {
  id: string
  user_id: string
  store_id: string | null
  amount: number
  status: WithdrawStatus
  withdraw_method: WithdrawMethod
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  alipay_account: string | null
  reject_reason: string | null
  remark: string | null
  created_at: string
  updated_at: string
  profiles?: { nickname: string | null; phone: string | null } | null
}

export interface Article {
  id: string
  user_id: string
  title: string
  content: string | null
  images: string[]
  is_published: boolean
  created_at: string
  profiles?: { nickname: string | null } | null
}

export interface AdminStats {
  merchants: number
  products: number
  withdrawals: number
  articles: number
  users: number
  orders: number
}

export interface Announcement {
  id: string
  content: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export type RefundStatus = 'pending_review' | 'processing' | 'completed' | 'closed' | 'abnormal'

export interface Refund {
  id: string
  refund_no: string | null
  order_id: string
  order_no: string
  item_index: number
  user_id: string
  initiated_by: 'user' | 'admin'
  status: RefundStatus
  refund_quantity: number
  refund_amount: number
  reason: string | null
  description: string | null
  wechat_refund_id: string | null
  version: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ================= 商家后台领域模型 =================
export type CouponStatus = 'active' | 'draft' | 'paused' | 'expired'

export interface MerchantCoupon {
  id: string
  user_id: string | null
  store_id: string | null
  code: string
  title: string
  discount_type: 'amount' | 'percent'
  discount_value: number
  min_amount: number
  total: number
  claimed_count: number
  status: CouponStatus
  start_date: string | null
  end_date: string | null
  is_used: boolean
  expired_at: string | null
  created_at: string
}

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

export interface MerchantMessage {
  id: string
  type: 'order' | 'system' | 'commission'
  title: string
  content: string
  time: string
  read: boolean
  rawTime: string
}

export interface MerchantAnalytics {
  revenueToday: number
  revenueMonth: number
  ordersToday: number
  totalCustomers: number
  salesTrend: { date: string; amount: number }[]
  topProducts: { name: string; sales: number; trend: 'up' | 'down' }[]
  trafficToday: number
  trafficYesterday: number
  weekRatio: number
  peakHour: string
  sources: { name: string; value: number }[]
}

export interface WithdrawalRecord {
  id: string
  amount: number
  method: string
  account: string
  status: string
  created_at: string
  transferred_at: string | null
}
