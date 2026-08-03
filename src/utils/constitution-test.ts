/**
 * 体质快速测试引擎
 * 5道题 → 9种体质 → 推荐/慎用食材 + 推荐商品性味
 * 纯前端本地计算，不依赖网络
 */

import type { Product } from '@/db/types'
import { deriveProductStage, type ShiyangStage } from '@/utils/food-therapy/shiyang-stage'

// ── 体质定义 ──────────────────────────────────────────────────────────────

export interface ConstitutionType {
  key: string
  name: string
  emoji: string
  color: string         // 主色
  colorLight: string    // 浅色背景
  description: string   // 一句话体质描述
  characteristics: string[]  // 典型表现
  recommendNature: string[] // 宜食性味（对应 overall_nature）
  avoidNature: string[]     // 忌食性味
  recommendFoods: string[]   // 推荐食材 key
  avoidFoods: string[]      // 慎用食材 key
  healthGoals: string[]     // 对应健康目标
  bodyStates: string[]      // 对应 BODY_CROWD_OPTIONS
  recommendStage: ShiyangStage // 对应「清通调补固」调理阶段，用于「按调理路径」精准配对
}

export const CONSTITUTION_TYPES: Record<string, ConstitutionType> = {
  yangxu: {
    key: 'yangxu',
    name: '阳虚质',
    emoji: '🧊',
    color: '#3B82F6',
    colorLight: '#EFF6FF',
    description: '畏寒怕冷，手脚冰凉，容易疲劳',
    characteristics: ['手脚常年偏凉', '怕冷喜热', '容易疲劳乏力', '换季容易感冒'],
    recommendNature: ['温热', '微温', '平性'],
    avoidNature: ['大寒', '寒凉'],
    recommendFoods: ['jiang', 'yangrou', 'guiyuan', 'hongzao', 'hetao', 'nangua'],
    avoidFoods: ['lvdou', 'yinmi', 'kugua', 'xiangjiao'],
    healthGoals: ['补气养血', '温中散寒'],
    bodyStates: ['体虚怕冷'],
    recommendStage: '补',
  },
  yinxu: {
    key: 'yinxu',
    name: '阴虚质',
    emoji: '🔥',
    color: '#EF4444',
    colorLight: '#FFF1F2',
    description: '口干咽燥，容易上火，手心发热',
    characteristics: ['经常觉得口干', '容易上火冒痘', '手脚心发热', '睡眠偏浅易醒'],
    recommendNature: ['寒凉', '微寒', '平性'],
    avoidNature: ['温热', '大热', '微温'],
    recommendFoods: ['梨', 'lvdou', 'yinmi', 'muer', 'jinyinhua', 'lianou'],
    avoidFoods: ['yangrou', 'jiang', 'dasuan', 'hetao', 'cong'],
    healthGoals: ['滋阴润燥', '清热降火'],
    bodyStates: ['易上火'],
    recommendStage: '清',
  },
  qixu: {
    key: 'qixu',
    name: '气虚质',
    emoji: '🌬️',
    color: '#8B5CF6',
    colorLight: '#F5F3FF',
    description: '气短懒言，容易疲乏，抵抗力偏弱',
    characteristics: ['说话声音偏轻', '容易疲乏', '稍微活动就气喘', '容易感冒'],
    recommendNature: ['平性', '微温', '温热'],
    avoidNature: ['大寒', '寒凉'],
    recommendFoods: ['hongzao', 'hetao', 'paigu', 'jirou', 'guiyuan', 'nangua'],
    avoidFoods: ['kugua', 'lvdou'],
    healthGoals: ['补气养血', '健脾养胃'],
    bodyStates: ['体虚怕冷'],
    recommendStage: '补',
  },
  tanshi: {
    key: 'tanshi',
    name: '痰湿质',
    emoji: '💧',
    color: '#6B7280',
    colorLight: '#F9FAFB',
    description: '身体困重，舌苔厚腻，面部易出油',
    characteristics: ['总觉得身体沉沉的', '舌苔厚腻', '面部或头发容易出油', '大便黏滞'],
    recommendNature: ['平性', '凉性', '寒性'],
    avoidNature: ['温热', '大热', '微温'],
    recommendFoods: ['yinmi', 'bailuobo', 'lianou', 'doufu', 'donggua', 'huanggua'],
    avoidFoods: ['yangrou', 'jirou', 'hetao', 'dasuan'],
    healthGoals: ['利水消肿', '清热降火'],
    bodyStates: [],
    recommendStage: '通',
  },
 shire: {
    key: 'shire',
    name: '湿热质',
    emoji: '🌿',
    color: '#22C55E',
    colorLight: '#F0FDF4',
    description: '面部油光，易长痘，嘴里发苦',
    characteristics: ['脸上容易出油长痘', '嘴里偶尔发苦', '大便偏干或黏滞', '脾气偏急'],
    recommendNature: ['寒凉', '微寒', '平性'],
    avoidNature: ['温热', '大热', '微温'],
    recommendFoods: ['lvdou', 'yinmi', 'muer', 'huanggua', 'donggua', 'kugua'],
    avoidFoods: ['yangrou', 'jirou', 'jiang', 'hetao', 'cong', 'dasuan'],
    healthGoals: ['清热降火', '利水消肿'],
    bodyStates: ['易上火'],
    recommendStage: '清',
  },
  xueyu: {
    key: 'xueyu',
    name: '血瘀质',
    emoji: '🩸',
    color: '#EC4899',
    colorLight: '#FDF2F8',
    description: '容易出现瘀斑，嘴唇颜色偏暗',
    characteristics: ['磕碰后容易留瘀青', '嘴唇颜色偏暗', '面色晦暗', '偶尔局部疼痛'],
    recommendNature: ['平性', '温性', '微温'],
    avoidNature: ['大寒'],
    recommendFoods: ['nangua', 'lianou', 'shanzha', 'cong', 'dasuan', 'hongzao'],
    avoidFoods: [],
    healthGoals: [],
    bodyStates: [],
    recommendStage: '固',
  },
  qiyu: {
    key: 'qiyu',
    name: '气郁质',
    emoji: '🌙',
    color: '#F59E0B',
    colorLight: '#FFFBEB',
    description: '情绪波动大，容易焦虑或低落',
    characteristics: ['情绪起伏较大', '容易焦虑或低落', '睡眠不太稳定', '对压力敏感'],
    recommendNature: ['平性', '微温', '温性'],
    avoidNature: ['大寒', '寒凉'],
    recommendFoods: ['guiyuan', 'shanzha', 'muer', 'lianou', 'nangua', 'hetao'],
    avoidFoods: [],
    healthGoals: ['舒缓安适', '补气养血'],
    bodyStates: [],
    recommendStage: '调',
  },
  pinghe: {
    key: 'pinghe',
    name: '平和质',
    emoji: '☯️',
    color: '#16A34A',
    colorLight: '#F0FDF4',
    description: '身体状态较好，饮食睡眠正常',
    characteristics: ['睡眠质量不错', '胃口正常', '情绪相对稳定', '换季少生病'],
    recommendNature: ['平性', '微温', '微寒'],
    avoidNature: [],
    recommendFoods: ['lianou', 'fanqie', 'bailuobo', 'doufu', 'baicai', 'nangua'],
    avoidFoods: [],
    healthGoals: ['健脾养胃'],
    bodyStates: [],
    recommendStage: '固',
  },
}

