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
  tb_balance?: number
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
  ingredients?: string[] | null   // 原料成分分析：关联食材 key（与小程序端 products.ingredients 同列）
  // 食材食疗智能导购属性（与小程序端迁移 00100_food_therapy_fields.sql 一致）
  overall_nature?: string | null   // 商品整体性味 6 档：大寒/寒凉/平性/微温/温热/大热
  health_tag?: string[] | null     // 固定食疗标签库 9 项
  emotion_tag?: string[] | null    // 固定情绪标签库 8 项
  match_goods?: string[] | null    // 推荐搭配（商品名[]）
  conflict_goods?: string[] | null // 相克/慎搭提示（商品名[]）
  aux_remind?: string | null       // 辅料/加料建议（自由文本）
  stores?: { name: string } | null
}

// 商品情绪编译结果（与小程序端共用 product_emotion 同一张表）
export interface ProductEmotionData {
  emotion_title?: string | null
  emotion_detail?: string | null
  dimension_tags?: Record<string, string[]> | null
  quality_score?: number | null
  review_status?: string | null
  shiyang_tags?: Record<string, string[]> | null // { shiyang: 食材中文名[] }
  shiyang_copy?: string | null
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
  method?: string
  account_info?: any | null
  withdraw_method: WithdrawMethod
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  alipay_account: string | null
  real_name: string | null
  id_card: string | null
  reject_reason: string | null
  remark: string | null
  kind?: string                 // commission | settlement（迁移 00120）
  merchant_settlement_ids?: string[] | null
  created_at: string
  updated_at: string
  profiles?: { nickname: string | null; phone: string | null } | null
}

/** 已保存收款账户（迁移 00123）：绑定一次后持久化，提现可复用 */
export interface SavedWithdrawalAccount {
  id: string
  owner_id: string
  owner_type: 'user' | 'store'
  method: WithdrawMethod
  real_name: string | null
  id_card: string | null
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  alipay_account: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

/** 商家货款结算台账（迁移 00120） */
export interface MerchantSettlement {
  id: string
  store_id: string
  order_id: string
  order_no: string | null
  total_amount: number
  tb_portion: number        // 情绪豆抵扣部分（平台垫付）
  cash_portion: number      // 微信现金部分
  referral_rate: number     // 让利率快照（小数）
  discount_pool: number     // 让利池
  channel_fee: number       // 微信通道费
  settle_amount: number     // 商家应收货款
  status: string            // settled | reversed
  settled_at: string | null
  reversed_at: string | null
  withdrawal_id?: string | null  // 关联的货款提现单 ID（00121）
  created_at: string
  stores?: { name: string | null; wx_sub_mch_id: string | null } | null
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

// ================= 确权（共建股权）总后台治理 =================
export type EmotionClaimStatus = 'active' | 'voided'

export interface EmotionClaimRow {
  id: string
  user_id: string
  order_no: string | null
  product_id: string | null
  store_id: string | null
  selected_emotion: string | null
  badge_text: string | null
  badge_code: string | null
  tb_amount: number
  cv_amount: number
  upline_l1: string | null
  upline_l2: string | null
  upline_l1_cv: number
  upline_l2_cv: number
  status: EmotionClaimStatus
  rule_version: string | null
  voided_at: string | null
  voided_reason: string | null
  refund_ratio: number
  created_at: string
  nickname: string | null
  phone: string | null
  user_is_banned: boolean
}

export interface EmotionClaimStats {
  total: number
  active: number
  voided: number
  active_cv: number
  active_tb: number
  active_users: number
}

export interface EmotionRuleVersion {
  version: string
  announced_at: string
  effective_at: string
  const_json: Record<string, number>
  note: string | null
  is_active: boolean
  created_at: string
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
  real_name?: string | null
  id_card?: string | null
  bank_name?: string | null
  bank_account?: string | null
}
