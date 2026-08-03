// 数据库类型定义

export type UserRole = 'user' | 'admin'
export type MemberRank = '凡心' | '初心' | '明心' | '静心' | '悟心' | '无心境'
export type MerchantStatus = 'none' | 'pending' | 'approved' | 'rejected'
export type OrderStatus = 'pending_pay' | 'pending_ship' | 'pending_receive' | 'pending_pickup' | 'pending_review' | 'completed' | 'after_sale' | 'cancelled'
export type PaymentMethod = 'wxpay' | 'emotion_beans'

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
  balance: number          // 【已合并/废弃】原健康豆消费币，值已并入 tb_balance 且列已清零；严禁新业务读写，统一使用 tb_balance
  commission_balance: number // 推广佣金账户余额（推广佣金，由推广佣金流水驱动，可提现并代扣个税）
  tb_balance: number       // 健康豆余额（统一平台货币：消费抵扣 + 会员成长，人民币1:1锚定，仅平台内消费，不可提现/兑现金）
  cv_total: number         // 会员贡献值累计（会员权益计算依据，V2）
  privacy_consented_at: string | null // 隐私政策同意时间（PIPL 审计留痕；未同意为 null）
  allow_behavior_analysis: boolean // 个性化行为分析总闸（true=允许，false=已退出；分析引擎排除）
  coupons_count: number
  merchant_status: MerchantStatus
  invite_code: string | null
  referrer_id: string | null
  referral_code: string | null
  total_consumption: number | null  // 个人累计消费金额（用于计算段位）
  // V4佣金算法字段
  monthly_consumption: number | null      // 当月个人消费金额
  consecutive_zero_months: number | null  // 连续零消费月数
  team_monthly_gmv: number | null         // 团队月度累计消费额
  has_new_recruit: boolean | null         // 当月是否有新增推荐客户
  months_since_last_recruit: number | null // 距离上次邀请新用户月数
  constitution_tags: string[] | null // 用户自填体质/健康状况标签（宫寒量少/高血压…），食疗匹配用；仅食养参考不替代医嘱
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
  is_platform: boolean  // ⭐ 自营门店标识（true=平台自营，false=商家门店）
  short_code: string | null
  referral_rate: number | null   // 让利率（%），商家设置
  // 店铺设置页字段（00018 迁移补全）
  contact: string | null
  is_open: boolean
  open_time: string | null
  close_time: string | null
  delivery_enabled: boolean
  pickup_enabled: boolean
  delivery_radius: number | null
  delivery_fee: number | null
  free_delivery_threshold: number | null
  min_order_amount: number | null
  announcement: string | null
  scene_tags: string[] | null
  // 合作品牌标识（历史兼容字段：现已统一归并为自营门店，恒为 NULL，见迁移 00201）
  partner_brand: string | null
  partner_tier: string | null
  // 商家货款结算（迁移 00120）
  merchant_balance: number          // 可结算货款余额（人民币元，可提现）
  settlement_frozen: number         // 冻结中货款（退款/争议期间）
  wx_sub_mch_id: string | null      // 微信支付服务商子商户号（分账直达）
  created_at: string
}

export interface StoreCategory {
  id: string
  store_id: string | null
  name: string
  sort_order: number
  scope: 'global' | 'store'
  /** 是否上架：false=下架（前端入口隐藏，"全部"仍可见） */
  is_active: boolean
}

/** 科目化分类（食养科目）：C 端浏览主分类，替代传统物理品类。
 *  key 稳定（驱动派生与过滤），name/icon 运营可改；scope='store' 为门店自定义。 */
export interface ProductSubject {
  id: string
  key: string
  name: string
  icon: string | null
  description: string | null
  sort_order: number
  scope: 'global' | 'store'
  store_id: string | null
  is_active: boolean
}

