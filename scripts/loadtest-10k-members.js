// ============================================================================
// 来电有喜 · 1万会员并发承压压测脚本 (k6)
// ----------------------------------------------------------------------------
// ⚠️ 安全红线：禁止在生产高峰直接运行！仅用于【预发/测试环境】做容量评估。
//    默认 BASE 指向生产项目是为了方便复制修改；正式压测请务必改用预发库：
//    k6 run -e SUPABASE_URL=https://你的预发项目.supabase.co -e ANON_KEY=xxx scripts/loadtest-10k-members.js
//
// 评估目标：验证「1万会员同时在线」时读路径(商品/门店列表)与写路径(下单触发分佣异步)
//          在连接池 / 缓存 / RLS 下的 p95 延迟、错误率、是否出现连接耗尽/队列堆积。
//
// 前置：npm i -g k6  或  docker run grafana/k6
// ============================================================================

import http from 'k6/http'
import { check, sleep } from 'k6'

// ── 配置(用环境变量覆盖，避免硬编码打错库) ───────────────────────────────
const BASE = __ENV.SUPABASE_URL || 'https://pyqgsxcjmijtbstwthbn.supabase.co'
// 项目的 anon key(公开发布用，仅 RL 受控读)；写路径需另填测试账号 token
const ANON = __ENV.ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqaWl0YnN0d3RoYm4iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc0MjU2MDc3MywiZXhwIjoyMDU4MTM2NzczfQ.MHdJx4XjIMhSU_OJte0WjG1H2-jYO_0seFGMH0HRHc4'
const STORE_ID = __ENV.STORE_ID || 'ffffffff-ffff-ffff-ffff-ffffffffffff' // 来电有喜官方店
const USER_TOKEN = __ENV.USER_TOKEN || '' // 写路径：填一个预发测试账号的 JWT；为空则跳过写压测

const headers = {
  'apikey': ANON,
  'Authorization': `Bearer ${ANON}`,
  'Content-Type': 'application/json',
}

// ── 场景：读多写少(贴近小程序真实模型) ───────────────────────────────────
export const options = {
  scenarios: {
    // 读路径：模拟会员刷列表 / 切门店 / 定位，阶梯冲到 1万 VU
    read_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 1000 },
        { duration: '3m', target: 5000 },
        { duration: '5m', target: 10000 },
        { duration: '2m', target: 10000 }, // 稳态保持 1万
        { duration: '1m', target: 0 },
      ],
      exec: 'readPath',
    },
    // 写路径：模拟下单(触发分佣异步)，量级远低于读
    write_light: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 0 },
      ],
      exec: 'writePath',
    },
    // LLM 路径：4 个 AI Edge Function 并发压测(验证 P2 限流层)。
    // ⚠️⚠️⚠️ 真调 LLM、按量计费！VU 刻意压低 + 每次循环 sleep 3s，避免成本爆炸。
    //    验证目标：高并发下 llmGuard 并发信号量(≤6) 是否把速率限制打平、429 是否趋零、
    //    LLM 调用 p95 延迟是否平稳(不无限堆积)。务必在【预发 + LLM 配置隔离】后运行！
    llm_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      exec: 'llmPath',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],   // 95% 请求 < 800ms 视为健康
    http_req_failed: ['rate<0.01'],     // 错误率 < 1%
    // LLM 本身慢(含限流排队/重试)，放宽到 6s；重点看它是否平稳而非无限堆积
    'http_req_duration{name:llm_call}': ['p(95)<6000'],
    'http_req_failed{name:llm_call}': ['rate<0.02'],
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],   // 95% 请求 < 800ms 视为健康
    http_req_failed: ['rate<0.01'],     // 错误率 < 1%
  },
  // 把每个 URL 打点，方便在 Grafana 看哪条最慢
  summaryTrendStats: ['avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

// ── 读路径：商品列表(命中前端缓存层) + 门店列表(全表拉，重点观察) ──────────
export function readPath() {
  // 1) 商品列表 —— getProducts 走 cacheGet 缓存，正常情况下 DB 命中率低
  const p = http.get(
    `${BASE}/rest/v1/products?select=id,name,price,store_id&store_id=eq.${STORE_ID}&is_active=eq.true&order=created_at.desc&limit=20`,
    { headers, tags: { name: 'products_list' } }
  )
  check(p, { 'products 200': (r) => r.status === 200 })

  sleep(0.3)

  // 2) 门店列表 —— getNearestStores 是 select 全表 + 客户端算距离，无缓存
  //    重点观察：1万并发下这条是否会因连接池/全表扫描变慢
  const s = http.get(
    `${BASE}/rest/v1/stores?select=id,name,lat,lng,is_active&is_active=eq.true&limit=300`,
    { headers, tags: { name: 'stores_list' } }
  )
  check(s, { 'stores 200': (r) => r.status === 200 })

  sleep(0.7)
}

// ── 写路径：造测试订单触发分佣异步(pg_net -> distribute-commission) ────────
// 注意：需要 USER_TOKEN(预发测试账号 JWT)。RLS 下 anon 不能插 orders，留空跳过。
export function writePath() {
  if (!USER_TOKEN) {
    sleep(1)
    return
  }
  const tHeaders = { ...headers, Authorization: `Bearer ${USER_TOKEN}` }
  // 仅造最小订单用于压测分佣链路；预发库请定期清理这些测试订单
  const payload = JSON.stringify({
    store_id: STORE_ID,
    total_amount: 0.01,
    payment_method: 'emotion_beans',
    commission_distributed: false,
    // ... 其余必填字段按预发表结构补
  })
  const r = http.post(`${BASE}/rest/v1/orders`, payload, {
    headers: tHeaders,
    tags: { name: 'create_order' },
  })
  check(r, { 'order created or rejected(4xx/5xx 均记录)': (x) => x.status > 0 })
  sleep(1)
}

// ── LLM 路径：4 个 AI Edge Function 并发压测(验证 P2 llmGuard 限流层) ───────
// ⚠️ 真调 LLM、按量计费。VU 峰值仅 100 且每轮 sleep 3s，纯为观察限流效果，不是盲打。
//    端点为 verify_jwt=false 的 Edge Function，匿名(apikey 头)即可触发。
const EF = `${BASE}/functions/v1`
const llmPayloads = {
  // 走完整 LLM 识别(不带 test 字段，否则只探活)
  'product-analyze': { name: '压测商品_零食', manualIngredients: ['白砂糖', '食用盐', '植物油'] },
  // 情绪编译
  'emotion-compile': { mode: 'compile', name: '压测商品', description: '一款儿童爱吃的健康零食', category: 'snack' },
  // 食疗文案(直接用 body 字段拼 ctx，最稳触发 LLM，不依赖查库)
  'food-therapy-ai': { mode: 'copy', name: '压测商品', short_sales_word: '营养好吃', nature: '平', health_tags: ['健脾'], emotion_tags: ['愉悦'] },
  // 跑全量待处理批次，逐批调 LLM；用 storeId 过滤缩小影响面
  'expiry-engine': {},
}
const efNames = Object.keys(llmPayloads)

export function llmPath() {
  const name = efNames[Math.floor(Math.random() * efNames.length)]
  const url = name === 'expiry-engine'
    ? `${EF}/expiry-engine?storeId=${STORE_ID}`
    : `${EF}/${name}`
  const r = http.post(url, JSON.stringify(llmPayloads[name]), {
    headers,
    tags: { name: 'llm_call' },
  })
  check(r, { 'llm ef returned(含降级兜底)': (x) => x.status > 0 })
  sleep(3)
}
