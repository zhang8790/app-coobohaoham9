/**
 * 舌象复测历史存取（本地 storage）
 * ----------------------------------------------------------------------------
 * 从 tongue-report.ts 拆出：仅此文件依赖 Taro storage，让报告逻辑层保持纯函数、可白盒单测。
 * 每次进入结果页记录一次健康指数，最多保留 HISTORY_MAX 条，供趋势小图绘制。
 */
import Taro from '@tarojs/taro'

export interface TongueHistoryPoint {
  /** 展示用日期 MM.DD */
  d: string
  /** 该次健康指数 */
  v: number
  /** 时间戳（排序 / 去重） */
  t: number
}

const HISTORY_KEY = 'tongue:report:history'
const HISTORY_MAX = 8

function fmtMMDD(ts: number): string {
  const dt = new Date(ts)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${mm}.${dd}`
}

/** 读取本地复测历史（容错：任何异常返回空数组） */
export function readTongueHistory(): TongueHistoryPoint[] {
  try {
    const raw = Taro.getStorageSync(HISTORY_KEY)
    if (!raw) return []
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(list)) return []
    return list.filter((p) => p && typeof p.v === 'number' && typeof p.t === 'number')
  } catch {
    return []
  }
}

/**
 * 追加一条复测记录并返回最新列表（最多保留 HISTORY_MAX 条）。
 * 同一次进入结果页只追加一次，由调用方用 ref 守卫；同日可重复（对应「当天复测」场景）。
 */
export function pushTongueHistory(score: number): TongueHistoryPoint[] {
  const now = Date.now()
  const next = [...readTongueHistory(), { d: fmtMMDD(now), v: score, t: now }].slice(-HISTORY_MAX)
  try {
    Taro.setStorageSync(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* 写入失败不影响展示 */
  }
  return next
}

// ─────────────────────────────────────────────────────────────────────────────
// 食养画像快照（本地 storage，仅落最近一次；不回写数据库、不存个人可识别信息）
// ----------------------------------------------------------------------------
// 把「问卷 → 舌象维度 → 体质 → 食养」闭环的最近一次结果沉淀为本地画像，
// 供「我的食养画像」页聚合展示。与 TongueReport 同源（同一份 answers + v2 引擎）。
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_KEY = 'tongue:profile:last'

/** 最近一次食养画像快照（界面展示所需的最小字段，去标识） */
export interface TongueProfile {
  updatedAt: number
  primaryKey: string
  primaryName: string
  primaryColor: string
  primaryEmoji: string
  secondaryKey?: string
  secondaryName?: string
  healthIndex: number
  band: 'low' | 'mid' | 'high'
  bandLabel: string
  confidence: number
  answers: number[]
  /** 身体感受题数（9 = 深度问诊版；缺省或 5 = 旧的快速 5 题版），画像页据此选用对应题库重算 */
  bodyCount?: number
}

/**
 * 落盘最近一次画像快照。
 * 入参为 v2 引擎分析结果 + 健康指数（与 TongueReport 同源），由调用方算好后传入，
 * 避免在纯数据层重复依赖引擎/报告模块。
 */
export function saveTongueProfile(snapshot: TongueProfile): void {
  try {
    Taro.setStorageSync(PROFILE_KEY, JSON.stringify(snapshot))
  } catch {
    /* 写入失败不影响展示 */
  }
}

/** 读取本地画像快照（容错：任何异常返回 null） */
export function loadTongueProfile(): TongueProfile | null {
  try {
    const raw = Taro.getStorageSync(PROFILE_KEY)
    if (!raw) return null
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!p || typeof p.primaryKey !== 'string' || !Array.isArray(p.answers)) return null
    return p as TongueProfile
  } catch {
    return null
  }
}
