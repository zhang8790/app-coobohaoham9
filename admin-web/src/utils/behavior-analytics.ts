// 用户行为分析模型（确定性 / 可审计 / 零资金影响）
// 方法：衰减因子、复购周期、马尔可夫转移矩阵（生命周期态 / 段位六阶 / 确权态）、流失风险、触发闭环。
// 全部为经典统计与规则模型，无需训练任何 ML 模型，可在 Supabase 客户端直接计算。
import { supabase } from '@/lib/supabase'

// ── 原始数据 ────────────────────────────────────────────────────────────
export interface RawBehavior {
  profiles: any[]
  orders: any[]
  claims: any[]
  goldLogs: any[]
  rankEvents: any[]
  optedOutCount: number
}

export async function loadBehaviorData(): Promise<RawBehavior> {
  // 先取全量 profiles 以判定「个性化总闸」退出情况（PIPL：退出用户完全排除出分析）
  const pRes = await supabase
    .from('profiles')
    .select('id,nickname,member_rank,created_at,total_consumption,gold_beans,tb_balance,allow_behavior_analysis')
  const allProfiles = (pRes.data as any[]) || []
  if (pRes.error) {
    console.warn('[behavior-analytics] profiles 查询失败（迁移 00085/00087 可能未执行）：', pRes.error.message)
  }
  const allowedIds = allProfiles
    .filter(pr => pr.allow_behavior_analysis !== false)
    .map(pr => pr.id)
  const optedOutCount = allProfiles.length - allowedIds.length

  // 退出用户不参与任何维度计算：订单/确权/金豆/段位事件均按允许集合过滤
  const scope = (q: any) =>
    allowedIds.length ? q.in('user_id', allowedIds) : q

  const [o, c, g, r] = await Promise.all([
    scope(supabase.from('orders').select('user_id,created_at,status,total_amount,verified_at')),
    scope(supabase.from('emotion_claims').select('user_id,created_at,status')),
    scope(supabase.from('gold_bean_logs').select('user_id,created_at,type,delta')),
    scope(supabase.from('member_rank_events').select('user_id,from_stage,to_stage,created_at,trigger')),
  ])
  if (r.error) {
    console.warn('[behavior-analytics] member_rank_events 查询失败（迁移 00086 可能未执行）：', r.error.message)
  }
  return {
    profiles: allProfiles.filter(pr => pr.allow_behavior_analysis !== false),
    orders: (o.data as any[]) || [],
    claims: (c.data as any[]) || [],
    goldLogs: (g.data as any[]) || [],
    rankEvents: (r.data as any[]) || [],
    optedOutCount,
  }
}

