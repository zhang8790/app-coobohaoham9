// 本地开发模式：Mock Supabase Client
// @ts-nocheck
import {
  mockUser, mockProfile, mockStore, mockProducts,
  mockCartItems, mockOrders, mockAnnouncements, mockCoupons,
  mockAddresses, mockFavorites, mockFootprints,
  mockMerchantApps, mockRefunds, mockWithdrawals, mockStores,
  mockArticles, mockStoreCategories,
  mockCommissions, mockPointsLogs,
} from './mockData'

// ═══ 可变内存 Store（让 CRUD 操作真正持久化） ═══
// 关键：profiles[0] 直接引用 mockProfile，保证 Edge Function 的修改能反映到查询结果里
const store: Record<string, any[]> = {
  profiles:          [mockProfile],  // 直接用引用，不用副本
  stores:           mockStores.map(s => ({ ...s })),
  store_categories:  mockStoreCategories.map(c => ({ ...c })),
  products:          mockProducts.map(p => ({ ...p })),
  cart_items:        mockCartItems.map(c => ({ ...c })),
  orders:            mockOrders.map(o => ({ ...o })),
  order_items:       [],
  articles:          mockArticles.map(a => ({ ...a })),
  merchant_applications: mockMerchantApps.map(m => ({ ...m })),
  announcements:     mockAnnouncements.map(a => ({ ...a })),
  commissions:       mockCommissions.map(c => ({ ...c })),
  withdrawals:       mockWithdrawals.map(w => ({ ...w })),
  refunds:           mockRefunds.map(r => ({ ...r })),
  points_logs:      mockPointsLogs.map(p => ({ ...p })),
  favorites:         mockFavorites.map(f => ({ ...f })),
  footprints:        mockFootprints.map(f => ({ ...f })),
  product_reviews:   [],
  coupons:           mockCoupons.map(c => ({ ...c })),
  user_addresses:    mockAddresses.map(a => ({ ...a })),
}

// 根据表名获取主键字段名
function getPrimaryKey(table: string): string {
  if (table === 'profiles') return 'id'
  if (table === 'stores') return 'id'
  if (table === 'store_categories') return 'id'
  if (table === 'products') return 'id'
  if (table === 'cart_items') return 'id'
  if (table === 'orders') return 'id'
  if (table === 'order_items') return 'id'
  if (table === 'articles') return 'id'
  if (table === 'merchant_applications') return 'id'
  if (table === 'announcements') return 'id'
  if (table === 'commissions') return 'id'
  if (table === 'withdrawals') return 'id'
  if (table === 'refunds') return 'id'
  if (table === 'points_logs') return 'id'
  if (table === 'favorites') return 'id'
  if (table === 'footprints') return 'id'
  if (table === 'product_reviews') return 'id'
  if (table === 'coupons') return 'id'
  if (table === 'user_addresses') return 'id'
  return 'id'
}

// =====================
// Mock Auth（修复：支持 onAuthStateChange 回调）
// =====================
class MockAuth {
  private _session: any = null
  private _listeners: Array<(event: string, session: any) => void> = []

  // 通知所有监听器（修复核心：让 AuthContext 能感知登录状态变化）
  private _notify(event: string) {
    const session = this._session
    this._listeners.forEach(cb => {
      try { cb(event, session) } catch (e) { console.error('MockAuth listener error:', e) }
    })
  }

  async signInWithPassword(_params: { email: string; password: string }) {
    this._session = { user: mockUser, access_token: 'mock-token', refresh_token: 'mock-refresh' }
    this._notify('SIGNED_IN')
    return { data: { session: this._session }, error: null }
  }

  async signInWithOtp(_params: { phone: string }) {
    return { data: {}, error: null }
  }

  async verifyOtp(_params: { phone: string; token: string; type: string }) {
    this._session = { user: mockUser, access_token: 'mock-token', refresh_token: 'mock-refresh' }
    this._notify('SIGNED_IN')
    return { data: { session: this._session }, error: null }
  }

  async getUser() {
    return { data: { user: this._session?.user || null }, error: null }
  }

  async getSession() {
    return { data: { session: this._session }, error: null }
  }

  async signOut() {
    this._session = null
    this._notify('SIGNED_OUT')
    return { error: null }
  }

