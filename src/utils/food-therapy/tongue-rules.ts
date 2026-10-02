/**
 * 舌象自检规则引擎（非 AI · 纯本地）
 * ----------------------------------------------------------------------------
 * 定位：食养参考，不是中医诊断。用户按「引导对照」勾选舌象特征，
 * 引擎按传统饮食文化常识做规则映射，给出体质倾向提示，供食养搭配参考。
 *
 * 与 constitution-test 同源：复用 CONSTITUTION_TYPES 的体质 key 与计分阈值逻辑，
 * 但输入维度是「舌色 / 苔色 / 苔质 / 齿痕 / 润燥」五项望舌特征。
 *
 * 合规：全程不出"诊断/辨证/病"等医疗词；结果统一叫「倾向/参考」，
 * 渲染层必须展示 FOOD_THERAPY_DISCLAIMER（由页面负责）。
 */

import { CONSTITUTION_TYPES, type ConstitutionType } from '@/utils/constitution-test'

export interface TongueOption {
  label: string
  /** 望舌提示，帮助用户对照 */
  hint?: string
  effect: Partial<Record<string, number>>
}

export interface TongueQuestion {
  id: string
  question: string
  tip: string
  options: TongueOption[]
}

type ConstitutionKey = keyof typeof CONSTITUTION_TYPES

/**
 * 五项望舌维度。每条选项的 effect 是「对该体质倾向的加分」，
 * 中性/正常表现 effect 为空，不给任何体质加分（避免人人平和的偏置）。
 * 映射依据：传统饮食文化常识里舌象与寒/热/虚/湿/瘀的对应，仅作食养参考。
 */
export const TONGUE_QUESTIONS: TongueQuestion[] = [
  {
    id: 'color',
    question: '舌头的颜色偏向？',
    tip: '在自然光下观察舌体本身（不是舌苔）的颜色',
    options: [
      { label: '淡红 / 粉红（常见）', effect: {} },
      { label: '偏淡白（颜色发浅）', hint: '舌体颜色比常人浅', effect: { yangxu: 3, qixu: 1 } },
      { label: '偏红（比常人红）', hint: '舌体红赤', effect: { yinxu: 2, shire: 2 } },
      { label: '暗红 / 绛红', hint: '深红偏暗', effect: { shire: 2, xueyu: 2 } },
      { label: '青紫 / 暗紫', hint: '舌色发青发紫', effect: { xueyu: 3, yangxu: 1 } },
    ],
  },
  {
    id: 'coat_color',
    question: '舌苔的颜色？',
    tip: '看舌面上那层苔的颜色',
    options: [
      { label: '薄白苔（常见）', effect: {} },
      { label: '白而厚', effect: { tanshi: 3, qixu: 1 } },
      { label: '淡黄苔', effect: { shire: 3, yinxu: 1 } },
      { label: '黄厚腻苔', effect: { shire: 3, tanshi: 2 } },
      { label: '少苔 / 无苔（舌面光红）', effect: { yinxu: 3 } },
    ],
  },
  {
    id: 'coat_texture',
    question: '舌苔的厚薄与润泽？',
    tip: '苔是薄薄均匀，还是厚厚一层、腻滑或干',
    options: [
      { label: '薄而均匀（常见）', effect: {} },
      { label: '厚腻', hint: '苔厚且黏腻', effect: { tanshi: 3 } },
      { label: '厚而干', effect: { shire: 2, yinxu: 1 } },
      { label: '少而干', effect: { yinxu: 3 } },
      { label: '水滑多津', hint: '苔面水滑湿润', effect: { yangxu: 2, tanshi: 1 } },
    ],
  },
  {
    id: 'teeth',
    question: '舌头边缘有齿痕吗？',
    tip: '看舌边是否被牙齿压出印子',
    options: [
      { label: '没有明显齿痕（常见）', effect: {} },
      { label: '轻度齿痕', effect: { qixu: 2, tanshi: 1 } },
      { label: '明显齿痕（胖大舌）', hint: '舌体胖大、齿印清晰', effect: { qixu: 3, tanshi: 2 } },
    ],
  },
  {
    id: 'moist',
    question: '舌面的润燥感觉？',
    tip: '舌面润泽，还是偏干、或滑腻多津',
    options: [
      { label: '润泽（常见）', effect: {} },
      { label: '偏干 / 少津', effect: { yinxu: 3, shire: 1 } },
      { label: '滑腻多津', effect: { tanshi: 2, yangxu: 1 } },
    ],
  },
]

export interface TongueResult {
  primary: ConstitutionType
  secondary?: ConstitutionType
  scores: Record<string, number>
  /** 命中的舌象特征描述（用于结果页「为什么这样提示」回放） */
  picked: { question: string; label: string; hint?: string }[]
}

/** 偏颇质最高分低于该阈值时，判定为平和质（与 constitution-test 一致） */
const PINGHE_THRESHOLD = 3

/** 根据 5 项望舌答案计算体质倾向（平和质为阈值兜底，非选项主动加分） */
export function calculateTongueResult(answers: number[]): TongueResult {
  const scores: Record<string, number> = {}
  for (const key of Object.keys(CONSTITUTION_TYPES)) scores[key] = 0

  const picked: TongueResult['picked'] = []
  for (let i = 0; i < TONGUE_QUESTIONS.length; i++) {
    const q = TONGUE_QUESTIONS[i]
    const idx = answers[i]
    if (idx === undefined || idx < 0 || idx >= q.options.length) continue
    const opt = q.options[idx]
    picked.push({ question: q.question, label: opt.label, hint: opt.hint })
    for (const [k, pts] of Object.entries(opt.effect)) {
      if (k in CONSTITUTION_TYPES) scores[k] = (scores[k] || 0) + (pts ?? 0)
    }
  }

  const biased = Object.entries(scores).filter(([k]) => k !== 'pinghe')
  const sorted = biased.sort((a, b) => b[1] - a[1])

  let primaryKey: string
  if (sorted.length === 0 || sorted[0][1] < PINGHE_THRESHOLD) primaryKey = 'pinghe'
  else primaryKey = sorted[0][0]
  const primary = CONSTITUTION_TYPES[primaryKey as ConstitutionKey]

  let secondary: ConstitutionType | undefined
  if (primaryKey !== 'pinghe' && sorted.length >= 2) {
    const second = sorted[1]
    if (second[1] >= 4 && sorted[0][1] - second[1] <= 5) {
      secondary = CONSTITUTION_TYPES[second[0] as ConstitutionKey]
    }
  }

  return { primary, secondary, scores, picked }
}
