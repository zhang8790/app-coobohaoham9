export type UserRole = 'user' | 'admin'
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
  name: string
  description: string | null
  price: number
  image_url: string | null
  stock: number
  is_active: boolean
  review_status: ReviewStatus
  created_at: string
  stores?: { name: string } | null
}

export interface Withdrawal {
  id: string
  user_id: string
  amount: number
  status: WithdrawStatus
  withdraw_method: WithdrawMethod
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  alipay_account: string | null
  reject_reason: string | null
  created_at: string
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