/** 临期特惠商品（读自视图 v_near_expiry_products，数据层通用，按 store_id 可过滤） */
export interface StoreNearExpiry {
  product_id: string
  store_id: string
  name: string | null
  image_url: string | null
  price: number
  original_price: number | null
  batch_id: string
  auto_discount_rate: number
  qty: number
  effective_price: number
  expire_at: string
  days_left: number
  discount_stage: 'amber' | 'orange' | 'red'
  ai_reason: string | null
  decided_by: 'rule' | 'ai'
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
  product_emotion?: ProductEmotion
  ingredients?: string[] | null
  // 食材食疗智能导购字段（迁移 00100；raw_material 复用 ingredients 列）
  overall_nature?: string | null          // 商品整体性味：大寒/寒凉/平性/微温/温热/大热
  food_stage?: string | null              // 食养阶段（清/通/调/补/固）；空时由 ingredients 主导功效派生，商家可人工微调
  health_tag?: string[] | null            // 固定食疗标签库 9 项
  emotion_tag?: string[] | null           // 固定情绪标签库 8 项
  match_goods?: string[] | null           // 推荐搭配商品 id 列表
  conflict_goods?: string[] | null        // 冲突/慎搭商品 id 列表
  aux_remind?: string | null              // 辅料自适应提醒文案
  // 全面安全分析（迁移 00204）：商品标签结构化字段
  allergens?: string[] | null            // 致敏原 key 列表（allergen-dictionary key）
  nutrition?: { energy_kj?: number | null; protein_g?: number | null; fat_g?: number | null; carb_g?: number | null; sugar_g?: number | null; sodium_mg?: number | null } | null
  label_info?: { score?: number; present?: Record<string, boolean>; missing?: string[] } | null
  safety_grade?: 'S' | 'A' | 'C' | 'D' | null   // 全面安全评级
  safety_summary?: Record<string, unknown> | null
  food_category?: string | null
  store_name?: string | null  // 分析报告缓存（ComprehensiveSafetyReport JSON）
  sales_count?: number        // 累计销量（件），见迁移 00221
  // 科目化分类（迁移 20260802）：冗余派生字列，支撑 .overlaps 快速过滤与卡片展示
  subject_keys?: string[] | null
  // 食养系统化（迁移 20260801）：therapy_json 单一数据源 + 冗余加速列
  therapy_json?: Record<string, unknown> | null
  fit_people?: string | null
  therapy_pending?: boolean | null
  // 商品类型化（迁移 20260803）：礼品/手作与食养食品彻底分开，详情页按 product_kind 条件渲染
  product_kind?: 'food' | 'gift' | 'craft' | 'care' | null
  materials?: string[] | null          // 礼品/手作的材质或草本成分清单（绝不写入 ingredients）
  gift_meaning?: string | null         // 寓意文化（礼品页灵魂）
  gift_craft?: string | null           // 材质工艺（手作/工序）
  gift_scene?: string | null           // 送礼场景（转化核心）
  gift_care?: string | null            // 保养与使用注意（合规嗅觉体感）

}

// 用户结构化健康画像（迁移 00205，1:1 profiles）
// 替代原自由文本 constitution_tags，使食疗引擎可程序化比对「安不安全 / 适不适合」。
// 仅作食养参考，不替代医嘱（见 compliance/shield.ts 红线）。
export interface UserHealthProfile {
  user_id: string
  age_group: string | null               // 儿童/青少年/成人/孕哺期/老年
  gender: string | null                  // 男/女/不填
  constitution_type: string | null       // 中医九种体质 或 沿用 13 人群标签（渐进式）
  allergies: string[] | null             // allergen-dictionary key 列表
  chronic_conditions: string[] | null    // HEALTH_CROWD_OPTIONS
  body_states: string[] | null           // BODY_CROWD_OPTIONS
  health_goals: string[] | null          // 控糖/护胃/助眠/补血/抗疲劳/减脂/清热
  privacy_flags: Record<string, unknown> | null
  updated_at: string | null
}

// 家庭档案（战略支柱② · 一户一档，绑定家庭锁死用户）
// families：每个 owner 仅一条；family_members：全家成员（中性食养参考维度，不替代医嘱）。
// 仅作食养参考，不替代医嘱（见 compliance/shield.ts 红线）。
export interface Family {
  id: string
  owner_id: string
  name: string
  created_at: string
}

export interface FamilyMember {
  id: string
  family_id: string
  owner_id: string
  name: string
  age_group: string | null               // 儿童/青少年/成人/孕哺期/老年
  gender: string | null                  // 男/女/不填
  constitution_type: string | null       // 中医九种体质 或 沿用 13 人群标签
  allergies: string[] | null             // allergen-dictionary key 列表
  chronic_conditions: string[] | null    // HEALTH_CROWD_OPTIONS
  body_states: string[] | null           // BODY_CROWD_OPTIONS
  health_goals: string[] | null          // 控糖/护胃/助眠/补血/抗疲劳/减脂/清热
  diet_cycle: Record<string, unknown> | null // 中性「饮食周期/节奏」
  avatar_color: string | null            // 家庭成员卡片配色（前端用）
  notes: string | null                   // 自由备注（中性食养偏好，非病历）
  created_at: string
  updated_at: string
}

