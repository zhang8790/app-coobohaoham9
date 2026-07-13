// 全局 Mock 数据 — 演示模式用
import type { MerchantApplication, Product, Withdrawal, Refund, Profile, Article, Announcement } from '@/types'

export const MOCK_MERCHANTS: MerchantApplication[] = [
  { id: 'm1', user_id: 'u1', store_name: '霸王茶姬（旗舰店）', contact_name: '张三', contact_phone: '13800138001', business_type: '餐饮', description: '头部新中式茶饮品牌', status: 'pending', reject_reason: null, created_at: new Date().toISOString() },
  { id: 'm2', user_id: 'u2', store_name: '瑞幸咖啡（科技园店）', contact_name: '李四', contact_phone: '13800138002', business_type: '餐饮', description: '知名连锁咖啡品牌', status: 'approved', reject_reason: null, created_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'm3', user_id: 'u3', store_name: '名创优品（万达店）', contact_name: '王五', contact_phone: '13800138003', business_type: '零售', description: '生活好物集合店', status: 'pending', reject_reason: null, created_at: new Date(Date.now()-2*864e5).toISOString() },
  { id: 'm4', user_id: 'u4', store_name: '良品铺子（楚河汉街店）', contact_name: '赵六', contact_phone: '13800138004', business_type: '零售', description: '休闲零食连锁', status: 'rejected', reject_reason: '类目资质不全', created_at: new Date(Date.now()-3*864e5).toISOString() },
]

export const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', store_id: 'm1', category_id: 'cat-1', name: '伯牙绝弦·云茶', description: '招牌鲜奶茶', price: 18, original_price: null, image_url: null, main_image: null, sub_images: null, detail_images: null, video_url: null, stock: 999, cost_price: 8, discount_rate: 10, is_active: true, review_status: 'pending', created_at: new Date().toISOString() },
  { id: 'p2', store_id: 'm1', category_id: 'cat-1', name: '桂馥兰香·云茶', description: '桂花乌龙鲜奶', price: 16, original_price: null, image_url: null, main_image: null, sub_images: null, detail_images: null, video_url: null, stock: 999, cost_price: 7, discount_rate: 10, is_active: true, review_status: 'approved', created_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'p3', store_id: 'm2', category_id: 'cat-2', name: '生椰拿铁', description: '夏日限定', price: 19, original_price: null, image_url: null, main_image: null, sub_images: null, detail_images: null, video_url: null, stock: 500, cost_price: 9, discount_rate: 10, is_active: true, review_status: 'pending', created_at: new Date(Date.now()-2*864e5).toISOString() },
  { id: 'p4', store_id: 'm3', category_id: 'cat-3', name: '零食大礼包', description: '精选零食组合', price: 49.9, original_price: null, image_url: null, main_image: null, sub_images: null, detail_images: null, video_url: null, stock: 200, cost_price: 30, discount_rate: 20, is_active: true, review_status: 'approved', created_at: new Date(Date.now()-3*864e5).toISOString() },
  { id: 'p5', store_id: 'm4', category_id: 'cat-3', name: '坚果混合装', description: '每日坚果', price: 29.9, original_price: null, image_url: null, main_image: null, sub_images: null, detail_images: null, video_url: null, stock: 300, cost_price: 18, discount_rate: 20, is_active: false, review_status: 'pending', created_at: new Date(Date.now()-4*864e5).toISOString() },
]

export const MOCK_WITHDRAWALS: Withdrawal[] = [
  { id: 'w1', user_id: 'u1', store_id: null, amount: 500, status: 'pending', withdraw_method: 'bank', bank_name: '工商银行', bank_account: '6222****1234', bank_holder: '张三', real_name: '张三', id_card: '110101199001011234', alipay_account: null, reject_reason: null, remark: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'w2', user_id: 'u2', store_id: null, amount: 1200, status: 'pending', withdraw_method: 'alipay', bank_name: null, bank_account: null, bank_holder: null, real_name: '李四', id_card: '310101199203034567', alipay_account: '138****0000', reject_reason: null, remark: null, created_at: new Date(Date.now()-864e5).toISOString(), updated_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'w3', user_id: 'u3', store_id: null, amount: 300, status: 'approved', withdraw_method: 'bank', bank_name: '招商银行', bank_account: '6217****5678', bank_holder: '王五', real_name: '王五', id_card: '440301198807086789', alipay_account: null, reject_reason: null, remark: null, created_at: new Date(Date.now()-2*864e5).toISOString(), updated_at: new Date(Date.now()-2*864e5).toISOString() },
]

