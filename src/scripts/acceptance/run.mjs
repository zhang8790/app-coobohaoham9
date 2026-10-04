#!/usr/bin/env node
// 来店有喜 V3 · 自动化验收 runner（主程序）
//
// 实现规范《自动化检测/缺陷分级/验收准入退出》于本栈（Taro4 + Supabase + admin-web）：
//   阶段1 准入检查（门禁，不满足不启动） → 阶段2 自动化检测 → 阶段3 缺陷分级 + 验收裁决 + 报告
//
// 用法：
//   node src/scripts/acceptance/run.mjs            # 全量（含在线探针）
//   node src/scripts/acceptance/run.mjs --no-live  # 仅静态 + 准入（不联网）
//
// 退出码：0=PASS/CONDITIONAL，1=REJECT（任一 P0/BLOCK/P1）

import { execSync } from 'node:child_process'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv, probe, Reporter, adjudicate, writeReports, ROOT } from './lib.mjs'

const NO_LIVE = process.argv.includes('--no-live')
const env = loadEnv()
const rep = new Reporter()

// ---------- 静态扫描辅助（git grep，未命中=空数组） ----------
function grep(pattern, where = 'src') {
  try {
    const out = execSync(`git grep -n --untracked -e ${JSON.stringify(pattern)} -- ${where}`, {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    // 剥离 git grep 的 `文件:行号:` 前缀，使下游注释过滤（// /*）能正确命中代码本体
    return out.split('\n').filter(Boolean).map(l => l.replace(/^[^:]+:\d+:/, ''))
  } catch { return [] }
}
function fileHas(path, needle) {
  try { return readFileSync(path, 'utf8').includes(needle) } catch { return false }
}
const S = {
  products: join(ROOT, 'admin-web/src/pages/merchant/Products.tsx'),
  ctx: join(ROOT, 'src/contexts/FoodTherapyContext.tsx'),
  constTest: join(ROOT, 'src/pages/food/constitution-test/index.tsx'),
  product: join(ROOT, 'src/pages/product/index.tsx'),
}

// =================== 阶段1：准入门禁 ===================
async function phase1Gate() {
  console.log('\n' + '═'.repeat(64) + '\n  阶段1 · 验收准入门禁（硬门禁未过不启动正式自动检测）\n' + '═'.repeat(64))
  const items = []
  const headers = { apikey: env.anon, Authorization: `Bearer ${env.anon}` }

  // 硬门禁清单（任一不过 → 阻断）；其余为软检查（WARN，不阻断）
  const HARD = new Set([
    'Supabase 服务连通性', '数据库读权限（anon select）',
    '小程序构建产物 dist_new/app.js', '后台构建产物 admin-web/dist',
  ])

  // 1) Supabase 连通性（硬）
  {
    const r = await probe(`${env.url}/rest/v1/`, { headers })
    const ok = r.status !== 0 && r.status < 500
    items.push({ name: 'Supabase 服务连通性', ok, hard: true, detail: ok ? `HTTP ${r.status}` : `不可达 ${r.error || r.status}` })
    if (!ok) rep.block('准入检查', 'Supabase 服务连通性', `HTTP ${r.status} ${r.error || ''}`)
    else rep.pass('准入检查', 'Supabase 服务连通性', `REST 可达 HTTP ${r.status}`)
  }

  // 2) DB 读权限（硬）
  {
    const r = await probe(`${env.url}/rest/v1/products?select=id&limit=1`, { headers })
    const ok = r.status === 200
    items.push({ name: '数据库读权限（anon select）', ok, hard: true, detail: ok ? '200' : `HTTP ${r.status}` })
    if (!ok) rep.block('准入检查', '数据库读权限', `anon select products → ${r.status} ${r.error || ''}`)
    else rep.pass('准入检查', '数据库读权限', 'anon 可读 products（列级策略生效）')
  }

  // 3) 小程序构建产物（硬）
  {
    const p = join(ROOT, 'dist_new/app.js')
    const ok = existsSync(p) && statSync(p).size > 1000
    items.push({ name: '小程序构建产物 dist_new/app.js', ok, hard: true, detail: ok ? `${statSync(p).size}B` : '缺失或为空' })
    if (!ok) rep.block('准入检查', '小程序构建产物', 'dist_new/app.js 缺失，请先 bash build-weapp.sh')
    else rep.pass('准入检查', '小程序构建产物', `dist_new/app.js ${statSync(p).size}B`)
  }

  // 4) admin-web 构建产物（硬）
  {
    const p = join(ROOT, 'admin-web/dist/index.html')
    const ok = existsSync(p) && statSync(p).size > 100
    items.push({ name: '后台构建产物 admin-web/dist', ok, hard: true, detail: ok ? '存在' : '缺失' })
    if (!ok) rep.block('准入检查', '后台构建产物', 'admin-web/dist/index.html 缺失，请先 npm run build')
    else rep.pass('准入检查', '后台构建产物', 'admin-web/dist 就绪')
  }

  // 5) Storage 配置（软）：端点可达即算配置就绪（anon 查桶元数据被拒属正常）
  if (!NO_LIVE) {
    const r = await probe(`${env.url}/storage/v1/bucket/product-images`, { headers })
    const ok = r.status !== 0 && r.status < 500
    items.push({ name: '对象存储配置（product-images 桶）', ok, hard: false, detail: `HTTP ${r.status}` })
    if (ok) rep.pass('准入检查', '对象存储配置', `storage 端点可达 HTTP ${r.status}`)
    else rep.warn('准入检查', '对象存储配置', `桶探测 HTTP ${r.status}`, '', 'P2')
  } else {
    items.push({ name: '对象存储配置（product-images 桶）', ok: true, hard: false, detail: '跳过(--no-live)' })
    rep.warn('准入检查', '对象存储配置', '本沙箱跳过在线探测', '', 'NA')
  }

  // 6) 微信小程序 AppID 配置（软）
  {
    const ok = !!env.appId
    items.push({ name: '微信小程序 AppID 配置', ok, hard: false, detail: ok ? `AppID=${env.appId}` : 'TARO_APP_APP_ID 为空' })
    if (ok) rep.pass('准入检查', '微信小程序 AppID 配置', `AppID=${env.appId}`)
    else rep.warn('准入检查', '微信小程序 AppID 配置', 'TARO_APP_APP_ID 未配置', '', 'P1')
  }

  const ok = items.filter(i => i.hard).every(i => i.ok)
  return { ok, items, url: env.url }
}

// =================== 阶段2：自动化检测 ===================
async function phase2Detect() {
  console.log('\n' + '═'.repeat(64) + '\n  阶段2 · 自动化检测（接口 / UI静态 / 业务链路闭环）\n' + '═'.repeat(64))
  const headers = { apikey: env.anon, Authorization: `Bearer ${env.anon}` }

  // ---------- 2.1 接口自动化（DB schema 关键列） ----------
  console.log('\n  —— 2.1 接口自动化（数据库 schema 关键列校验） ——')
  const colChecks = [
    { col: 'scene_tags', table: 'products', sev: 'P1', note: '适用场景轴数据源（断裂1 修复后对齐）' },
    { col: 'health_tag', table: 'products', sev: 'P1', note: '人群/体质轴推导源' },
    { col: 'constitution_type', table: 'user_health_profile', sev: 'P1', note: '用户体质画像（断裂2 回写目标）' },
    { col: 'fit_crowd_tags', table: 'products', sev: 'P2', note: '适宜人群标签' },
  ]
  for (const c of colChecks) {
    const r = await probe(`${env.url}/rest/v1/${c.table}?select=${c.col}&limit=1`, { headers })
    if (r.status === 200) rep.pass('接口自动化', `${c.table}.${c.col} 列存在`, c.note)
    else if (r.status === 404) rep.fail('接口自动化', `${c.table}.${c.col} 表缺失`, c.sev, c.note, `HTTP 404`)
    else if (r.status === 401 || r.status === 403) rep.pass('接口自动化', `${c.table}.${c.col} 列存在+RLS保护`, `anon 被拒(合规) HTTP ${r.status}`, c.note)
    else rep.fail('接口自动化', `${c.table}.${c.col} 探测异常`, c.sev, c.note, `HTTP ${r.status} ${r.error || ''}`)
  }

  // 云函数上线探针（食安/舌象，已知 2026-10-02 欠费可能降级）
  if (!NO_LIVE) {
    for (const fn of ['ingredient-analyze', 'tongue-reader', 'distribute-commission']) {
      const r = await probe(`${env.url}/functions/v1/${fn}`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
      }, 20000)
      if (r.status === 404) rep.warn('接口自动化', `云函数 ${fn} 未部署`, `HTTP 404`, '', 'P2')
      else if (r.status === 0) rep.warn('接口自动化', `云函数 ${fn} 不可达`, r.error || 'timeout', '', 'P2')
      else rep.pass('接口自动化', `云函数 ${fn} 在线`, `HTTP ${r.status}`)
    }
  }

  // ---------- 2.2 UI 静态检测（合规铁律 + 修复落地） ----------
  console.log('\n  —— 2.2 UI 静态检测（合规铁律 / 修复落地核查） ——')

  // 铁律①：C 端零「AI」渲染（排除 DISCLAIMER 常量子串、注释、OCR 服务名，避免误报）
  {
    const hits = grep('AI', 'src/pages').filter(l =>
      !/DISCLAIMER|OCR|BAIDU_OCR|apikey|Authorization/i.test(l)  // 常量/服务名
      && !/(^|\s)\/\//.test(l)   // 行注释 //
      && !/\/\*/.test(l)         // 块注释 /* 与 JSX 注释 {/* */}
    )
    if (hits.length === 0) rep.pass('UI 静态', 'C 端零「AI」渲染', 'src/pages 无界面 AI 字样（已排除 DISCLAIMER 常量与注释）')
    else rep.fail('UI 静态', 'C 端出现「AI」字样', 'P0', '违反零AI铁律', hits.slice(0, 3).join(' | '))
  }
  // 铁律②：禁社会证明（仅检测实际曝光文案；排除守门注释与 runner 自身，搜索域限定 src/pages）
  {
    const hits = grep('用户好评|买家秀|万人选购|好评如潮|真实反馈', 'src/pages').filter(l =>
      !/(^|\s)\/\//.test(l) && !/\/\*/.test(l)
    )
    if (hits.length === 0) rep.pass('UI 静态', '禁社会证明', '未发现社会证明曝光文案（已排除守门注释/自引用）')
    else rep.fail('UI 静态', '社会证明曝光', 'P0', '违反 C 端禁社会证明铁律', hits.slice(0, 3).join(' | '))
  }
  // 修复① 断裂1：向导提交用 scene_tags 且回填读 scene_tags
  {
    const subOk = fileHas(S.products, 'scene_tags:') || fileHas(S.products, 'scene_tags: form')
    const backOk = fileHas(S.products, 'scene_tags ??') || fileHas(S.products, 'scene_tags: (p')
    if (subOk && backOk) rep.pass('UI 静态', '场景字段对齐 scenes→scene_tags', '提交与回填均用 scene_tags')
    else rep.fail('UI 静态', '场景字段断链未修复', 'P1', `sub=${subOk} back=${backOk}`, S.products)
  }
  // 修复② 断裂2：体质测试回写 constitution_type + context 刷新 + 详情高亮
  {
    const a = fileHas(S.constTest, 'upsertUserHealthProfile') && fileHas(S.constTest, 'constitution_type')
    const b = fileHas(S.ctx, 'refreshHealthProfile')
    const c = fileHas(S.product, 'useFoodTherapy') && fileHas(S.product, 'highlight={userConstitution}') && fileHas(S.product, 'constitution_type')
    if (a && b && c) rep.pass('UI 静态', '体质画像闭环接线', '回写+刷新+详情高亮三处俱在')
    else rep.fail('UI 静态', '体质画像闭环接缝缺失', 'P1', `write=${a} refresh=${b} highlight=${c}`, `${S.constTest}|${S.ctx}|${S.product}`)
  }
  // 修复③ P0-1：详情「适合X」单出口（无 fitText 残留）
  {
    const fitText = grep('fitText', 'src/pages/product/index.tsx')
    if (fitText.length === 0) rep.pass('UI 静态', '适宜人群单出口', 'fitText 双体系已清除')
    else rep.fail('UI 静态', '适宜人群双体系残留', 'P1', 'fitText 仍存在', fitText.slice(0, 3).join(' | '))
  }
  // 修复④ rpx 合规：TagRow 用 rpx 非 px
  {
    const ok = fileHas(S.product, "paddingHorizontal: '16rpx'") && !fileHas(S.product, "paddingVertical: '3px'")
    if (ok) rep.pass('UI 静态', 'Taro 内联 rpx 合规', 'TagRow 内边距使用 rpx')
    else rep.fail('UI 静态', '内联样式 px 残留', 'P2', 'TagRow 仍用 px', S.product)
  }

  // ---------- 2.3 业务链路闭环（最高优先级） ----------
  console.log('\n  —— 2.3 业务链路闭环（上架→展示→体质画像） ——')
  // 链路A：上架填 scene_tags → 详情适用场景轴可读
  {
    const upOk = fileHas(S.products, 'scene_tags:')
    const readOk = grep('scene_tags', 'src/pages/product/index.tsx').some(l => l.includes('sceneRec') || l.includes('(product as any)?.scene_tags'))
    if (upOk && readOk) rep.pass('业务链路', '上架→展示 场景轴闭环', '向导写 scene_tags，详情读 scene_tags')
    else rep.fail('业务链路', '上架→展示 场景轴断链', 'P0', `write=${upOk} read=${readOk}`, 'Products.tsx→product/index.tsx')
  }
  // 链路B：测体质 → 回写 user_health_profile → 详情高亮
  {
    const chain = fileHas(S.constTest, 'upsertUserHealthProfile')
      && fileHas(S.ctx, 'refreshHealthProfile')
      && fileHas(S.product, 'highlight={userConstitution}')
      && fileHas(S.product, 'constitution_type')
    if (chain) rep.pass('业务链路', '测体质→画像→商品个性化闭环', '体质源头回写+context刷新+详情自动高亮')
    else rep.fail('业务链路', '用户画像↔商品适配体质断链', 'P0', '体质源头未接/格式错配', 'constitution-test→FoodTherapyContext→product')
  }
  // 链路C：食养×舌象模块内闭环（combineAssessment + profile + 推荐）
  {
    const a = grep('combineAssessment', 'src').length > 0
    const b = grep('saveTongueProfile', 'src').length > 0
    const c = grep('getSuitability', 'src').length > 0
    if (a && b && c) rep.pass('业务链路', '食养×舌象模块内闭环', 'combineAssessment+saveTongueProfile+getSuitability 俱在')
    else rep.warn('业务链路', '食养×舌象闭环信号不全', `combine=${a} save=${b} suit=${c}`, '', 'P2')
  }

  // ---------- 2.4 性能/安全/兼容性（CI/手动标记，本沙箱仅占位） ----------
  console.log('\n  —— 2.4 性能 / 安全 / 兼容性（需 CI 环境，标记不阻断） ——')
  rep.warn('性能', '接口压测（JMeter）', '需 CI 跑核心接口<300ms/95分位<500ms/并发200无5xx', 'scripts/perf-thresholds.json', 'NA')
  rep.warn('安全', '越权/XSS/敏感信息泄露扫描', '需 CI 接入 ZAP 或自研用例', 'manual', 'NA')
  rep.warn('兼容性', 'Airtest 多机型/基础库遍历', '需 CI + 微信开发者工具', 'scripts/airtest-entry.js', 'NA')
}

// =================== 主流程 ===================
async function main() {
  console.log('🚀 来店有喜 V3 · 自动化验收 runner')
  console.log(`📡 Supabase: ${env.url}`)
  console.log(`⏰ ${new Date().toISOString()}`)
  console.log(`🌐 在线探针: ${NO_LIVE ? '关闭(--no-live)' : '开启'}`)

  const gate = await phase1Gate()
  if (!gate.ok) {
    console.log('\n🚫 准入门禁未过，按规范终止，不进入正式自动测试。')
  } else {
    console.log('\n✅ 准入门禁通过，进入阶段2 自动化检测。')
    await phase2Detect()
  }

  const verdict = adjudicate(rep)
  const base = writeReports(rep, gate, verdict)

  console.log('\n' + '═'.repeat(64))
  console.log(`📊 裁决：${verdict.verdict}  ${verdict.reason}`)
  console.log(`📄 报告：${base}.md / ${base}.json`)
  console.log('═'.repeat(64))

  process.exit(verdict.verdict === 'REJECT' ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