// 扫描历史（学习闭环：输入/解析/画像快照/tier）
export interface UserScanHistory {
  id: string
  user_id: string
  input_type: string | null              // text / photo / barcode
  raw_text: string | null
  parsed: Record<string, unknown> | null // 添加剂/过敏原/营养/性味
  profile_snapshot: Record<string, unknown> | null // 分析时画像快照
  tier: string | null                    // recommend/caution/avoid
  created_at: string
}

// 商品情绪编译结果缓存（由 emotion-compile Edge Function 写入，详情页直读）
export interface ProductEmotion {
  id: string
  product_id: string
  emotion_title: string | null
  emotion_detail: string | null
  scene_tags_compiled: string[] | null
  mood_tags_used: string[] | null
  category_profile_id: string | null
  compiled_by: 'rule' | 'llm'
  model: string | null
  compiled_at: string
  created_at: string
  // 商家情绪编译工作台（00050）新增字段
  dimension_tags?: Record<string, string[]> | null  // 五维标签：function/scene/emotion/identity/sensory
  quality_score?: number | null
  review_status?: 'draft' | 'submitted' | 'approved' | 'rejected'
  // 食养成分编译（扩展）
  shiyang_tags?: Record<string, string[]> | null     // 食养成分标签：按性味分类的 ingred key 列表
  shiyang_copy?: string | null                        // 编译生成的食养卡片文案
}

// 食养成分（ingredients 字典表，对应迁移 ingredients 表）
export interface Ingredient {
  id: string
  name: string
  nature: string | null       // 温/凉/平/寒/微温/微寒
  benefits: string[]           // 食养功效
  audiences: string[]          // 适用人群
  scenarios: string[]          // 生活场景
  icon: string | null
  color: string | null
}

// 商品-配料安全关联（product_food_additives 表）—— 商品挂载的添加剂安全条目
export interface ProductFoodAdditive {
  product_id: string
  additive_id: string
}

// 药食同源体质匹配算法数据库 · 核心私有资产表（迁移 20260802_medicinal_food_catalog）
// ⚠️ 资产保护：本表 RLS 拒绝 anon / authenticated 读取，仅 service_role（Edge Function 服务端）可读。
// 小程序客户端禁止直读；匹配逻辑只在 ingredient-analyze EF 内闭运算，保证「不对外公开接口」。
export interface MedicinalFoodCatalogRow {
  id: string
  name: string                 // 食材名（与商品 ingredients 匹配键）
  category: string | null      // 根茎/果类/种子/谷物/花类/叶类/菌类/蜂产品…
  nature: string | null        // 食性：大寒/寒凉/平性/微温/温热/大热
  flavor: string | null        // 味：甘/酸/苦/辛/咸/淡/涩
  is_homology: boolean         // 是否在「既是食品又是中药材」国家目录
  homology_batch: string | null // 目录批次：2024版目录 / 试点目录
  age_suitable: string[]       // 适宜年龄段：儿童/青少年/成人/孕哺期/中老年
  age_caution: string[]        // 各年龄段注意（婴幼儿禁用 / 孕妇慎用…）
  compatibility: string | null // 性味配伍宜忌（中性食养参考）
  source_ref: string | null    // 出处（国家目录名称）
  created_at: string
}

// 配料表 OCR 识别任务（ingredient_ocr_tasks 表）—— 商品配料表拍照识别 + 人工复核闭环
export interface IngredientOcrTask {
  id: string
  product_id: string | null      // 关联商品（可先识别后挂商品）
  store_id: string | null
  image_url: string               // 配料表原图（OCR 输入）
  raw_text: string | null         // OCR 原始识别文本
  parsed_ingredients: string[] | null  // 解析出的配料名列表
  matched_additives: string[] | null   // 已匹配安全库的配料名
  safety_grade: 'S' | 'A' | 'C' | null // 引擎初算安全评级
  status: 'pending' | 'reviewing' | 'approved' | 'rejected'  // 复核状态
  reviewer_id: string | null      // 复核人
  review_note: string | null      // 复核意见
  risk_flags: string[] | null     // 风险标注（反式脂肪/高钠/致敏原…）
  created_by: string | null
  created_at: string
  updated_at: string
}

// =====================
// 食品配料安全管理系统（V1.0 全量，基于原有 Supabase 基础）
// 异业共享会员联盟不在此实现；二级分销复用来电有喜既有模型。
// =====================