  // 修复：注册监听器 + 立即推送初始状态
  onAuthStateChange(cb: (event: string, session: any) => void) {
    this._listeners.push(cb)
    // 立即推送当前状态（模拟 Supabase 的行为）
    setTimeout(() => cb(this._session ? 'INITIAL_SESSION' : 'SIGNED_OUT', this._session), 0)
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this._listeners = this._listeners.filter(l => l !== cb)
          }
        }
      }
    }
  }
}

// =====================
// Mock Query Builder (thenable)
// =====================
class MockQueryBuilder {
  private table: string
  private filters: Array<{ key: string; op: string; value: any }> = []
  private sorts: Array<{ column: string; asc: boolean }> = []
  private _range: [number, number] | null = null
  private _limit: number | null = null
  private _single = false
  private _count: 'exact' | null = null
  private _head = false
  private _action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private _data: any = null
  private _upsertOpts: any = null

  then(resolve: Function, reject: Function) {
    return this.execute().then(data => {
      resolve({ data: data.data, error: data.error, count: data.count })
    }).catch(reject)
  }

  constructor(table: string) {
    this.table = table
  }

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }) {
    this._action = 'select'
    this._count = opts?.count || null
    this._head = opts?.head || false
    return this
  }

  eq(key: string, value: any) { this.filters.push({ key, op: 'eq', value }); return this }
  neq(key: string, value: any) { this.filters.push({ key, op: 'neq', value }); return this }
  ilike(key: string, value: string) { this.filters.push({ key, op: 'ilike', value }); return this }
  contains(key: string, value: any[]) { this.filters.push({ key, op: 'contains', value }); return this }
  overlaps(key: string, value: any[]) { this.filters.push({ key, op: 'overlaps', value }); return this }

  order(column: string, opts?: { ascending?: boolean }) {
    this.sorts.push({ column, asc: opts?.ascending ?? true })
    return this
  }

  range(from: number, to: number) { this._range = [from, to]; return this }
  limit(n: number) { this._limit = n; return this }
  maybeSingle() { this._single = true; return this }

  insert(data: any) { this._action = 'insert'; this._data = data; return this }
  update(data: any) { this._action = 'update'; this._data = data; return this }
  delete() { this._action = 'delete'; return this }
  upsert(data: any, opts?: any) { this._action = 'upsert'; this._data = data; this._upsertOpts = opts; return this }

  private getTableData(): any[] {
    return store[this.table] || []
  }

  private applyFilters(data: any[]): any[] {
    return data.filter(item => {
      return this.filters.every(f => {
        const val = item[f.key]
        switch (f.op) {
          case 'eq': return val === f.value
          case 'neq': return val !== f.value
          case 'ilike': {
            const s = String(val).toLowerCase()
            const q = String(f.value).replace(/%/g, '').toLowerCase()
            return s.includes(q)
          }
          case 'contains': return Array.isArray(val) && f.value.every((v: any) => val.includes(v))
          case 'overlaps': return Array.isArray(val) && val.some((v: any) => f.value.includes(v))
          default: return true
        }
      })
    })
  }

  async execute(): Promise<{ data: any; error: any; count?: number }> {
    // ═══ INSERT ═══
    if (this._action === 'insert') {
      const newId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const now = new Date().toISOString()
      let newItem: any = { id: newId, ...this._data, created_at: now }

      // 特殊表的逻辑
      if (this.table === 'orders') {
        newItem = {
          ...newItem,
          status: 'pending_pay',
          order_no: `MOCK${Date.now()}`,
        }
      }
      if (this.table === 'articles') {
        newItem = {
          ...newItem,
          user_id: mockUser.id,
          is_published: this._data?.is_published ?? (this._data?.status === 'published'),
        }
      }

      // 写入 store（核心修复：之前只处理了 cart_items / orders / articles）
      if (!store[this.table]) store[this.table] = []
      store[this.table].push(newItem)

      // 特殊表：同步到原来的 mock 数组（保持向后兼容）
      if (this.table === 'cart_items') mockCartItems.push(newItem)
      if (this.table === 'orders') mockOrders.push(newItem)
      if (this.table === 'articles') mockArticles.push(newItem)

      console.log(`[Mock] INSERT ${this.table}:`, newItem.id, newItem.name || '')
      return { data: this._single ? newItem : [newItem], error: null }
    }

    // ═══ UPDATE ═══
    if (this._action === 'update') {
      const tableData = this.getTableData()
      const matched = this.applyFilters(tableData)
      matched.forEach(item => {
        Object.assign(item, this._data, { updated_at: new Date().toISOString() })
      })
      console.log(`[Mock] UPDATE ${this.table}: ${matched.length} 条`, this._data)
      return { data: null, error: null }
    }

    // ═══ DELETE ═══
    if (this._action === 'delete') {
      const tableData = this.getTableData()
      const matched = this.applyFilters(tableData)
      const ids = matched.map(item => item[getPrimaryKey(this.table)])
      // 从 store 中移除
      if (store[this.table]) {
        store[this.table] = store[this.table].filter(
          (item: any) => !ids.includes(item[getPrimaryKey(this.table)])
        )
      }
      console.log(`[Mock] DELETE ${this.table}: ${matched.length} 条`, ids)
      return { data: null, error: null }
    }

    // ═══ UPSERT ═══
    if (this._action === 'upsert') {
      // 简化实现：先尝试 find，有则 update，无则 insert
      if (!store[this.table]) store[this.table] = []
      const pk = getPrimaryKey(this.table)
      const incoming = Array.isArray(this._data) ? this._data : [this._data]
      for (const row of incoming) {
        const idx = store[this.table].findIndex((item: any) => item[pk] === row[pk])
        if (idx >= 0) {
          Object.assign(store[this.table][idx], row, { updated_at: new Date().toISOString() })
        } else {
          store[this.table].push({ ...row, created_at: new Date().toISOString() })
        }
      }
      console.log(`[Mock] UPSERT ${this.table}: ${incoming.length} 条`)
      return { data: incoming, error: null }
    }

    // ═══ SELECT ═══
    let data = this.getTableData()

    // profiles 特殊处理：返回 store.profiles[0]（单个对象）
    if (this.table === 'profiles') {
      data = store.profiles
    }

    data = this.applyFilters(data)

    // 排序
    if (this.sorts.length > 0) {
      data.sort((a: any, b: any) => {
        for (const s of this.sorts) {
          const cmp = a[s.column] > b[s.column] ? 1 : a[s.column] < b[s.column] ? -1 : 0
          if (cmp !== 0) return s.asc ? cmp : -cmp
        }
        return 0
      })
    }

    const totalCount = data.length

    if (this._head) return { data: null, error: null, count: totalCount }

    // 分页
    if (this._range) {
      data = data.slice(this._range[0], this._range[1] + 1)
    } else if (this._limit) {
      data = data.slice(0, this._limit)
    }

    if (this._single) return { data: data[0] || null, error: null }
    if (this._count === 'exact') return { data, error: null, count: totalCount }

    return { data, error: null }
  }
}

