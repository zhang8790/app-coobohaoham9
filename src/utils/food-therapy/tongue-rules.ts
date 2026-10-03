/**
 * 舌象自检规则引擎（纯本地 · 零网络 · 界面不出现「AI」二字）
 * ----------------------------------------------------------------------------
 * 定位：食养参考，不是中医诊断。两种喂入方式：
 *   ① 主路径：拍舌面 + 舌下两张照片 → 望舌识别引擎（视觉模型，服务端）返回特征标签
 *      → mapLabelsToAnswers 映射为 answers → 本引擎出倾向，全程用户无需勾选；
 *   ② 兜底路径：识别服务不可用时，用户按「引导对照」逐项勾选。
 * 引擎按传统饮食文化常识做规则映射，给出体质倾向提示，供食养搭配参考。
 *
 * 与 constitution-test 同源：复用 CONSTITUTION_TYPES 的体质 key 与计分阈值逻辑，
 * 但输入维度是八项望舌结构化特征：舌体形态 / 舌质颜色 / 舌苔颜色 / 舌苔厚薄 / 齿痕 / 裂纹 / 润燥 / 舌下络脉。
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
 * 八项望舌结构化特征维度。每条选项的 effect 是「对该体质倾向的加分」，
 * 中性/正常表现 effect 为空，不给任何体质加分（避免人人平和的偏置）。
 * 映射依据：传统饮食文化常识里舌象与寒/热/虚/湿/瘀的对应，仅作食养参考。
 */
export const TONGUE_QUESTIONS: TongueQuestion[] = [
  {
    id: 'area',
    question: '舌体形态 / 区域（胖瘦大小）？',
    tip: '看舌体本身大小：是否胖大抵齿、或瘦薄娇小',
    options: [
      { label: '正常大小（常见）', effect: {} },
      { label: '胖大（伸舌抵齿）', hint: '舌体胖嫩、两边抵到牙齿', effect: { qixu: 3, yangxu: 2, tanshi: 2 } },
      { label: '瘦薄娇小', hint: '舌体偏瘦、薄而小', effect: { yinxu: 3, qixu: 1 } },
    ],
  },
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
    id: 'crack',
    question: '舌面上有裂纹吗？',
    tip: '看舌面是否有深浅不一的裂纹、裂沟',
    options: [
      { label: '没有明显裂纹（常见）', effect: {} },
      { label: '有裂纹 / 裂沟', hint: '舌面有裂纹或人字纹', effect: { yinxu: 2, shire: 1, xueyu: 1 } },
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
  {
    id: 'sublingual',
    question: '舌下络脉（舌底青筋）的状态？',
    tip: '微微卷舌，看舌底两侧青筋（舌下静脉）',
    options: [
      { label: '淡红、细而短（常见）', effect: {} },
      { label: '偏青紫、略粗', hint: '舌底青筋偏青紫、稍粗', effect: { xueyu: 2 } },
      { label: '青紫明显 / 曲张如小鱼', hint: '舌底青筋粗黑、迂曲', effect: { xueyu: 3 } },
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

/**
 * 标签归一化：忽略空格 / 全角空格 / 括号补充说明 / 常见标点，便于与识别引擎返回做宽容匹配。
 * 例：「偏淡白（颜色发浅）」→「偏淡白」；「少苔 / 无苔（舌面光红）」→「少苔/无苔」。
 */
function normLabel(s: string): string {
  return s
    .replace(/[\s\u3000]/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[，,。.、；;：:]/g, '')
    .toLowerCase()
}

/** 在候选标签里为模型返回的原始文本找最相近的一项，找不到返回 -1 */
function matchOptionIndex(labels: string[], raw: string): number {
  const r = normLabel(raw)
  if (r.length < 2) return -1
  // 1) 归一化后完全相同
  for (let i = 0; i < labels.length; i++) if (normLabel(labels[i]) === r) return i
  // 2) 互为包含（模型少写 / 多写括注或副标题）
  for (let i = 0; i < labels.length; i++) {
    const n = normLabel(labels[i])
    if (n.includes(r) || r.includes(n)) return i
  }
  // 3) 斜杠前的主名相同（如「淡红 / 粉红」「偏干 / 少津」）
  const head = r.split('/')[0]
  if (head.length >= 2) {
    for (let i = 0; i < labels.length; i++) {
      if (normLabel(labels[i]).split('/')[0] === head) return i
    }
  }
  return -1
}

/**
 * 把「望舌识别引擎」返回的舌象特征标签映射为规则引擎所需的 answers:number[]。
 * 入参 features 的 key 与 TONGUE_QUESTIONS 的 id 对应（area/color/coat_color/coat_texture/teeth/crack/moist/sublingual）。
 * 宽容策略（目标是「尽量自动出结果」，不轻易打断用户）：
 *   - 标签命中（含近似措辞）→ 用对应下标；
 *   - 维度缺失或个别标签认不出 → 该维默认中性（第一项，effect 为空）；
 *   - 命中维度少于 3 个（结果不可信）→ 返回 null，端上提示重试。
 */
export function mapLabelsToAnswers(features: Record<string, string>): number[] | null {
  if (!features || typeof features !== 'object') return null
  const answers: number[] = []
  let hit = 0
  for (const q of TONGUE_QUESTIONS) {
    const raw = features[q.id]
    const idx = typeof raw === 'string' ? matchOptionIndex(q.options.map((o) => o.label), raw) : -1
    if (idx >= 0) {
      answers.push(idx)
      hit++
    } else {
      answers.push(0)
    }
  }
  return hit >= 3 ? answers : null
}
