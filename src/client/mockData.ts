// 本地开发模式：模拟数据
// 当 TARO_APP_LOCAL_DEV=true 时生效
import type { Product, Store, StoreCategory, Profile, CartItem, Order, Article, MerchantApplication, Withdrawal, Refund, Announcement, Coupon, UserAddress, Favorite, Footprint } from '@/db/types'

// =====================
// 测试用户
// =====================
export const mockUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@laidianyouxi.com',
  phone: '+8618701410500',
  role: 'authenticated',
}

export const mockProfile: Profile = {
  id: mockUser.id,
  username: 'tester',
  phone: '18701410500',
  nickname: '测试侠客',
  avatar_url: 'https://picsum.photos/seed/avatar/200/200',
  role: 'user',
  openid: 'mock-openid-001',
  member_rank: '初心',
  points: 500,
  tb_balance: 100.00,       // 情绪豆余额（统一货币，本地 mock 支付用）
  balance: 100.00,          // 历史遗留字段，保留以满足 Profile 类型；实际以 tb_balance 为准
  coupons_count: 3,
  merchant_status: 'approved',
  referral_code: 'ABC123',
  referrer_id: null,
  total_consumption: 500,  // 个人累计消费500元
  // V4分佣算法字段
  monthly_consumption: 100,       // 当月消费100元（达标）
  consecutive_zero_months: 0,     // 未连续零消费
  team_monthly_gmv: 0,            // 团队月度GMV（暂无推荐）
  has_new_recruit: false,          // 当月无新增推荐
  months_since_last_recruit: 2,    // 2个月无拓新（未满3个月）
  
  // 添加西瓜商品（让利10%）
  // 注意：实际数据库中已有，这里仅用于本地测试
  created_at: new Date().toISOString(),
}

const STORE_IMG = 'https://picsum.photos/seed/store/400/400'

// =====================
// 测试门店（多个，用于犒赏铺展示）
// =====================
export const mockStores: Store[] = [
  {
    id: 'store-001',
    owner_id: mockUser.id,
    name: '测试江湖客栈',
    description: '本地开发测试门店，卖各种江湖好货',
    address: '江湖路 88 号',
    phone: '13800138000',
    category: '餐饮',
    image_url: STORE_IMG,
    banner_url: STORE_IMG,
    rating: 4.8,
    is_active: true,
    short_code: 'TEST01',
    created_at: new Date().toISOString(),
  },
  {
    id: 'store-002',
    owner_id: mockUser.id,
    name: '茶语轩',
    description: '精品茶饮，现泡现卖，口感醇厚',
    address: '江湖路 66 号',
    phone: '13800138001',
    category: '饮品',
    image_url: 'https://picsum.photos/seed/store2/400/400',
    banner_url: 'https://picsum.photos/seed/store2b/400/200',
    rating: 4.6,
    is_active: true,
    short_code: 'TEST02',
    created_at: new Date().toISOString(),
  },
  {
    id: 'store-003',
    owner_id: '00000000-0000-0000-0000-000000000002',
    name: '书香阁',
    description: '精选图书，文武双全侠客必访',
    address: '文武街 12 号',
    phone: '13800138002',
    category: '图书',
    image_url: 'https://picsum.photos/seed/store3/400/400',
    banner_url: 'https://picsum.photos/seed/store3b/400/200',
    rating: 4.9,
    is_active: true,
    short_code: 'TEST03',
    created_at: new Date().toISOString(),
  },
  {
    id: 'store-004',
    owner_id: '00000000-0000-0000-0000-000000000003',
    name: '零食江湖',
    description: '各地特色零食，一网打尽',
    address: '美食巷 5 号',
    phone: '13800138003',
    category: '零食',
    image_url: 'https://picsum.photos/seed/store4/400/400',
    banner_url: 'https://picsum.photos/seed/store4b/400/200',
    rating: 4.5,
    is_active: true,
    short_code: 'TEST04',
    created_at: new Date().toISOString(),
  },
]

// 保持向后兼容
export const mockStore: Store = mockStores[0]

