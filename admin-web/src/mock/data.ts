// 全局 Mock 数据 — 演示模式用
import type { MerchantApplication, Product, Withdrawal, Refund, Profile, Article, Announcement } from '@/types'

export const MOCK_MERCHANTS: MerchantApplication[] = [
  { id: 'm1', user_id: 'u1', store_name: '霸王茶姬（旗舰店）', contact_name: '张三', business_type: '餐饮', status: 'pending', created_at: new Date().toISOString() },
  { id: 'm2', user_id: 'u2', store_name: '瑞幸咖啡（科技园店）', contact_name: '李四', business_type: '餐饮', status: 'approved', created_at: new Date(Date.now()-864e5).toISOString() },
  { id: 'm3', user_id: 'u3', store_name: '名创优品（万达店）', contact_name: '王五', business_type: '零售', status: 'pending', created_at: new Date(Date.now()-2*864e5).toISOString() },
  { id: 'm4', user_id: 'u4', store_name: '良品铺子（楚河汉街店）', contact_name: '赵六', business_type: '零售', status: 'rejected', created_at: new Date(Date.now()-3*864e5).toISOString() },
]

export const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', merchant_id: 'm1', name: '伯牙绝弦·云茶', description: '招牌鲜奶茶', price: 18, stock: 999, status: 'pending', created_at: new Date().toISOString() } as Product,
  { id: 'p2', merchant_id: 'm1', name: '桂馥兰香·云茶', description: '桂花乌龙鲜奶', price: 16, stock: 999, status: 'approved', created_at: new Date(Date.now()-864e5).toISOString() } as Product,
  { id: 'p3', merchant_id: 'm2', name: '生椰拿铁', description: '夏日限定', price: 19, stock: 500, status: 'pending', created_at: new Date(Date.now()-2*864e5).toISOString() } as Product,
  { id: 'p4', merchant_id: 'm3', name: '零食大礼包', description: '精选零食组合', price: 49.9, stock: 200, status: 'approved', created_at: new Date(Date.now()-3*864e5).toISOString() } as Product,
  { id: 'p5', merchant_id: 'm4', name: '坚果混合装', description: '每日坚果', price: 29.9, stock: 300, status: 'pending', created_at: new Date(Date.now()-4*864e5).toISOString() } as Product,
]

export const MOCK_WITHDRAWALS: Withdrawal[] = [
  { id: 'w1', user_id: 'u1', amount: 500, method: 'bank', account_info: '6222****1234', status: 'pending', created_at: new Date().toISOString() } as Withdrawal,
  { id: 'w2', user_id: 'u2', amount: 1200, method: 'alipay', account_info: '138****0000', status: 'pending', created_at: new Date(Date.now()-864e5).toISOString() } as Withdrawal,
  { id: 'w3', user_id: 'u3', amount: 300, method: 'bank', account_info: '6217****5678', status: 'approved', created_at: new Date(Date.now()-2*864e5).toISOString() } as Withdrawal,
]

export const MOCK_REFUNDS: Refund[] = [
  { id: 'r1', order_id: 'o1', user_id: 'u1', merchant_id: 'm1', amount: 18, reason: '商品与描述不符', status: 'pending', created_at: new Date().toISOString() } as Refund,
  { id: 'r2', order_id: 'o2', user_id: 'u2', merchant_id: 'm2', amount: 19, reason: '超时未送达', status: 'processing', created_at: new Date(Date.now()-864e5).toISOString() } as Refund,
]

export const MOCK_USERS: Profile[] = [
  { id: 'u1', username: '霸王茶姬', nickname: '霸王茶姬旗舰店', role: 'merchant', level: '黄金', points: 1200, balance: 5800, phone: '13800138001', created_at: new Date().toISOString() } as Profile,
  { id: 'u2', username: '瑞幸咖啡', nickname: '瑞幸咖啡科技园店', role: 'merchant', level: '白银', points: 800, balance: 3200, phone: '13800138002', created_at: new Date(Date.now()-864e5).toISOString() } as Profile,
  { id: 'u3', username: '张三', nickname: '爱吃糖的张三', role: 'user', level: '青铜', points: 320, balance: 88, phone: '13800138003', created_at: new Date(Date.now()-2*864e5).toISOString() } as Profile,
  { id: 'u4', username: '李四', nickname: '奶茶爱好者李四', role: 'user', level: '白银', points: 680, balance: 199, phone: '13800138004', created_at: new Date(Date.now()-3*864e5).toISOString() } as Profile,
  { id: 'u5', username: 'admin', nickname: '超级管理员', role: 'admin', level: '盟主', points: 9999, balance: 0, phone: '13800138000', created_at: new Date(Date.now()-30*864e5).toISOString() } as Profile,
]

export const MOCK_ARTICLES: Article[] = [
  { id: 'a1', title: '夏季新品上市：伯牙绝弦云茶', content: '...', type: 'product', status: 'published', created_at: new Date().toISOString() } as Article,
  { id: 'a2', title: '平台规则更新通知（2026年6月）', content: '...', type: 'notice', status: 'published', created_at: new Date(Date.now()-3*864e5).toISOString() } as Article,
  { id: 'a3', title: '如何提升店铺曝光率？', content: '...', type: 'guide', status: 'draft', created_at: new Date(Date.now()-7*864e5).toISOString() } as Article,
]

export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  { id: 'an1', title: '平台上线公告', content: '来店有喜平台正式上线！', type: 'system', target: 'all', status: 'active', pinned: true, created_at: new Date().toISOString() } as Announcement,
  { id: 'an2', title: '618大促活动通知', content: '全平台满减活动进行中', type: 'activity', target: 'all', status: 'active', pinned: false, created_at: new Date(Date.now()-864e5).toISOString() } as Announcement,
  { id: 'an3', title: '系统维护通知', content: '将于今晚凌晨2点进行系统维护', type: 'system', target: 'all', status: 'inactive', pinned: false, created_at: new Date(Date.now()-2*864e5).toISOString() } as Announcement,
]

export const MOCK_ADMIN_STATS = {
  merchants: 3, products: 5, withdrawals: 2, articles: 3, users: 8, orders: 12,
}