// ── 测试题目 ──────────────────────────────────────────────────────────────

export interface TestQuestion {
  id: number
  question: string
  hint: string
  options: { label: string; value: number; effect: Partial<Record<ConstitutionKey, number>> }[]
}

/** 0=A, 1=B, 2=C, 3=D 对各体质的加分影响 */
type ConstitutionKey = keyof typeof CONSTITUTION_TYPES

/**
 * 题目设计原则（消除「人人平和质」偏置）：
 *  - 每题第 1 项「基本没有 / 说不清」为中性基线，effect 为空，不给任何体质加分；
 *    旧版该基线给平和质 +3，导致几乎人人测出平和，个性化形同虚设。
 *  - 平和质不再由选项主动加分，仅在「所有偏颇质最高分低于阈值」时作为兜底判定；
 *  - 每题只给与之强相关的偏颇质加分，覆盖 yangxu/yinxu/qixu/tanshi/shire/xueyu/qiyu 七类区分。
 */
export const TEST_QUESTIONS: TestQuestion[] = [
  {
    id: 1,
    question: '平时怕冷吗？',
    hint: '手脚温度、对冷的耐受',
    options: [
      { label: '手脚温暖，基本不怕冷', value: 0, effect: {} },
      { label: '偶尔怕冷，手脚偏凉', value: 1, effect: { yangxu: 2, qixu: 1 } },
      { label: '经常手脚冰凉', value: 2, effect: { yangxu: 3, qixu: 2 } },
      { label: '一年四季都怕冷，夏天也凉', value: 3, effect: { yangxu: 4, xueyu: 1 } },
    ],
  },
  {
    id: 2,
    question: '容易上火吗？',
    hint: '口干 / 冒痘 / 口腔溃疡等',
    options: [
      { label: '很少上火', value: 0, effect: {} },
      { label: '换季或熬夜时偶尔上火', value: 1, effect: { yinxu: 2, shire: 1 } },
      { label: '经常觉得口干、咽干', value: 2, effect: { yinxu: 3, shire: 2 } },
      { label: '频繁冒痘、口腔溃疡', value: 3, effect: { shire: 3, yinxu: 1, xueyu: 1 } },
    ],
  },
  {
    id: 3,
    question: '胃口和消化怎么样？',
    hint: '吃完饭后的感受',
    options: [
      { label: '胃口好，消化正常', value: 0, effect: {} },
      { label: '偶尔腹胀、容易累', value: 1, effect: { qixu: 2, tanshi: 1 } },
      { label: '经常腹胀、食欲不振', value: 2, effect: { qixu: 2, tanshi: 3 } },
      { label: '吃点就胀，大便偏黏', value: 3, effect: { tanshi: 4, qixu: 1 } },
    ],
  },
  {
    id: 4,
    question: '面色和气血怎么样？',
    hint: '唇色、气色、是否易留瘀青',
    options: [
      { label: '面色红润，精力尚可', value: 0, effect: {} },
      { label: '偶尔疲乏，气色一般', value: 1, effect: { qixu: 1 } },
      { label: '唇色偏暗、磕碰易留瘀青', value: 2, effect: { xueyu: 3, qixu: 1 } },
      { label: '面色晦暗、常现瘀斑', value: 3, effect: { xueyu: 4 } },
    ],
  },
  {
    id: 5,
    question: '情绪状态怎么样？',
    hint: '最近一个月的总体感受',
    options: [
      { label: '情绪平稳，心态不错', value: 0, effect: {} },
      { label: '偶尔焦虑或低落', value: 1, effect: { qiyu: 2 } },
      { label: '常感压力大、烦躁', value: 2, effect: { qiyu: 3 } },
      { label: '情绪起伏大，较难自控', value: 3, effect: { qiyu: 4, yinxu: 1 } },
    ],
  },
]

