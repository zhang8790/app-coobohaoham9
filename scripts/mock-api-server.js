const http = require('http')
const url = require('url')

// =========== Mock 数据 ===========
const MOCK_DATA = {
  profiles: [
    { id: 'usr_001', nickname: '张无忌', phone: '13800138001', role: 'user', member_rank: '江湖散修', points: 120, balance: 50.00, merchant_status: 'none', created_at: '2026-01-15T10:00:00Z' },
    { id: 'usr_002', nickname: '杨过', phone: '13800138002', role: 'user', member_rank: '外门弟子', points: 350, balance: 120.50, merchant_status: 'approved', created_at: '2026-02-20T14:30:00Z' },
    { id: 'usr_003', nickname: '小龙女', phone: '13800138003', role: 'admin', member_rank: '掌门', points: 9999, balance: 5000.00, merchant_status: 'none', created_at: '2026-01-01T08:00:00Z' },
  ],
  merchant_applications: [
    { id: 'mapp_001', user_id: 'usr_002', store_name: '霸王茶姬（旗舰店）', contact_name: '杨过', contact_phone: '13800138002', business_type: '餐饮', status: 'pending', reject_reason: null, created_at: '2026-06-25T10:00:00Z' },
    { id: 'mapp_002', user_id: 'usr_001', store_name: '瑞幸咖啡（科技园店）', contact_name: '张无忌', contact_phone: '13800138001', business_type: '餐饮', status: 'approved', reject_reason: null, created_at: '2026-06-20T14:30:00Z' },
    { id: 'mapp_003', user_id: 'usr_003', store_name: '名创优品（万达店）', contact_name: '小龙女', contact_phone: '13800138003', business_type: '零售', status: 'pending', reject_reason: null, created_at: '2026-06-28T09:00:00Z' },
  ],
  stores: [
    { id: 'store_001', owner_id: 'usr_002', name: '霸王茶姬（旗舰店）', description: '正宗奶茶，口感醇厚', address: '深圳市南山区科技园', phone: '0755-12345678', category: '餐饮', image_url: null, banner_url: null, rating: 4.8, is_active: true, short_code: 'WC001', created_at: '2026-06-21T10:00:00Z' },
  ],
  products: [
    { id: 'prod_001', store_id: 'store_001', category_id: null, name: '伯牙绝弦', description: '招牌奶茶，香甜可口', price: 18.00, original_price: 22.00, image_url: null, stock: 100, barcode: '6931234567890', mood_tags: ['开心', '放松'], scene_tags: ['下午茶', '聚会'], is_active: true, review_status: 'approved', created_at: '2026-06-22T10:00:00Z' },
    { id: 'prod_002', store_id: 'store_001', category_id: null, name: '茉莉雪芽', description: '清新茉莉，回甘悠长', price: 16.00, original_price: 20.00, image_url: null, stock: 80, barcode: '6931234567891', mood_tags: ['清新', '提神'], scene_tags: ['上班', '学习'], is_active: true, review_status: 'pending', created_at: '2026-06-26T14:00:00Z' },
  ],
  orders: [
    { id: 'order_001', order_no: 'LD202606300001', user_id: 'usr_001', store_id: 'store_001', total_amount: 36.00, gold_beans_used: 0, status: 'completed', payment_method: 'wxpay', created_at: '2026-06-28T15:30:00Z' },
  ],
  withdrawals: [
    { id: 'wd_001', user_id: 'usr_002', amount: 200.00, status: 'pending', withdraw_method: 'wechat', bank_name: null, bank_account: null, bank_holder: null, alipay_account: null, reject_reason: null, created_at: '2026-06-27T10:00:00Z' },
  ],
  articles: [
    { id: 'art_001', user_id: 'usr_001', title: '霸王茶姬新品体验', content: '今天尝试了伯牙绝弦，口感真的很棒！', is_published: true, created_at: '2026-06-26T10:00:00Z' },
  ],
  announcements: [
    { id: 'ann_001', content: '欢迎来到来店有喜！', is_active: true, sort_order: 1, created_at: '2026-06-01T10:00:00Z' },
  ],
  refunds: [
    { id: 'ref_001', order_id: 'order_001', user_id: 'usr_001', amount: 36.00, status: 'pending', reason: '商品质量问题', created_at: '2026-06-29T10:00:00Z' },
  ],
}

