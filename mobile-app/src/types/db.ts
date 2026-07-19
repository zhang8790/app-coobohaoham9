// 移动端用到的数据库类型子集（字段语义与小程序 src/db/types 保持一致）
export type UserRole = 'user' | 'admin'
export type MemberRank = '凡心' | '初心' | '明心' | '静心' | '悟心' | '无心境'
export type OrderStatus =
  | 'pending_pay'
  | 'pending_ship'
  | 'pending_receive'
  | 'pending_pickup'
  | 'pending_review'
  | 'completed'
  | 'after_sale'
  | 'cancelled'
export type PaymentMethod = 'wxpay' | 'emotion_beans'

export interface Profile {
  id: string
  username: string | null
  phone: string | null
  nickname: string
  avatar_url: string | null
  role: UserRole
  member_rank: MemberRank
  tb_balance: number
  commission_balance: number
  referrer_id: string | null
  total_consumption: number | null
  constitution_tags: string[] | null
  created_at: string
}

export interface Product {
  id: string
  store_id: string
  name: string
  description: string | null
  price: number
  original_price: number | null
  image_url: string | null
  stock: number
  is_active: boolean
  // 食疗导购字段（迁移 00100）
  ingredients?: string[] | null
  overall_nature?: string | null
  health_tag?: string[] | null
  emotion_tag?: string[] | null
  match_goods?: string[] | null
  conflict_goods?: string[] | null
  aux_remind?: string | null
  // 00104 扩展字段
  food_category?: string | null
  positive_effect?: string | null
  risk_warning?: string | null
  scenes?: string[] | null
  rec_crowds?: string[] | null
  cautious_crowds?: string[] | null
  forbidden_crowds?: string[] | null
  combo_product_ids?: string[] | null
  guide_sentence?: string | null
  // joined
  stores?: { id: string; name: string; is_platform: boolean } | null
}

export interface OrderItem {
  id: string
  product_name: string
  product_image: string | null
  price: number
  quantity: number
}

export interface Order {
  id: string
  order_no: string
  total_amount: number
  status: OrderStatus
  payment_method: PaymentMethod | null
  tb_used: number
  created_at: string
  order_items?: OrderItem[]
}