// ── 评分引擎 ──────────────────────────────────────────────────────────────

export interface TestResult {
  primary: ConstitutionType
  secondary?: ConstitutionType
  scores: Record<string, number>
}

/** 偏颇质最高分低于该阈值时，判定为平和质（消除旧版「选健康选项就 +3 平和」的虚假偏置） */
const PINGHE_THRESHOLD = 3

/** 根据5道题答案计算体质得分（平和质为阈值兜底，非选项主动加分） */
export function calculateResult(answers: number[]): TestResult {
  const scores: Record<string, number> = {}
  for (const key of Object.keys(CONSTITUTION_TYPES)) {
    scores[key] = 0
  }

  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const q = TEST_QUESTIONS[i]
    const answerIdx = answers[i]
    if (answerIdx === undefined || answerIdx < 0 || answerIdx >= q.options.length) continue
    const option = q.options[answerIdx]
    for (const [ctype, pts] of Object.entries(option.effect)) {
      if (ctype in CONSTITUTION_TYPES) {
        scores[ctype] = (scores[ctype] || 0) + (pts ?? 0)
      }
    }
  }

  // 排除平和质，找偏颇质中的最高分（消除旧版「选健康选项就+3平和」的虚假偏置）
  const biased = Object.entries(scores).filter(([k]) => k !== 'pinghe')
  const sorted = biased.sort((a, b) => b[1] - a[1])

  let primaryKey: string
  if (sorted.length === 0 || sorted[0][1] <= PINGHE_THRESHOLD) {
    primaryKey = 'pinghe'
  } else {
    primaryKey = sorted[0][0]
  }
  const primary = CONSTITUTION_TYPES[primaryKey as keyof typeof CONSTITUTION_TYPES]

  // 次体质：第2名分数≥4 且与第1名分差≤5 才展示
  let secondary: ConstitutionType | undefined
  if (primaryKey !== 'pinghe' && sorted.length >= 2) {
    const second = sorted[1]
    if (second[1] >= 4 && sorted[0][1] - second[1] <= 5) {
      secondary = CONSTITUTION_TYPES[second[0] as keyof typeof CONSTITUTION_TYPES]
    }
  }

  return { primary, secondary, scores }
}