// =====================
// 门店商品分类（每个门店的分类）
// =====================
export const mockStoreCategories: StoreCategory[] = [
  // 门店1：测试江湖客栈（餐饮）
  { id: 'cat-001', store_id: 'store-001', name: '招牌菜', sort_order: 1, created_at: new Date().toISOString() },
  { id: 'cat-002', store_id: 'store-001', name: '面食', sort_order: 2, created_at: new Date().toISOString() },
  { id: 'cat-003', store_id: 'store-001', name: '甜品饮品', sort_order: 3, created_at: new Date().toISOString() },
  // 门店2：茶语轩（饮品）
  { id: 'cat-004', store_id: 'store-002', name: '茶饮', sort_order: 1, created_at: new Date().toISOString() },
  { id: 'cat-005', store_id: 'store-002', name: '奶茶', sort_order: 2, created_at: new Date().toISOString() },
  // 门店3：书香阁（图书）
  { id: 'cat-006', store_id: 'store-003', name: '武功秘籍', sort_order: 1, created_at: new Date().toISOString() },
  { id: 'cat-007', store_id: 'store-003', name: '内功心法', sort_order: 2, created_at: new Date().toISOString() },
  { id: 'cat-008', store_id: 'store-003', name: '轻功身法', sort_order: 3, created_at: new Date().toISOString() },
  // 门店4：零食江湖（零食）
  { id: 'cat-009', store_id: 'store-004', name: '肉脯类', sort_order: 1, created_at: new Date().toISOString() },
  { id: 'cat-010', store_id: 'store-004', name: '果干类', sort_order: 2, created_at: new Date().toISOString() },
  { id: 'cat-011', store_id: 'store-004', name: '坚果炒货', sort_order: 3, created_at: new Date().toISOString() },
]