// =====================
// Mock Supabase Client
// =====================
export const mockSupabase = {
  auth: new MockAuth(),
  // Edge Functions Mock：根据函数名返回对应结构的数据
  functions: {
    invoke: async (name: string, opts?: any) => {
      const body = opts?.body || {}
      switch (name) {
        case 'create-order': {
          const orderId = `mock-order-${Date.now()}`
          const orderNo = `MO${Date.now().toString(36).toUpperCase()}`
          const total = body.total_amount || 0
          const payMode = body.pay_mode || 'wxpay'
          const referrerId = body.referrer_id || null
          const newOrder = {
            id: orderId, order_no: orderNo, status: 'pending_pay',
            total_amount: total, pay_mode: payMode,
            referrer_id: referrerId, commission_distributed: false,
            user_id: mockUser.id,
            created_at: new Date().toISOString(),
          }
          mockOrders.push(newOrder as any)

          // 模拟佣金计算（如果有推荐人）
          if (referrerId) {
            // 一级推荐：2.25%
            const l1Amount = Math.round(total * 0.0225 * 100) / 100
            mockCommissions.push({
              id: `comm-mock-${Date.now()}-1`,
              order_id: orderId, order_no: orderNo,
              beneficiary_id: referrerId, payer_id: mockUser.id,
              level: 1, rank_at_time: mockProfile.member_rank,
              ratio: 0.0225, pool_amount: total, commission_amount: l1Amount,
              b_coef: 1.0, status: 'pending', settle_at: null,
              created_at: new Date().toISOString(),
            } as any)
            // 二级推荐：0.5%
            const l2Profile = mockProfile.referrer_id ? { id: mockProfile.referrer_id } : null
            if (l2Profile) {
              const l2Amount = Math.round(total * 0.005 * 100) / 100
              mockCommissions.push({
                id: `comm-mock-${Date.now()}-2`,
                order_id: orderId, order_no: orderNo,
                beneficiary_id: l2Profile.id, payer_id: mockUser.id,
                level: 2, rank_at_time: '外门弟子',
                ratio: 0.005, pool_amount: total, commission_amount: l2Amount,
                b_coef: 1.0, status: 'pending', settle_at: null,
                created_at: new Date().toISOString(),
              } as any)
            }
          }

          // 模拟积分发放（消费金额的 1%，最低 1 积分）
          const pointsEarned = Math.max(1, Math.floor(total * 0.01))
          const oldPoints = mockProfile.points || 0
          mockProfile.points = oldPoints + pointsEarned
          mockPointsLogs.push({
            id: `pl-mock-${Date.now()}`,
            user_id: mockUser.id, order_id: orderId,
            type: 'purchase_earn', delta: pointsEarned,
            balance_after: mockProfile.points,
            remark: `购物奖励积分（订单 ${orderNo}）`,
            created_at: new Date().toISOString(),
          } as any)

          console.log(`[Mock] create-order: 佣金已计算，积分 +${pointsEarned}`)
          return {
            data: {
              success: true, order: newOrder,
              wxpay_amount: body.wxpay_amount || total,
              gold_beans_used: body.gold_beans_to_use || 0,
              pay_mode: payMode,
              points_earned: pointsEarned,
            },
            error: null,
          }
        }
        case 'create-wechat-payment':
          return { data: { success: true, paymentParams: { timeStamp: String(Math.floor(Date.now() / 1000)), nonceStr: 'mocknonce', package: 'prepay_id=mock', signType: 'RSA', paySign: 'mocksign' } }, error: null }
        case 'get-wechat-openid':
          return { data: { success: true, openid: 'mock-openid-pay-' + Math.random().toString(36).slice(2, 8) }, error: null }
        case 'refund-order':
          return { data: { success: true, refund_id: 'mock-refund-' + Date.now() }, error: null }
        case 'generate-qrcode':
          return { data: { success: true, url: 'https://picsum.photos/seed/qrcode/200/200' }, error: null }
        case 'bind_referrer': {
          // 实现推荐关系绑定：根据 referral_code 找到推荐人，写入当前用户 profile
          const code = (body as any).referral_code || (body as any).ref || ''
          // 模拟：如果 code === 'ABC123'（mockProfile 的 referral_code），则绑定成功
          if (code && mockProfile.referral_code && code === mockProfile.referral_code) {
            // 自己不能推荐自己，忽略
            console.log('[Mock] bind_referrer: 不能绑定自己的推荐码', code)
          } else if (code) {
            // 模拟绑定成功：设置 referrer_id 为某个模拟用户
            mockProfile.referrer_id = '00000000-0000-0000-0000-000000000002'
            console.log('[Mock] bind_referrer: 绑定成功，referrer_id =', mockProfile.referrer_id)
          }
          return { data: { success: true, bound: !!code }, error: null }
        }
        case 'article-fetch':
          // 模拟链接导入文章提取
          const url = body.url || ''
          const mockTitle = url.includes('mp.weixin')
            ? '微信公众号好文分享'
            : url.includes('zhihu')
              ? '知乎热门回答'
              : url.includes('xiaohongshu')
                ? '小红书种草笔记'
                : '导入的好文章'
          const mockContent = `通过链接「${url.slice(0, 60)}${url.length > 60 ? '...' : ''}」导入的内容\n\n这是一篇从外部平台导入的文章，内容已自动提取。你可以在此基础上进行编辑和创作，加入自己的见解和体验。\n\n---\n\n（此处显示原文主要内容，实际使用时会根据链接动态提取完整内容）`
          return { data: { title: mockTitle, content: mockContent }, error: null }
        default:
          console.warn('[Mock] Unhandled Edge Function:', name)
          return { data: { success: true }, error: null }
      }
    },
  },

  from(table: string) {
    return new MockQueryBuilder(table)
  },

  rpc(name: string, params?: any) {
    if (name === 'bind_referrer') {
      const code = params?.referral_code || params?.ref || ''
      if (code && mockProfile.referral_code && code !== mockProfile.referral_code) {
        // 模拟：找到推荐人（用 mockProfile2 模拟）
        mockProfile.referrer_id = '00000000-0000-0000-0000-000000000002'
        console.log('[Mock RPC] bind_referrer: 绑定成功，referrer_id =', mockProfile.referrer_id)
      }
      return {
        then(resolve: Function) { resolve({ data: { success: true }, error: null }) }
      }
    }
    return {
      then(resolve: Function) { resolve({ data: null, error: null }) }
    }
  }
} as any