// ── 商品推荐 ──────────────────────────────────────────────────────────────

/** 根据体质筛选适合的商品 */
export function filterProductsByConstitution(
  products: Product[],
  constitution: ConstitutionType,
): { good: Product[]; caution: Product[] } {
  const good: Product[] = []
  const caution: Product[] = []

  for (const product of products) {
    const nature = product.overall_nature || '平性'
    if (constitution.avoidNature.includes(nature)) {
      caution.push(product)
    } else if (constitution.recommendNature.includes(nature)) {
      good.push(product)
    } else {
      // 平性食品全部放 good
      if (nature === '平性') good.push(product)
    }
  }

  return { good, caution }
}

/** 体质 → BODY_CROWD_OPTIONS 映射 */
export function constitutionToCrowds(constitution: ConstitutionType): string[] {
  return constitution.bodyStates
}

/** 体质 → 健康目标映射 */
export function constitutionToGoals(constitution: ConstitutionType): string[] {
  return constitution.healthGoals
}

// ── 按「清通调补固」阶段配对 ──────────────────────────────────────────────

/**
 * 按体质对应的「清通调补固」调理阶段，精准配对商品。
 * 复用详情页已建好的阶段引擎：
 *   · 商品阶段优先取商家人工标注 food_stage，否则由核心食材主导功效确定性派生；
 *   · 与 filterProductsByConstitution（按性味广筛）互补，是「调理路径」这一叙事层的深一层配对。
 * @param excludeIds 需排除的商品 id（通常传性味适配好物，避免与上层推荐撞车）
 */
export function recommendStageProducts(
  products: Product[],
  stage: ShiyangStage,
  limit = 6,
  excludeIds?: Set<string>,
): Product[] {
  const matched: Product[] = []
  for (const p of products) {
    if (excludeIds && p.id && excludeIds.has(p.id)) continue
    const s = deriveProductStage(p.ingredients, p.food_stage)
    if (s === stage) matched.push(p)
  }
  return matched.slice(0, limit)
}