// =====================
// 测试商品（多个门店）
// =====================
export const mockProducts: Product[] = [
  // 门店1：测试江湖客栈（餐饮）
  {
    id: 'prod-001',
    store_id: 'store-001',
    name: '江湖秘制烤鱼',
    description: '精选草鱼，秘制酱料烤制，香辣可口',
    price: 68.00,
    original_price: 88.00,
    image_url: 'https://picsum.photos/seed/grilledfish/400/400',
    main_image: 'https://picsum.photos/seed/grilledfish/400/400',
    sub_images: [
      'https://picsum.photos/seed/grilledfish2/400/400',
      'https://picsum.photos/seed/grilledfish3/400/400',
    ],
    detail_images: [
      'https://picsum.photos/seed/grilledfishd1/800/600',
      'https://picsum.photos/seed/grilledfishd2/800/600',
    ],
    video_url: '',
    cost_price: 30,
    discount_rate: 23,
    stock: 99,
    barcode: '6901234567890',
    mood_tags: ['辣', '香', '下饭'],
    scene_tags: ['午餐', '晚餐', '聚餐'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-001',
    stores: mockStores[0],
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-002',
    store_id: 'store-001',
    name: '侠客牛肉面',
    description: '大块牛肉搭配手工拉面，汤鲜味美',
    price: 28.00,
    original_price: 35.00,
    image_url: 'https://picsum.photos/seed/beefnoodles/400/400',
    main_image: 'https://picsum.photos/seed/beefnoodles/400/400',
    sub_images: [
      'https://picsum.photos/seed/beefnoodles2/400/400',
    ],
    detail_images: [
      'https://picsum.photos/seed/beefnoodlesd1/800/600',
    ],
    video_url: '',
    cost_price: 12,
    discount_rate: 20,
    stock: 50,
    barcode: '6901234567891',
    mood_tags: ['鲜', '暖', '下饭'],
    scene_tags: ['午餐', '晚餐'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-002',
    stores: mockStores[0],
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-003',
    store_id: 'store-001',
    name: '武林冰粉',
    description: '手搓冰粉配上红糖、花生碎、葡萄干，清凉解暑',
    price: 12.00,
    original_price: 15.00,
    image_url: 'https://picsum.photos/seed/iceddessert/400/400',
    main_image: 'https://picsum.photos/seed/iceddessert/400/400',
    sub_images: [
      'https://picsum.photos/seed/iceddessert2/400/400',
    ],
    detail_images: [
      'https://picsum.photos/seed/iceddessertd1/800/600',
    ],
    video_url: '',
    cost_price: 5,
    discount_rate: 20,
    stock: 200,
    barcode: '6901234567892',
    mood_tags: ['甜', '清凉'],
    scene_tags: ['下午茶'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-003',
    stores: mockStores[0],
    created_at: new Date().toISOString(),
  },
  // 西瓜（让利10%）
  {
    id: 'prod-010',
    store_id: 'store-001',
    name: '西瓜',
    description: '新鲜西瓜，清凉解暑',
    price: 12.00,
    original_price: 15.00,
    image_url: 'https://picsum.photos/seed/watermelon/400/400',
    main_image: 'https://picsum.photos/seed/watermelon/400/400',
    sub_images: [],
    detail_images: [],
    video_url: '',
    cost_price: 8,
    discount_rate: 10,
    stock: 100,
    barcode: '6901234567893',
    mood_tags: ['甜', '清凉'],
    scene_tags: ['下午茶', '消暑'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-003',
    stores: mockStores[0],
    created_at: new Date().toISOString(),
  },
  // 门店2：茶语轩（饮品）
  {
    id: 'prod-005',
    store_id: 'store-002',
    name: '江湖云雾茶',
    description: '高山云雾茶，回甘悠长',
    price: 25.00,
    original_price: 35.00,
    image_url: 'https://picsum.photos/seed/tea1/400/400',
    main_image: 'https://picsum.photos/seed/tea1/400/400',
    sub_images: [
      'https://picsum.photos/seed/tea2/400/400',
    ],
    detail_images: [
      'https://picsum.photos/seed/tead1/800/600',
    ],
    video_url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    cost_price: 10,
    discount_rate: 29,
    stock: 100,
    barcode: '6901234567895',
    mood_tags: ['清香', '回甘'],
    scene_tags: ['下午茶', '会客'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-004',
    stores: mockStores[1],
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-006',
    store_id: 'store-002',
    name: '侠客奶茶',
    description: '现煮红茶配鲜奶，甜而不腻',
    price: 18.00,
    original_price: 22.00,
    image_url: 'https://picsum.photos/seed/milktea/400/400',
    main_image: 'https://picsum.photos/seed/milktea/400/400',
    sub_images: [
      'https://picsum.photos/seed/milktea2/400/400',
    ],
    detail_images: [
      'https://picsum.photos/seed/milktead1/800/600',
    ],
    video_url: '',
    cost_price: 8,
    discount_rate: 18,
    stock: 80,
    barcode: '6901234567896',
    mood_tags: ['香', '滑'],
    scene_tags: ['下午茶', '早餐'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-005',
    stores: mockStores[1],
    created_at: new Date().toISOString(),
  },
  // 门店3：书香阁（图书）
  {
    id: 'prod-007',
    store_id: 'store-003',
    name: '武林秘籍·内功篇',
    description: '江湖传说中的内功心法，修炼必备',
    price: 45.00,
    original_price: 60.00,
    image_url: 'https://picsum.photos/seed/book1/400/400',
    main_image: 'https://picsum.photos/seed/book1/400/400',
    sub_images: [
      'https://picsum.photos/seed/book2/400/400',
    ],
    detail_images: [
      'https://picsum.photos/seed/bookd1/800/600',
    ],
    video_url: '',
    cost_price: 20,
    discount_rate: 25,
    stock: 30,
    barcode: '6901234567897',
    mood_tags: ['知识', '修炼'],
    scene_tags: ['学习', '收藏'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-006',
    stores: mockStores[2],
    created_at: new Date().toISOString(),
  },
  // 门店4：零食江湖（零食）
  {
    id: 'prod-008',
    store_id: 'store-004',
    name: '江湖肉脯',
    description: '秘制酱料腌制，炭火慢烤，嚼劲十足',
    price: 35.00,
    original_price: 45.00,
    image_url: 'https://picsum.photos/seed/jerky/400/400',
    main_image: 'https://picsum.photos/seed/jerky/400/400',
    sub_images: [
      'https://picsum.photos/seed/jerky2/400/400',
    ],
    detail_images: [
      'https://picsum.photos/seed/jerkyd1/800/600',
    ],
    video_url: '',
    cost_price: 15,
    discount_rate: 22,
    stock: 60,
    barcode: '6901234567898',
    mood_tags: ['香', '嚼劲'],
    scene_tags: ['零食', '下酒'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-009',
    stores: mockStores[3],
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-009',
    store_id: 'store-004',
    name: '侠客果干拼盘',
    description: '芒果、草莓、黄桃三种果干，酸甜可口',
    price: 22.00,
    original_price: 30.00,
    image_url: 'https://picsum.photos/seed/fruitdry/400/400',
    main_image: 'https://picsum.photos/seed/fruitdry/400/400',
    sub_images: [
      'https://picsum.photos/seed/fruitdry2/400/400',
    ],
    detail_images: [
      'https://picsum.photos/seed/fruitdryd1/800/600',
    ],
    video_url: '',
    cost_price: 10,
    discount_rate: 27,
    stock: 100,
    barcode: '6901234567899',
    mood_tags: ['酸甜', '果香'],
    scene_tags: ['零食', '下午茶'],
    is_active: true,
    review_status: 'approved',
    category_id: 'cat-010',
    stores: mockStores[3],
    created_at: new Date().toISOString(),
  },
]

// =====================
// 公告
// =====================
export let mockAnnouncements: Announcement[] = [
  { id: 'ann-001', content: '🎉 欢迎来到来电有喜！首单享九折优惠~', is_active: true, sort_order: 1, created_at: new Date().toISOString() },
  { id: 'ann-002', content: '【新店入驻】茶语轩精品茶饮正式上线，满50减10！', is_active: true, sort_order: 2, created_at: new Date().toISOString() },
  { id: 'ann-003', content: '本周末双倍积分活动，消费即送积分！', is_active: true, sort_order: 3, created_at: new Date().toISOString() },
]

// =====================
// 优惠券
// =====================
export let mockCoupons: Coupon[] = [
  { id: 'cpn-001', user_id: mockUser.id, code: 'WELCOME10', title: '新人立减券', discount_type: 'amount', discount_value: 10, min_amount: 50, is_used: false, expired_at: null, used_at: null, created_at: new Date().toISOString() },
  { id: 'cpn-002', user_id: mockUser.id, code: 'DISCOUNT20', title: '8折优惠券', discount_type: 'percent', discount_value: 0.8, min_amount: 100, is_used: false, expired_at: null, used_at: null, created_at: new Date().toISOString() },
]

// =====================
// 收货地址
// =====================
export let mockAddresses: UserAddress[] = [
  { id: 'addr-001', user_id: mockUser.id, name: '张三', phone: '13800138000', province: '北京市', city: '北京市', district: '朝阳区', detail: '建国路 88 号 SOHO 现代城 1 号楼 1801', is_default: true, created_at: new Date().toISOString() },
]

// =====================
// 收藏
// =====================
export let mockFavorites: Favorite[] = [
  { id: 'fav-001', user_id: mockUser.id, product_id: 'prod-001', created_at: new Date().toISOString() },
]

// =====================
// 足迹
// =====================
export let mockFootprints: Footprint[] = [
  { id: 'fp-001', user_id: mockUser.id, product_id: 'prod-002', viewed_at: new Date().toISOString() },
]

// =====================
// 商家申请
// =====================
export let mockMerchantApps: MerchantApplication[] = [
  {
    id: 'merchant-app-001',
    user_id: mockUser.id,
    store_name: '测试江湖客栈',
    contact_name: '测试掌柜',
    contact_phone: '13800138000',
    business_type: '餐饮',
    description: '本地开发测试门店',
    status: 'approved',
    reject_reason: null,
    created_at: new Date().toISOString(),
  }
]

// =====================
// 模拟购物车
// =====================
export let mockCartItems: CartItem[] = []

// =====================
// 模拟订单
// =====================
export let mockOrders: Order[] = []

// =====================
// 模拟退款
// =====================
export let mockRefunds: Refund[] = []

// =====================
// 模拟提现
// =====================
export let mockWithdrawals: Withdrawal[] = []

// =====================
// 文章（UGC）
// =====================
export let mockArticles: Article[] = []

// =====================
// 佣金记录（用于推广中心）
// =====================
export let mockCommissions: Commission[] = [
  {
    id: 'comm-001',
    order_id: 'mock-order-001',
    order_no: 'MO123456',
    beneficiary_id: mockUser.id,
    payer_id: '00000000-0000-0000-0000-000000000002',
    level: 1,
    rank_at_time: '初心',
    ratio: 0.08,
    pool_amount: 28.00,
    commission_amount: 2.24,
    b_coef: 1.0,
    status: 'pending',
    settle_at: null,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'comm-002',
    order_id: 'mock-order-002',
    order_no: 'MO789012',
    beneficiary_id: mockUser.id,
    payer_id: '00000000-0000-0000-0000-000000000003',
    level: 2,
    rank_at_time: '初心',
    ratio: 0.02,
    pool_amount: 15.00,
    commission_amount: 0.30,
    b_coef: 1.0,
    status: 'settled',
    settle_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
]

// =====================
// 积分日志（用于积分明细）
// =====================
export let mockPointsLogs: PointsLog[] = [
  {
    id: 'pl-001',
    user_id: mockUser.id,
    order_id: 'mock-order-001',
    type: 'purchase_earn',
    delta: 50,
    balance_after: 550,
    remark: '购物奖励积分',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'pl-002',
    user_id: mockUser.id,
    order_id: 'mock-order-002',
    type: 'purchase_earn',
    delta: 30,
    balance_after: 580,
    remark: '购物奖励积分',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'pl-003',
    user_id: mockUser.id,
    order_id: null,
    type: 'checkin_earn',
    delta: 5,
    balance_after: 585,
    remark: '每日签到',
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'pl-004',
    user_id: mockUser.id,
    order_id: null,
    type: 'invite_earn',
    delta: 100,
    balance_after: 685,
    remark: '邀请好友奖励',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
]

// =====================
// 重置所有模拟数据
// =====================
export function resetMockData() {
  mockCartItems = []
  mockOrders = []
  mockRefunds = []
  mockWithdrawals = []
  mockFavorites = []
  mockFootprints = []
  mockArticles = []
  mockCommissions = []
  mockPointsLogs = []
}