// 配料安全库（food_additives 表）—— 添加剂安全壁垒资产：白/黄/黑风险 + 国标依据
// 注意：与「食养成分 Ingredient（性味温凉平）」是两个独立概念，互不冲突。
export type AdditiveRiskLevel = 'white' | 'yellow' | 'black'
export interface FoodAdditive {
  id: string
  name: string                  // 标准名，如「山梨酸钾」
  category: string | null       // 防腐剂/色素/增稠剂/甜味剂/香精/营养强化剂/其他
  risk_level: AdditiveRiskLevel // 白(安全)/黄(限量)/黑(禁用)
  age_limit: number | null      // 最小适用年龄（月），NULL=全龄
  gb_std: string | null         // 国标依据，如 GB2760
  risk_desc: string | null      // 风险说明文案
  source: 'preset' | 'auto'     // preset 人工录入 / auto 识别沉淀
  status: 'active' | 'pending_review'  // 待审核条目不进入公开匹配
  created_by: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

// 配料别名表（food_additive_aliases）—— 俗称/异体映射，提升 OCR 匹配率
export interface FoodAdditiveAlias {
  id: string
  additive_id: string
  alias: string
}

// 库存批次（stock_batches 表）—— 入库质检 + 临期预警
export interface StockBatch {
  id: string
  product_id: string
  store_id: string | null
  batch_no: string | null
  qty: number
  produced_at: string | null
  expire_at: string | null
  status: 'normal' | 'sold_out' | 'expired' | 'blocked'
  created_at: string
}


// 情绪确权记录（消费即确权路线，由 00052 建表）
export interface EmotionClaim {
  id: string
  user_id: string | null
  order_no: string | null
  product_id: string | null
  store_id: string | null
  selected_emotion: string[] | null
  badge_text: string | null
  tongbao_amount: number | null   // 历史兼容（旧版存健康豆/健康豆）；V2 起用 tb_amount
  tb_amount: number | null        // 本次确权发放 健康豆
  cv_amount: number | null        // 本次确权发放 会员贡献值
  badge_code: string | null       // 情绪徽章 code
  created_at: string
}

// =====================
// 健康豆 + 徽章（V5 P2-1，00053 独立化）
// =====================

// 健康豆账户
export interface EmotionAsset {
  id: string
  user_id: string
  balance: number        // 可用健康豆
  frozen: number         // 冻结中
  total_earned: number   // 累计获得
  total_spent: number    // 累计消耗
  created_at: string
  updated_at: string
}

// 健康豆流水
export type EmotionTongbaoReason =
  | 'emotion_claim'      // 消费即确权奖励
  | 'emotion_feed'       // 情绪喂养消耗
  | 'emotion_exchange'   // 健康豆兑换（未来）
  | 'admin_adjust'       // 平台调账
  | 'share_invite'       // 分享归属奖励
export interface EmotionTongbaoLog {
  id: string
  user_id: string
  delta: number
  balance_after: number
  reason: EmotionTongbaoReason
  ref_id: string | null
  remark: string | null
  created_at: string
}

// 徽章定义（字典表，运营可改）
export type EmotionBadgeRarity = 'common' | 'rare' | 'epic' | 'legend'
export interface EmotionBadgeDef {
  code: string
  name: string
  description: string
  icon: string
  rarity: EmotionBadgeRarity
  unlock_hint: string
  sort_order: number
  is_active: boolean
  created_at: string
}

// 徽章发放
export interface EmotionBadgeGrant {
  id: string
  user_id: string
  badge_code: string
  granted_at: string
  expire_at: string | null
  source: 'auto' | 'admin' | null
}

// 类目情绪编译策略（来自 category_emotion_profiles 表，运营后台可改）
export interface CategoryEmotionProfileRow {
  id: string
  category_key: string
  label: string
  tone: string | null
  allowed_mood_tags: string[] | null
  metaphors: string[] | null
  angles: string[] | null
  openers: string[] | null
  closers: string[] | null
  aliases: string[] | null
  created_at: string
  updated_at: string
}

// 情绪词表桥接（商品 mood_tags ↔ 用户 6 情绪态）
export interface EmotionTaxonomy {
  id: string
  mood_tag: string
  inner_label: string
  description: string | null
  created_at: string
}

export interface CartItem {
  id: string
  user_id: string
  product_id: string
  store_id: string
  quantity: number
  selected: boolean
  created_at: string
  batch_id?: string | null   // 临期批次：关联 cart_items.batch_id，驱动购物车/支付页临期特惠价
  // joined
  products?: Product
  stores?: Store
}

export interface Order {
  id: string
  order_no: string
  user_id: string
  store_id: string | null
  total_amount: number
  status: OrderStatus
  payment_method: PaymentMethod | null
  pay_expired_at: string | null
  paid_at: string | null
  tb_used: number
  referrer_id: string | null
  commission_distributed: boolean
  service_type: 'dine_in' | 'self_pickup' | 'delivery'
  refund_amount: number
  // 00018 迁移补全的字段
  parent_order_no: string | null
  idempotency_key: string | null
  l1_commission: number | null
  l2_commission: number | null
  buyer_points: number | null
  platform_income: number | null
  commission_calculated: boolean
  promoter_id: string | null
  staff_id: string | null
  created_at: string
  // 确权闸门：核销后 verified_at 非空才允许确权（orders 表无 is_used 列）
  used_at: string | null
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
  created_at: string
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
export type PointsLogType = 'purchase_earn' | 'invite_earn' | 'checkin_earn' | 'ugc_earn' | 'redeem_spend' | 'pay_spend' | 'refund_deduct' | 'emotion_claim'
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

/** 健康豆流水（tongbao_logs）- 平台统一货币账户 */
export interface TongbaoLog {
  id: string
  user_id: string
  order_id: string | null
  type: 'purchase_spend' | 'refund_return' | 'recharge' | 'admin_grant' | 'admin_deduct' | 'purchase_earn' | 'refund_deduct' | 'commission_earn'
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
  video_url: string | null
  view_count: number
  share_count: number
  created_at: string
  // joined
  profiles?: Pick<Profile, 'id' | 'nickname' | 'avatar_url'>
}

export interface MerchantApplication {
  id: string
  user_id: string
  store_name: string
  contact_name: string | null
  contact_phone: string
  business_type: string | null
  description: string | null
  /** P7 自营门店申请：精简到 3 字段后，门店地址作为可选信息一并提交，审核通过时写入 stores.address */
  address: string | null
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

// 首页「好物动态」：实时下单脱敏聚合（由 get_recent_order_feed RPC 返回）
export interface OrderFeedItem {
  id: string
  masked_name: string
  store_name: string | null
  product_name: string
  amount: number
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

export interface ArticleFavorite {
  id: string
  user_id: string
  article_id: string
  created_at: string
  articles?: any
}

export interface AuthorFollow {
  id: string
  user_id: string
  author_id: string
  created_at: string
  profiles?: any
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
  store_id: string | null
  claimed_from: string | null
}

export interface Withdrawal {
  id: string
  user_id: string
  store_id: string | null
  amount: number
  status: WithdrawStatus
  method: string                 // wechat | alipay | bank（withdrawals.method 列）
  account_info: any | null       // jsonb（微信/支付宝账号等）
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  alipay_account: string | null
  withdraw_method: WithdrawMethod
  real_name: string | null
  id_card: string | null
  reject_reason: string | null
  remark: string | null
  kind: string                   // commission | settlement（迁移 00120）
  merchant_settlement_ids: string[] | null
  created_at: string
  updated_at: string
}

// 已保存收款账户（迁移 00123）：绑定一次后持久化，提现可复用，免二次填写
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
// Redpacket Payouts（红包现金发放记录）
// =====================

export type RedpacketPayoutStatus =
  | 'pending_manual'  // 框架待启用，仅记录未发钱
  | 'processing'      // 已提交微信，受理中
  | 'success'         // 微信已受理（异步到账）
  | 'failed'          // 调用失败

export interface RedpacketPayout {
  id: string
  user_id: string
  campaign_id: number
  claim_id: string | null
  openid: string | null
  amount_fen: number
  status: RedpacketPayoutStatus
  wx_out_bill_no: string | null
  wx_transfer_bill_no: string | null
  error_msg: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

// =====================
// Pending Referrals（预归属）
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

// =====================
// Emotion System（情绪系统）
// =====================

export type EmotionInnerLabel = 'drained_low' | 'lonely_still' | 'expressive_high' | 'peaceful_zen' | 'nostalgic_soft' | 'eager_forward'

export interface EmotionKeyword {
  id: number
  inner_label: EmotionInnerLabel
  keyword: string
  priority: number
  created_at: string
}

export interface EmotionContent {
  id: number
  inner_label: EmotionInnerLabel
  content_type: 'translation' | 'scene_card' | 'feed_title'
  scene_card_id?: string
  title: string
  subtitle?: string
  extra_meta?: any
  created_at: string
}

export interface EmotionResponse {
  inner_label: EmotionInnerLabel
  translation: string
  sceneCards: EmotionContent[]
  feedTitles: EmotionContent[]
}

export interface PrinterConfig {
  id: string
  store_id: string
  provider: 'feie' | 'yilianyun' | '365'
  device_sn: string
  api_user: string | null
  api_key: string | null
  printer_key: string | null
  enabled: boolean
  auto_print_on_paid: boolean
  print_count: number
  last_print_at: string | null
  created_at: string
  updated_at: string
}