// ── 通用工具 ────────────────────────────────────────────────────────────
const DAY = 86400000
function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100
}
function monthIndex(t: number): number {
  const d = new Date(t)
  return d.getFullYear() * 12 + d.getMonth()
}
function monthKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── 1) 衰减活跃度（指数加权）────────────────────────────────────────────
export interface DecayResult {
  perUser: Record<string, number>
  mean: number
  top: { userId: string; nickname: string; score: number }[]
}
export function decayActivity(raw: RawBehavior, lambdaDays = 30, asOf = Date.now()): DecayResult {
  const events: Record<string, { t: number; w: number }[]> = {}
  const add = (uid: string | undefined, t: number, w: number) => {
    if (!uid) return
    ;(events[uid] ||= []).push({ t, w })
  }
  for (const o of raw.orders) {
    if (o.status === 'refunded' || o.status === 'cancelled') continue
    add(o.user_id, new Date(o.created_at).getTime(), 1)
  }
  for (const c of raw.claims) add(c.user_id, new Date(c.created_at).getTime(), 1.5)
  for (const g of raw.goldLogs) {
    const d = Number(g.delta || 0)
    if (d < 0) add(g.user_id, new Date(g.created_at).getTime(), Math.min(0.5, -d / 100))
  }
  const perUser: Record<string, number> = {}
  for (const [uid, evs] of Object.entries(events)) {
    let s = 0
    for (const e of evs) {
      const ageDays = Math.max(0, (asOf - e.t) / DAY)
      s += e.w * Math.exp(-ageDays / lambdaDays)
    }
    perUser[uid] = Math.round(s * 100) / 100
  }
  const vals = Object.values(perUser)
  const mean = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0
  const nickMap: Record<string, string> = {}
  for (const p of raw.profiles) nickMap[p.id] = p.nickname || '用户'
  const top = Object.entries(perUser)
    .map(([userId, score]) => ({ userId, nickname: nickMap[userId] || '用户', score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
  return { perUser, mean, top }
}

// ── 2) 复购周期 ─────────────────────────────────────────────────────────
export interface RepurchaseResult {
  globalMedianDays: number
  perUser: Record<string, number>
  cohortMedian: Record<string, number>
  histogram: { bucket: string; count: number }[]
}
export function repurchaseCycle(raw: RawBehavior): RepurchaseResult {
  const byUser: Record<string, number[]> = {}
  for (const o of raw.orders) {
    if (o.status === 'refunded' || o.status === 'cancelled') continue
    const t = new Date(o.created_at).getTime()
    if (!isNaN(t)) (byUser[o.user_id] ||= []).push(t)
  }
  const perUser: Record<string, number> = {}
  const allIntervals: number[] = []
  const cohortMap: Record<string, number[]> = {}
  for (const [uid, ts] of Object.entries(byUser)) {
    ts.sort((a, b) => a - b)
    const intervals: number[] = []
    for (let i = 1; i < ts.length; i++) {
      const d = Math.round((ts[i] - ts[i - 1]) / DAY)
      if (d > 0) { intervals.push(d); allIntervals.push(d) }
    }
    if (intervals.length) {
      const med = median(intervals)
      perUser[uid] = med
      const cohort = monthKey(ts[0])
      ;(cohortMap[cohort] ||= []).push(med)
    }
  }
  const globalMedianDays = median(allIntervals)
  const cohortMedian: Record<string, number> = {}
  for (const [c, arr] of Object.entries(cohortMap)) cohortMedian[c] = median(arr)
  const buckets = [
    { bucket: '≤15天', max: 15, count: 0 },
    { bucket: '16-30天', max: 30, count: 0 },
    { bucket: '31-45天', max: 45, count: 0 },
    { bucket: '46-60天', max: 60, count: 0 },
    { bucket: '61-90天', max: 90, count: 0 },
    { bucket: '>90天', max: Infinity, count: 0 },
  ]
  for (const d of allIntervals) {
    for (const b of buckets) { if (d <= b.max) { b.count++; break } }
  }
  return { globalMedianDays, perUser, cohortMedian, histogram: buckets.map(b => ({ bucket: b.bucket, count: b.count })) }
}

// ── 3) 马尔可夫转移矩阵（通用）──────────────────────────────────────────
export interface MatrixResult {
  states: string[]
  counts: number[][]
  matrix: number[][]
}
export function buildMatrix(stateSequences: string[][], stateOrder: string[], pseudo = 0): MatrixResult {
  const n = stateOrder.length
  const idx: Record<string, number> = {}
  stateOrder.forEach((s, i) => (idx[s] = i))
  const counts = Array.from({ length: n }, () => Array(n).fill(0))
  for (const seq of stateSequences) {
    for (let i = 1; i < seq.length; i++) {
      const a = idx[seq[i - 1]], b = idx[seq[i]]
      if (a === undefined || b === undefined) continue
      counts[a][b]++
    }
  }
  const matrix = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    const rowSum = counts[i].reduce((a, b) => a + b, 0) + pseudo * n
    for (let j = 0; j < n; j++) {
      matrix[i][j] = rowSum ? (counts[i][j] + pseudo) / rowSum : (i === j ? 1 : 0)
    }
  }
  return { states: stateOrder, counts, matrix }
}

export function predictNext(m: MatrixResult, current: string, steps = 1): Record<string, number> {
  const i = m.states.indexOf(current)
  if (i < 0) return {}
  let v = m.matrix[i].slice()
  for (let s = 1; s < steps; s++) {
    const nv = Array(m.states.length).fill(0)
    for (let a = 0; a < v.length; a++) for (let b = 0; b < v.length; b++) nv[b] += v[a] * m.matrix[a][b]
    v = nv
  }
  const out: Record<string, number> = {}
  m.states.forEach((s, k) => (out[s] = Math.round(v[k] * 1000) / 1000))
  return out
}

// ── 3a) 生命周期态马尔可夫 ──────────────────────────────────────────────
export const LIFECYCLE_STATES = ['新客', '活跃', '沉默', '流失']
export function markovLifecycle(raw: RawBehavior, asOf = Date.now()): MatrixResult {
  const byUser: Record<string, number[]> = {}
  for (const o of raw.orders) {
    if (o.status === 'refunded' || o.status === 'cancelled') continue
    const t = new Date(o.created_at).getTime()
    if (!isNaN(t)) (byUser[o.user_id] ||= []).push(t)
  }
  const asOfMonth = monthIndex(asOf)
  const seqs: string[][] = []
  for (const ts of Object.values(byUser)) {
    ts.sort((a, b) => a - b)
    const firstMonth = monthIndex(ts[0])
    const lastOrderMonth = monthIndex(ts[ts.length - 1])
    const endMonth = Math.min(asOfMonth, Math.max(lastOrderMonth, firstMonth + 24))
    const orderMonths = new Set(ts.map(monthIndex))
    const seq: string[] = []
    let first = true
    for (let m = firstMonth; m <= endMonth; m++) {
      if (orderMonths.has(m)) {
        seq.push(first ? '新客' : '活跃')
        first = false
      } else {
        let lo = -Infinity
        for (const t of ts) { const om = monthIndex(t); if (om <= m && om > lo) lo = om }
        const gapDays = (m - lo) * 30
        seq.push(gapDays <= 30 ? '沉默' : '流失')
      }
    }
    if (seq.length >= 2) seqs.push(seq)
  }
  return buildMatrix(seqs, LIFECYCLE_STATES, 0.5)
}

// ── 3b) 段位六阶马尔可夫 ────────────────────────────────────────────────
export const RANK_STATES = ['江湖散修', '外门弟子', '内门弟子', '核心弟子', '长老', '掌门']
export function markovRank(raw: RawBehavior): MatrixResult {
  const byUser: Record<string, any[]> = {}
  for (const e of raw.rankEvents) (byUser[e.user_id] ||= []).push(e)
  const seqs: string[][] = []
  for (const evs of Object.values(byUser)) {
    evs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const seq: string[] = [evs[0].from_stage]
    for (const e of evs) seq.push(e.to_stage)
    if (seq.length >= 2) seqs.push(seq)
  }
  return buildMatrix(seqs, RANK_STATES, 0.5)
}

// ── 3c) 确权态马尔可夫 ──────────────────────────────────────────────────
export const CLAIM_STATES = ['未确权', '已确权', '复确权']
export function markovClaim(raw: RawBehavior, asOf = Date.now()): MatrixResult {
  const byUser: Record<string, number[]> = {}
  for (const c of raw.claims) {
    const t = new Date(c.created_at).getTime()
    if (!isNaN(t)) (byUser[c.user_id] ||= []).push(t)
  }
  const asOfMonth = monthIndex(asOf)
  const seqs: string[][] = []
  for (const ts of Object.values(byUser)) {
    ts.sort((a, b) => a - b)
    const firstMonth = monthIndex(ts[0])
    const lastOrderMonth = monthIndex(ts[ts.length - 1])
    const endMonth = Math.min(asOfMonth, Math.max(lastOrderMonth, firstMonth + 24))
    const claimMonths = new Set(ts.map(monthIndex))
    const seq: string[] = []
    let claimed = false
    let reclaimed = false
    for (let m = firstMonth; m <= endMonth; m++) {
      if (claimMonths.has(m)) {
        if (!claimed) { seq.push('已确权'); claimed = true }
        else { seq.push('复确权'); reclaimed = true }
      } else {
        if (!claimed) seq.push('未确权')
        else if (!reclaimed) seq.push('已确权')
        else seq.push('复确权')
      }
    }
    if (seq.length >= 2) seqs.push(seq)
  }
  return buildMatrix(seqs, CLAIM_STATES, 0.5)
}

// ── 4) 流失风险 ─────────────────────────────────────────────────────────
export interface ChurnUser {
  userId: string; nickname: string; daysSince: number; lastOrder: string; cycle: number; score: number
}
export function churnRisk(raw: RawBehavior, repurchase: RepurchaseResult, asOf = Date.now()): ChurnUser[] {
  const byUser: Record<string, number[]> = {}
  for (const o of raw.orders) {
    if (o.status === 'refunded' || o.status === 'cancelled') continue
    const t = new Date(o.created_at).getTime()
    if (!isNaN(t)) (byUser[o.user_id] ||= []).push(t)
  }
  const nickMap: Record<string, string> = {}
  for (const p of raw.profiles) nickMap[p.id] = p.nickname || '用户'
  const global = repurchase.globalMedianDays || 30
  const out: ChurnUser[] = []
  for (const [uid, ts] of Object.entries(byUser)) {
    ts.sort((a, b) => a - b)
    const last = ts[ts.length - 1]
    const daysSince = Math.floor((asOf - last) / DAY)
    const cycle = repurchase.perUser[uid] || global
    if (daysSince > Math.max(21, cycle * 1.5)) {
      const score = Math.min(1, daysSince / (cycle * 3))
      out.push({
        userId: uid, nickname: nickMap[uid] || '用户', daysSince,
        lastOrder: new Date(last).toISOString().slice(0, 10),
        cycle: Math.round(cycle), score: Math.round(score * 1000) / 1000,
      })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

// ── 5) 触发规则 → 数据回流（闭环）──────────────────────────────────────
export interface Trigger {
  userId: string; nickname: string; type: string; reason: string; action: string
}
export function buildTriggers(raw: RawBehavior, churn: ChurnUser[], decay: DecayResult): Trigger[] {
  const triggers: Trigger[] = []
  const churnIds = new Set(churn.map(c => c.userId))
  for (const u of churn) {
    if (u.score >= 0.5) {
      triggers.push({
        userId: u.userId, nickname: u.nickname, type: 'churn_care',
        reason: `已 ${u.daysSince} 天未购（复购周期约 ${u.cycle} 天）`,
        action: '推送情绪豆关怀 + 回归券',
      })
    }
  }
  const mean = decay.mean || 1
  const nickMap: Record<string, string> = {}
  for (const p of raw.profiles) nickMap[p.id] = p.nickname || '用户'
  for (const [uid, score] of Object.entries(decay.perUser)) {
    if (churnIds.has(uid)) continue
    if (score < mean * 0.4) {
      triggers.push({
        userId: uid, nickname: nickMap[uid] || '用户', type: 'low_activity',
        reason: `近 30 天活跃度 ${score}（均值 ${mean}）偏低`,
        action: '推送专属情绪内容唤醒',
      })
    }
  }
  return triggers.slice(0, 60)
}

// 执行关怀：写入 notifications（数据回流闭环，不直接动资金）
export async function executeCare(trigger: Trigger): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: trigger.userId,
      type: 'announcement',
      title: '来自武林盟的关怀',
      body: `检测到您近期较少互动，${trigger.action}。我们准备了一份心意，敬请查收～`,
      payload: { source: 'behavior-analytics', trigger_type: trigger.type, suggested_action: trigger.action },
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || '未知错误' }
  }
}

// ── 聚合报告 ────────────────────────────────────────────────────────────
export interface BehaviorReport {
  totalUsers: number
  repurchase: RepurchaseResult
  decay: DecayResult
  lifecycle: MatrixResult
  rank: MatrixResult
  claim: MatrixResult
  churn: ChurnUser[]
  triggers: Trigger[]
}
export function computeAll(raw: RawBehavior, asOf = Date.now()): BehaviorReport {
  const repurchase = repurchaseCycle(raw)
  const decay = decayActivity(raw, 30, asOf)
  const lifecycle = markovLifecycle(raw, asOf)
  const rank = markovRank(raw)
  const claim = markovClaim(raw, asOf)
  const churn = churnRisk(raw, repurchase, asOf)
  const triggers = buildTriggers(raw, churn, decay)
  return { totalUsers: raw.profiles.length, repurchase, decay, lifecycle, rank, claim, churn, triggers }
}
