// 数据库类型定义

export type UserRole = 'user' | 'admin'
export type MemberRank = '江湖散修' | '外门弟子' | '内门弟子' | '核心弟子' | '长老' | '掌门'
export type MerchantStatus = 'none' | 'pending' | 'approved' | 'rejected'
export type OrderStatus = 'pending_pay' | 'pending_ship' | 'pending_receive' | 'pending_review' | 'completed' | 'after_sale' | 'cancelled'
export type PaymentMethod = 'wxpay' | 'gold_beans'

export interface Profile {
  id: string
  username: string | null
  phone: string | null
  nickname: string
  avatar_url: string | null
  role: UserRole
  openid: string | null
  member_rank: MemberRank
  points: number
  balance: number
  coupons_count: number
  merchant_status: MerchantStatus
  referral_code: string | null
  referrer_id: string | null
  total_consumption: number | null  // 个人累计消费金额（用于计算段位）
  team_performance: number | null   // 团队业绩（直接下线消费 + 间接下线消费×0.5）
  // V4分佣算法字段
  monthly_consumption: number | null      // 当月个人消费金额
  consecutive_zero_months: number | null  // 连续零消费月数
  team_monthly_gmv: number | null         // 团队月度GMV
  has_new_recruit: boolean | null         // 当月是否有新增下线
  months_since_last_recruit: number | null // 距离上次拓新月数
  created_at: string
}

export interface Store {
  id: string
  owner_id: string | null
  name: string
  description: string | null
  address: string | null
  phone: string | null
  category: string
  image_url: string | null
  banner_url: string | null
  rating: number
  is_active: boolean
  short_code: string | null
  created_at: string
}

export interface StoreCategory {
  id: string
  store_id: string
  name: string
  sort_order: number
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
  // 新增：主图/副图/详情图/视频
  main_image: string | null
  sub_images: string[] | null
  detail_images: string[] | null
  video_url: string | null
  // 新增：成本价（用于计算毛利和让利）
  cost_price: number | null
  // 新增：商品让利% (0~100)
  discount_rate: number | null
  stock: number
  barcode: string | null
  mood_tags: string[]
  scene_tags: string[]
  is_active: boolean
  review_status: 'pending' | 'approved' | 'rejected'
  created_at: string
  // joined
  stores?: Store
}

export interface CartItem {
  id: string
  user_id: string
  product_id: string
  store_id: string
  quantity: number
  selected: boolean
  created_at: string
  // joined
  products?: Product
  stores?: Store
}

export interface Order {
  id: string
  order_no: string
  user_id: string
  total_amount: number
  status: OrderStatus
  payment_method: PaymentMethod | null
  pay_expired_at: string | null
  paid_at: string | null
  gold_beans_used: number
  referrer_id: string | null
  commission_distributed: boolean
  service_type: 'dine_in' | 'self_pickup' | 'delivery'
  refunded_amount: number
  created_at: string
  // joined
  order_items?: OrderItem[]
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
}

export type ArticleStatus = 'draft' | 'published'

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
export type PointsLogType = 'purchase_earn' | 'invite_earn' | 'checkin_earn' | 'ugc_earn' | 'redeem_spend' | 'pay_spend' | 'refund_deduct'
export type PayMode = 'pure_gold' | 'hybrid' | 'wxpay'
export type CommissionStatus = 'pending' | 'settled' | 'refunded'

export interface Commission {
  id: string
  order_id: string
  order_no: string
  beneficiary_id: string
  payer_id: string
  level: 1 | 2
  rank_at_time: string
  ratio: number
  pool_amount: number
  commission_amount: number
  b_coef: number
  status: CommissionStatus
  settle_at: string | null
  created_at: string
}

export interface PointsLog {
  id: string
  user_id: string
  order_id: string | null
  type: PointsLogType
  delta: number
  balance_after: number
  remark: string | null
  created_at: string
}

export interface Article {
  id: string
  user_id: string
  title: string
  content: string | null
  images: string[]
  tags: string[]
  is_published: boolean
  status: ArticleStatus
  cover_image: string | null
  created_at: string
  // joined
  profiles?: Pick<Profile, 'id' | 'nickname' | 'avatar_url'>
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

export interface Announcement {
  id: string
  content: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export type WithdrawStatus = 'pending' | 'approved' | 'rejected' | 'paid'
export type WithdrawMethod = 'bank' | 'alipay' | 'wechat'

export interface UserAddress {
  id: string
  user_id: string
  name: string
  phone: string
  province: string | null
  city: string | null
  district: string | null
  detail: string
  is_default: boolean
  created_at: string
}

export interface Favorite {
  id: string
  user_id: string
  product_id: string
  created_at: string
  products?: Product
}

export interface Footprint {
  id: string
  user_id: string
  product_id: string
  viewed_at: string
  products?: Product
}

export interface ProductReview {
  id: string
  user_id: string
  product_id: string | null
  order_id: string | null
  order_item_id: string | null
  rating: number
  content: string | null
  images: string[]
  created_at: string
  profiles?: Pick<Profile, 'id' | 'nickname' | 'avatar_url'>
}

export interface Coupon {
  id: string
  user_id: string
  code: string
  title: string
  discount_type: 'amount' | 'percent'
  discount_value: number
  min_amount: number
  is_used: boolean
  expired_at: string | null
  used_at: string | null
  created_at: string
}

export interface Withdrawal {
  id: string
  user_id: string
  store_id: string | null
  amount: number
  status: WithdrawStatus
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  alipay_account: string | null
  withdraw_method: WithdrawMethod
  reject_reason: string | null
  remark: string | null
  created_at: string
  updated_at: string
}