export const MOCK_REFUNDS: Refund[] = [
  { id: 'r1', refund_no: 'RF202606300001', order_id: 'o1', order_no: 'LD202606300001', item_index: 0, user_id: 'u1', initiated_by: 'user', status: 'pending_review', refund_quantity: 1, refund_amount: 18, reason: '商品与描述不符', description: null, wechat_refund_id: null, version: 1, completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'r2', refund_no: 'RF202606300002', order_id: 'o2', order_no: 'LD202606300002', item_index: 0, user_id: 'u2', initiated_by: 'user', status: 'processing', refund_quantity: 1, refund_amount: 19, reason: '超时未送达', description: null, wechat_refund_id: null, version: 1, completed_at: null, created_at: new Date(Date.now()-864e5).toISOString(), updated_at: new Date(Date.now()-864e5).toISOString() },
]

export const MOCK_USERS: Profile[] = [
  { id: 'u1', username: '霸王茶姬', nickname: '霸王茶姬旗舰店', phone: '13800138001', avatar_url: null, role: 'merchant', member_rank: '黄金', points: 1200, balance: 5800, merchant_status: 'approved', created_at: new Date().toISOString() },
  { id: 'u2', username: '瑞幸咖啡', nickname: '瑞幸咖啡科技园店', phone: '13800138002', avatar_url: null, role: 'merchant', member_rank: '白银', points: 800, balance: 3200, merchant_status: 'approved', created_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'u3', username: '张三', nickname: '爱吃糖的张三', phone: '13800138003', avatar_url: null, role: 'user', member_rank: '青铜', points: 320, balance: 88, merchant_status: 'none', created_at: new Date(Date.now()-2*864e5).toISOString() },
  { id: 'u4', username: '李四', nickname: '奶茶爱好者李四', phone: '13800138004', avatar_url: null, role: 'user', member_rank: '白银', points: 680, balance: 199, merchant_status: 'none', created_at: new Date(Date.now()-3*864e5).toISOString() },
  { id: 'u5', username: 'admin', nickname: '超级管理员', phone: '13800138000', avatar_url: null, role: 'admin', member_rank: '盟主', points: 9999, balance: 0, merchant_status: 'none', created_at: new Date(Date.now()-30*864e5).toISOString() },
]

export const MOCK_ARTICLES: Article[] = [
  { id: 'a1', user_id: 'u1', title: '夏季新品上市：伯牙绝弦云茶', content: '...', images: [], is_published: true, created_at: new Date().toISOString() },
  { id: 'a2', user_id: 'u2', title: '平台规则更新通知（2026年6月）', content: '...', images: [], is_published: true, created_at: new Date(Date.now()-3*864e5).toISOString() },
  { id: 'a3', user_id: 'u3', title: '如何提升店铺曝光率？', content: '...', images: [], is_published: false, created_at: new Date(Date.now()-7*864e5).toISOString() },
]

export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  { id: 'an1', content: '来电有喜平台正式上线！', is_active: true, sort_order: 1, created_at: new Date().toISOString() },
  { id: 'an2', content: '全平台满减活动进行中', is_active: true, sort_order: 2, created_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'an3', content: '将于今晚凌晨2点进行系统维护', is_active: false, sort_order: 3, created_at: new Date(Date.now()-2*864e5).toISOString() },
]

export const MOCK_ADMIN_STATS = {
  merchants: 3, products: 5, withdrawals: 2, articles: 3, users: 8, orders: 12,
}