// =========== 工具函数 ===========
function parseBody(req) {
  return new Promise(resolve => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) }
      catch { resolve({}) }
    })
  })
}

function respond(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
  })
  res.end(JSON.stringify(data))
}

// =========== 主服务器 ===========
const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true)
  const method = req.method || 'GET'

  // CORS 预检
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
    })
    res.end()
    return
  }

  console.log(`[${new Date().toLocaleTimeString()}] ${method} ${pathname}`)

  // 解析路径：/rest/v1/{table}
  const match = pathname.match(/^\/rest\/v1\/(\w+)/)
  if (!match) {
    respond(res, 404, { error: 'Not found', path: pathname })
    return
  }

  const tableName = match[1]
  const tableData = MOCK_DATA[tableName]

  if (!tableData) {
    respond(res, 404, { error: `Table ${tableName} not found` })
    return
  }

  try {
    if (method === 'GET') {
      let data = [...tableData]

      // 简单过滤（支持 eq. 语法）
      Object.keys(query).forEach(key => {
        if (['select', 'order', 'limit', 'offset', 'count'].includes(key)) return
        if (key === 'id') {
          data = data.filter(row => row.id === query[key])
          return
        }
        const value = query[key]
        if (typeof value === 'string' && value.startsWith('eq.')) {
          const eqValue = value.replace('eq.', '')
          data = data.filter(row => String(row[key]) === eqValue)
        }
      })

      // 排序
      if (query.order) {
        const orderBy = query.order.replace('.', '')
        const ascending = query.order.includes('asc')
        data.sort((a, b) => {
          if (ascending) return a[orderBy] > b[orderBy] ? 1 : -1
          return a[orderBy] < b[orderBy] ? 1 : -1
        })
      }

      // 分页
      const limit = parseInt(query.limit) || data.length
      const offset = parseInt(query.offset) || 0
      const total = data.length
      data = data.slice(offset, offset + limit)

      // 响应
      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
      if (query.count) {
        headers['Content-Range'] = `${offset}-${offset + data.length - 1}/${total}`
      }

      res.writeHead(200, headers)
      res.end(JSON.stringify(data))

    } else if (method === 'POST') {
      const body = await parseBody(req)
      const newRow = { id: `${tableName}_${Date.now()}`, ...body, created_at: new Date().toISOString() }
      tableData.push(newRow)
      respond(res, 201, newRow)

    } else if (method === 'PATCH') {
      const body = await parseBody(req)
      const id = pathname.split('/').pop()
      const index = tableData.findIndex(row => row.id === id)
      if (index >= 0) {
        tableData[index] = { ...tableData[index], ...body, updated_at: new Date().toISOString() }
        respond(res, 200, tableData[index])
      } else {
        respond(res, 404, { error: 'Not found' })
      }

    } else if (method === 'DELETE') {
      const id = pathname.split('/').pop()
      const index = tableData.findIndex(row => row.id === id)
      if (index >= 0) {
        tableData.splice(index, 1)
        respond(res, 204, null)
      } else {
        respond(res, 404, { error: 'Not found' })
      }

    } else {
      respond(res, 405, { error: 'Method not allowed' })
    }
  } catch (e) {
    respond(res, 500, { error: e.message })
  }
})

const PORT = 54321
server.listen(PORT, () => {
  console.log('\n🚀 Local Mock API Server 已启动！')
  console.log(`   URL: http://localhost:${PORT}`)
  console.log(`\n📊 Mock 数据已加载：`)
  Object.entries(MOCK_DATA).forEach(([table, data]) => {
    console.log(`   - ${table}: ${data.length} 条记录`)
  })
  console.log(`\n💡 使用方法：`)
  console.log(`   1. 修改 admin-web/.env 中的 VITE_SUPABASE_URL=http://localhost:${PORT}`)
  console.log(`   2. 重启 dev server: cd admin-web && pnpm dev`)
  console.log(`   3. 管理后台将使用本地 Mock API（无需连接真实后端）\n`)
})
