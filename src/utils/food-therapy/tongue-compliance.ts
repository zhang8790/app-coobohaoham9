/**
 * 舌象能力 · 合规机制与边界（固化「能说 / 不能说」）
 * ----------------------------------------------------------------------------
 * 定位：舌象是「食养参考」，不是医疗诊断。本模块把边界写成**可执行的规则**，
 * 供三处强制调用：
 *   ① 案例入库前校验（src/db/tongue-cases.ts）——脏文案不进库；
 *   ② 结果页 / 报告渲染前净化；
 *   ③ 审核与新人上手（配套 docs/舌象合规边界.md）。
 *
 * 边界三原则：
 *   1) 只给「倾向 / 参考」，不给「诊断 / 病症」；
 *   2) 界面与文案零「AI」字样（统一「望舌辨证引擎 / 智能识别」）；
 *   3) 不承诺疗效、不绑定个人可识别健康数据。
 */

import { FOOD_THERAPY_DISCLAIMER, shieldCopy, hasForbidden } from '@/utils/compliance/shield'

/** 舌象任何结论卡必须展示的免责声明（直接复用全局护栏常量，避免双份漂移） */
export const TONGUE_MUST_DISPLAY = FOOD_THERAPY_DISCLAIMER

/** 一条边界的「可 / 不可」对照 */
export interface TongueBoundaryRule {
  /** 允许的说法（食养语境） */
  allow: string
  /** 禁止的说法（医疗 / 功效 / 越界） */
  deny: string
  /** 说明 */
  note: string
}

/** 舌象合规边界清单（单一事实源，docs 与本清单保持一致） */
export const TONGUE_BOUNDARY: TongueBoundaryRule[] = [
  {
    allow: '倾向 / 参考 / 食养建议',
    deny: '诊断 / 确诊 / 病症 / 病情',
    note: '只给「可能的倾向」，不下结论、不贴病名',
  },
  {
    allow: '望舌辨证引擎 / 智能识别',
    deny: 'AI / 人工智能 / 大模型 / 深度学习',
    note: '界面与文案零「AI」字样（底层可用模型，对外不标称）',
  },
  {
    allow: '成因参考 / 可能和这些日常习惯有关',
    deny: '病因 / 发病机制 / 病理',
    note: '机制只做生活化归因，不做医疗机制表述',
  },
  {
    allow: '低风险 / 中等风险 / 偏高风险状态',
    deny: '严重程度 / 分期 / 分型',
    note: '「风险」仅指倾向强弱，不指病情轻重',
  },
  {
    allow: '建议复测 / 一周后再次检测',
    deny: '复查 / 复诊 / 疗程',
    note: '不引导医疗行为；不适请就医',
  },
  {
    allow: '食养 / 口味上可以这样挑',
    deny: '治疗 / 疗效 / 治愈 / 调理 / 见效',
    note: '统一食养语境，功效词由 shield 拦截',
  },
  {
    allow: '照片仅用于本次识别',
    deny: '上传云端建档 / 个人健康档案（可识别）',
    note: '案例库只收去标识聚合数据，不存个人可识别信息',
  },
]

/**
 * 舌象语境专属补充违禁词（在全局 FORBIDDEN_WORDS 之外额外拦截）。
 * 说明：品牌词「望舌辨证引擎」中的「辨证」属已确认可用表述，故 **不** 在此列。
 */
export const TONGUE_EXTRA_FORBIDDEN: string[] = [
  '人工智能',
  '大模型',
  '深度学习',
  '神经网络',
  '确诊',
  '病理',
  '发病机制',
  '疗程',
  '复诊',
  '复查',
]

export interface TongueCopyCheck {
  /** 净化后的安全文案 */
  safe: string
  /** 是否完全干净 */
  clean: boolean
  /** 命中的违禁词（含全局 + 舌象专属） */
  hits: string[]
}

/**
 * 校验单段舌象文案：先走全局 shield（医疗/功效词替换），再查舌象专属词。
 * 返回净化结果与命中项；命中即视为「越界」，调用方应拒绝入库或改文案。
 */
export function checkTongueCopy(text: string): TongueCopyCheck {
  if (!text) return { safe: text, clean: true, hits: [] }
  const hits: string[] = []
  // 全局护栏（会做安全近义词替换 / 脱敏）
  const shielded = shieldCopy(text)
  hits.push(...shielded.hits)
  let safe = shielded.safe
  // 舌象专属补充拦截
  for (const w of TONGUE_EXTRA_FORBIDDEN) {
    if (safe.includes(w) && !hits.includes(w)) {
      hits.push(w)
      safe = safe.split(w).join('**')
    }
  }
  return { safe, clean: hits.length === 0, hits }
}

/** 仅判定是否越界（不关心净化结果） */
export function isTongueCopyClean(text: string): boolean {
  if (!text) return true
  if (hasForbidden(text)) return false
  return !TONGUE_EXTRA_FORBIDDEN.some((w) => text.includes(w))
}

/**
 * 批量校验案例文本字段（案例入库前的守门函数）。
 * 任一字段越界 → clean=false 并汇总 hits，写入方据此拒绝入库。
 */
export function validateTongueCaseText(fields: (string | undefined | null)[]): {
  clean: boolean
  hits: string[]
} {
  const hits = new Set<string>()
  for (const f of fields) {
    if (!f) continue
    for (const h of checkTongueCopy(f).hits) hits.add(h)
  }
  return { clean: hits.size === 0, hits: [...hits] }
}
