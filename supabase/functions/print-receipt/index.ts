// print-receipt Edge Function
// ------------------------------------------------------------
// 门店订单小票云打印：读取门店打印机配置(printer_configs) + 订单(orders/order_items) +
// 门店(stores)，渲染 ESC/POS 文本，调用云打印服务商 API（飞鹅 / 易联云）。
//
// 设计要点：
//   - 全程 SUPABASE_SERVICE_ROLE_KEY，不受 RLS 限制（密钥不进前端）。
//   - 支持 test 模式：不依赖真实订单，生成示例小票，供商家校验格式/设备连通性。
//   - 防滥用：真实打印需合法 order_id（UUID 难猜）；test 需该 store 已存在 enabled 配置。
//   - 飞鹅为主实现（国内最成熟）；易联云 V2 开放平台 OAuth（签名=md5(client_id+timestamp+client_secret)）；365 暂未实现。
//
// 触发：
//   真实打印：supabase.functions.invoke('print-receipt', { body: { order_id } })
//   测试打印：supabase.functions.invoke('print-receipt', { body: { test: true, store_id } })

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: any, status = 200, headers = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

// ===== 标准 MD5（飞鹅/易联云签名用）=====
// 注意：签名输入都是纯 ASCII 字符串，必须按单字节（UTF-8 对 ASCII = 每字符1字节）
// 编码，不能用 UTF-16LE（每字符2字节）。否则与 Python hashlib.md5 结果不一致。
function md5(input: string): string {
  // 纯 ASCII → 每字符一个字节（与 Python hashlib.md5(s.encode('utf-8')) 一致）
  const msgBytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    msgBytes.push(input.charCodeAt(i) & 0xff)
  }
  // MD5 padding
  const len = msgBytes.length
  msgBytes.push(0x80)
  while (msgBytes.length % 64 !== 56) msgBytes.push(0)
  const bitLen = len * 8
  const lo = bitLen >>> 0
  const hi = Math.floor(bitLen / 0x100000000)
  msgBytes.push(lo & 0xff, (lo >>> 8) & 0xff, (lo >>> 16) & 0xff, (lo >>> 24) & 0xff)
  msgBytes.push(hi & 0xff, (hi >>> 8) & 0xff, (hi >>> 16) & 0xff, (hi >>> 24) & 0xff)

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476
  const s = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const K: number[] = []
  for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0)
  const rol = (x: number, n: number) => (x << n) | (x >>> (32 - n))
  const add = (x: number, y: number) => {
    const l = (x & 0xffff) + (y & 0xffff)
    const h = (x >> 16) + (y >> 16) + (l >> 16)
    return (h << 16) | (l & 0xffff)
  }
  for (let i = 0; i < msgBytes.length; i += 64) {
    const M: number[] = []
    for (let j = 0; j < 16; j++) {
      const k = i + j * 4
      M[j] = msgBytes[k] | (msgBytes[k + 1] << 8) | (msgBytes[k + 2] << 16) | (msgBytes[k + 3] << 24)
    }
    let A = a, B = b, C = c, D = d
    let F = 0, g = 0
    for (let r = 0; r < 64; r++) {
      if (r < 16) { F = (B & C) | (~B & D); g = r }
      else if (r < 32) { F = (D & B) | (~D & C); g = (5 * r + 1) % 16 }
      else if (r < 48) { F = B ^ C ^ D; g = (3 * r + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * r) % 16 }
      const temp = D
      D = C; C = B
      B = add(B, rol(add(add(A, F), add(K[r], M[g])), s[Math.floor(r / 16) * 4 + (r % 4)]))
      A = temp
    }
    a = add(a, A); b = add(b, B); c = add(c, C); d = add(d, D)
  }
  const toHex = (n: number) => {
    let hex = ''
    for (let i = 0; i < 4; i++) hex += ('0' + ((n >>> (i * 8)) & 0xff).toString(16)).slice(-2)
    return hex
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d)
}

function money(n: number): string {
  return '¥' + (Math.round(n * 100) / 100).toFixed(2)
}

// 把时间转中国标准时间(UTC+8)，格式 YYYY-MM-DD HH:MM:SS
function parseToUTCms(iso: string): number | null {
  const s = iso.trim()
  const hasTZ = /[Zz]$/.test(s) || /[+-]\d{2}(:?\d{2})?$/.test(s)
  if (hasTZ) {
    // 带时区后缀：先让引擎原生解析（能正确处理 Z / +08:00 等）
    let d = new Date(s)
    if (!isNaN(d.getTime())) return d.getTime()
    // 引擎拒绝（如 +00 无冒号）：去掉时区后缀当 UTC 重试
    const cleaned = s.replace(/[Zz]$/, '').replace(/[+-]\d{2}(:?\d{2})?$/, '')
    d = new Date(cleaned + 'Z')
    if (!isNaN(d.getTime())) return d.getTime()
    return null
  }
  // 无时区：一律当 UTC
  const d = new Date(s + 'Z')
  if (!isNaN(d.getTime())) return d.getTime()
  return null
}
function formatCST(iso?: string): string {
  if (!iso) return '-'
  const ms = parseToUTCms(String(iso).trim())
  if (ms == null) return String(iso).slice(0, 19).replace('T', ' ')
  // 绝对时间 +8h 得到 CST，再用 UTC 字段读（避免运行时本地时区干扰）
  const d = new Date(ms + 8 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

// ===== 渲染小票内容（易联云 K4 指令集）=====
// 易联云标签参考：https://www.kancloud.cn/ly6886/oauth-api/3170342
// <CA>居中 <FB>加粗 <FS>大字 <QR>二维码 <MK>2 全切纸
// 换行用 \n（<BR>在易联云里是EAN13条形码指令！）
function renderReceipt(store: any, order: any, items: any[]): string {
  const lines: string[] = []
  const name = (store?.name || '来电有喜').slice(0, 18)

  // 订单类型横幅：配送单 / 到店自提 / 堂食（一眼区分，无需逐个翻开）
  const st = order?.service_type
  let typeLabel = ''
  if (st === 'delivery') typeLabel = '【配送单】'
  else if (st === 'self_pickup') typeLabel = '【到店自提】'
  else if (st === 'dine_in') typeLabel = '【堂食】'
  if (typeLabel) {
    lines.push('<FS><FB><CA>' + typeLabel + '</CA></FB></FS>\n')
  }

  // 标题居中加大
  lines.push('<FS><CA>' + name + '</CA></FS>\n')
  lines.push('<CA>— 订单小票 —</CA>\n')
  if (store?.address) lines.push('<CA>' + String(store.address).slice(0, 24) + '</CA>\n')
  if (store?.phone) lines.push('<CA>电话：' + String(store.phone) + '</CA>\n')
  lines.push('--------------------------------\n')
  lines.push('订单号：' + (order?.order_no || '-') + '\n')
  lines.push('时间：' + formatCST(order?.created_at) + '\n')
  if (order?.payment_method) {
    // 友好显示支付方式
    const pm = String(order.payment_method)
    const pmLabel = pm === 'emotion_beans' ? '金豆' : pm === 'wechat' ? '微信支付' : pm === 'alipay' ? '支付宝' : pm
    lines.push('支付方式：' + pmLabel + '\n')
  }
  lines.push('--------------------------------\n')

  // 配送订单：打印完整收货信息（下单时已拼成「姓名 电话 省市区详细地址」）
  if (st === 'delivery' && order?.shipping_address) {
    lines.push('<FB>收货信息：</FB>\n')
    lines.push(String(order.shipping_address) + '\n')
    lines.push('--------------------------------\n')
  }

  let total = 0
  for (const it of items || []) {
    const qty = Number(it.quantity) || 0
    const price = Number(it.price) || 0
    total += qty * price
    const pname = String(it.product_name || '商品').slice(0, 14)
    // 商品名左对齐，金额右对齐
    const amt = money(qty * price)
    lines.push(pname + ' x' + qty + '\n')
    lines.push('<RA>' + amt + '</RA>\n')
  }
  lines.push('--------------------------------\n')
  // 合计加粗居中
  lines.push('<CA><FB>合计：' + money(total) + '</FB></CA>\n')

  // 备注（如有）
  if (order?.remark) {
    lines.push('备注：' + String(order.remark) + '\n')
  }
  lines.push('\n')
  if (order?.order_no) lines.push('<QR>' + String(order.order_no) + '</QR>\n')
  lines.push('<CA>谢谢惠顾，欢迎再次光临</CA>\n')
  lines.push('<MK>2</MK>')
  return lines.join('')
}

// ===== 飞鹅打印 =====
async function printFeie(cfg: any, content: string): Promise<{ ok: boolean; msg: string }> {
  const url = 'https://api.feieyun.com/Api/Open/'
  const stime = Math.floor(Date.now() / 1000).toString()
  const sig = md5(cfg.api_user + cfg.api_key + stime)
  const form = new URLSearchParams()
  form.set('user', cfg.api_user)
  form.set('stime', stime)
  form.set('sig', sig)
  form.set('apiname', 'Open_printMsg')
  form.set('sn', cfg.device_sn)
  form.set('content', content)
  form.set('times', '1')
  try {
    const r = await fetch(url, { method: 'POST', body: form })
    const j = await r.json().catch(() => ({}))
    // 飞鹅：ret===0 成功
    if (j && (j.ret === 0 || j.ret === '0')) return { ok: true, msg: j.msg || 'ok' }
    return { ok: false, msg: j?.msg || ('HTTP ' + r.status) }
  } catch (e: any) {
    return { ok: false, msg: e?.message ?? String(e) }
  }
}

// ===== 易联云打印（V2 开放平台 OAuth）=====
// 签名算法（官方 SDK 源码确认）: md5(client_id + timestamp + client_secret)
// OAuth 端点: https://open-api.10ss.net/oauth/oauth
// 打印端点: https://open-api.10ss.net/print/index
// 必传参数: id(UUID), scope=all(OAuth), sign, timestamp
// client_secret 不作为请求参数发送，仅参与签名
async function printYilianyun(cfg: any, content: string, originId: string): Promise<{ ok: boolean; msg: string }> {
  const clientId = cfg.api_user   // 应用ID
  const clientSecret = cfg.api_key  // 应用密钥（仅签名用，不进请求体）
  const machineCode = cfg.device_sn

  // 生成 UUID（请求幂等标识）
  function uuid(): string {
    return crypto.randomUUID()
  }

  try {
    // 1. 获取 access_token
    const ts1 = Math.floor(Date.now() / 1000).toString()
    const id1 = uuid()
    const sign1 = md5(clientId + ts1 + clientSecret)  // 官方 SDK 算法：三个值直接拼

    const oauthForm = new URLSearchParams()
    oauthForm.set('client_id', clientId)
    oauthForm.set('timestamp', ts1)
    oauthForm.set('grant_type', 'client_credentials')
    oauthForm.set('scope', 'all')
    oauthForm.set('sign', sign1)
    oauthForm.set('id', id1)

    const tRes = await fetch('https://open-api.10ss.net/oauth/oauth', {
      method: 'POST',
      body: oauthForm,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    })
    const tJson = await tRes.json().catch(() => ({}))
    if (tJson?.error !== '0' && tJson?.error !== 0) {
      return { ok: false, msg: '易联云获取 token 失败: ' + (tJson?.error_description || JSON.stringify(tJson)) }
    }
    const token = tJson?.body?.access_token
    if (!token) return { ok: false, msg: '易联云 token 为空: ' + JSON.stringify(tJson) }

    // 2. 打印小票
    const ts2 = Math.floor(Date.now() / 1000).toString()
    const id2 = uuid()
    const sign2 = md5(clientId + ts2 + clientSecret)  // 同样算法

    const printForm = new URLSearchParams()
    printForm.set('client_id', clientId)
    printForm.set('access_token', token)
    printForm.set('machine_code', machineCode)
    printForm.set('content', content)
    printForm.set('origin_id', originId)
    printForm.set('sign', sign2)
    printForm.set('id', id2)
    printForm.set('timestamp', ts2)

    const pRes = await fetch('https://open-api.10ss.net/print/index', {
      method: 'POST',
      body: printForm,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    })
    const pJson = await pRes.json().catch(() => ({}))
    if (pJson && (pJson.error === '0' || pJson.error === 0)) {
      return { ok: true, msg: pJson?.error_description || 'ok' }
    }
    return { ok: false, msg: pJson?.error_description || JSON.stringify(pJson) || ('HTTP ' + pRes.status) }
  } catch (e: any) {
    return { ok: false, msg: e?.message ?? String(e) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json().catch(() => ({}))
    const isTest = body.test === true
    const orderId: string | undefined = body.order_id
    const storeId: string | undefined = body.store_id

    if (!isTest && !orderId) {
      return json({ success: false, error: '缺少 order_id 或 test 参数' }, 400)
    }
    if (isTest && !storeId) {
      return json({ success: false, error: '测试打印缺少 store_id' }, 400)
    }

    // 解析目标 store + 订单数据
    let targetStoreId: string
    let order: any = null
    let items: any[] = []
    let store: any = null

    if (isTest) {
      targetStoreId = storeId!
      const { data: s } = await supabase.from('stores').select('*').eq('id', targetStoreId).maybeSingle()
      store = s
      order = {
        order_no: 'TEST' + Date.now(),
        created_at: new Date().toISOString(),
        payment_method: '测试',
      }
      // 测试小票用通用占位商品（非真实数据，仅供验证设备/格式）
      items = [
        { product_name: '【测试】精选礼品', quantity: 1, price: 99.0 },
        { product_name: '【测试】手作礼盒', quantity: 2, price: 39.5 },
        { product_name: '【测试】定制包装', quantity: 1, price: 15.0 },
      ]
    } else {
      const { data: o, error: oErr } = await supabase
        .from('orders')
        .select('id, order_no, status, total_amount, created_at, payment_method, store_id, service_type, shipping_address, remark')
        .eq('id', orderId)
        .maybeSingle()
      if (oErr) throw new Error('读取订单失败: ' + oErr.message)
      if (!o) return json({ success: false, error: '订单不存在' }, 404)
      order = o
      targetStoreId = o.store_id
      const { data: oi } = await supabase
        .from('order_items')
        .select('product_name, quantity, price')
        .eq('order_id', orderId)
      items = oi || []
      const { data: s } = await supabase.from('stores').select('*').eq('id', targetStoreId).maybeSingle()
      store = s
    }

    // 读取打印机配置
    const { data: cfgRows, error: cErr } = await supabase
      .from('printer_configs')
      .select('*')
      .eq('store_id', targetStoreId)
      .eq('enabled', true)
      .limit(1)
    if (cErr) throw new Error('读取打印机配置失败: ' + cErr.message)
    const cfg = (cfgRows || [])[0]
    if (!cfg) {
      return json({ success: false, error: '该门店未配置已启用的打印机', need_config: true }, 200)
    }

    const content = renderReceipt(store, order, items)
    let result: { ok: boolean; msg: string }
    if (cfg.provider === 'feie') {
      result = await printFeie(cfg, content)
    } else if (cfg.provider === 'yilianyun') {
      result = await printYilianyun(cfg, content, order.order_no || orderId || Date.now().toString())
    } else {
      return json({ success: false, error: '暂不支持的打印机服务商: ' + cfg.provider }, 200)
    }

    if (!result.ok) {
      return json({ success: false, error: '打印推送失败: ' + result.msg }, 200)
    }

    // 真实打印才更新计数（test 不污染数据）
    if (!isTest) {
      await supabase
        .from('printer_configs')
        .update({ print_count: (cfg.print_count || 0) + 1, last_print_at: new Date().toISOString() })
        .eq('id', cfg.id)
    }

    return json({
      success: true,
      test: isTest,
      provider: cfg.provider,
      device_sn: cfg.device_sn,
      message: isTest ? '测试小票已推送，请查看打印机出纸' : '小票已推送打印',
    })
  } catch (e: any) {
    console.error('[print-receipt] 失败:', e)
    return json({ success: false, error: e?.message ?? String(e) }, 500)
  }
})
