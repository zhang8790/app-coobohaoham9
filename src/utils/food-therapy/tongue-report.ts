/**
 * 舌象「全面分析报告」逻辑层（纯本地 · 零网络）
 * ----------------------------------------------------------------------------
 * 把「舌象自检」从「一个倾向名」升级为结构化食养分析报告，对齐健康报告三要素：
 *   ① 健康状态  —— 主倾向 + 兼有倾向的合成结论
 *   ② 发生机制  —— 该倾向「可能和哪些日常习惯有关」的成因参考（非诊断）
 *   ③ 健康指数  —— 0~100 量化评分 + 风险分级 + 复测建议 + 复测趋势
 *
 * 合规铁律：全程「食养参考 / 倾向」，不出现诊断 / 治疗 / 疗效词；
 * 所有面向用户的成因文案在模块加载时统一过 shieldCopy()，命中违禁词自动净化，
 * 杜绝「调理 / 祛湿 / 清热 / 健脾」等医疗或功效感词语流出到界面。
 */

import { shieldCopy } from '@/utils/compliance/shield'
import type { TongueResult } from '@/utils/food-therapy/tongue-rules'

// ── ① 健康指数 ─────────────────────────────────────────────────────────────

export type RiskBand = 'low' | 'mid' | 'high'

export interface TongueHealthIndex {
  /** 0~100，保留一位小数；越高越均衡 */
  score: number
  band: RiskBand
  /** 风险分级文案，如「中等风险状态」 */
  bandLabel: string
  /** 完整建议句，如「属于中等风险状态，建议您一周后再次检测。」 */
  advice: string
  /** 建议复测间隔（天） */
  retestDays: number
  /** 与分级对应的主色 */
  color: string
  /** 置信区间 [下界, 上界]（由置信度折算宽度，越不确定越宽） */
  ci: [number, number]
  /** 本次置信度（0~1） */
  confidence: number
}

/** 风险分级配色（与设计系统一致：绿=均衡 / 琥珀=中等 / 红=偏颇明显） */
export const BAND_META: Record<RiskBand, { label: string; retestDays: number; retestText: string; color: string }> = {
  low: { label: '低风险状态', retestDays: 30, retestText: '30 天', color: '#15803D' },
  mid: { label: '中等风险状态', retestDays: 7, retestText: '一周', color: '#B45309' },
  high: { label: '偏高风险状态', retestDays: 3, retestText: '3 天', color: '#DC2626' },
}

function bandOf(score: number): RiskBand {
  if (score >= 85) return 'low'
  if (score >= 70) return 'mid'
  return 'high'
}

/**
 * 由体质计分折算健康指数（确定性、可解释、可单测）。
 * 模型：以 96 为「均衡基线」，主倾向每分扣 3.2、兼有倾向每分扣 1.8（兼有影响减半权），
 * 结果夹在 [35, 97]，保留一位小数。平和质（无偏颇加分）自然落到 96 分左右。
 *
 * 直观校准：平和≈96 / 单项 5 分≈80 / 主 6 分+兼 3 分≈71.4（对齐截图 73.3 量级）。
 */
export function computeHealthIndex(result: TongueResult, confidence = 0.8): TongueHealthIndex {
  const pKey = result.primary?.key
  const P = pKey && pKey !== 'pinghe' ? result.scores[pKey] || 0 : 0
  const Q = result.secondary ? result.scores[result.secondary.key] || 0 : 0

  const conf = Math.max(0.5, Math.min(0.95, confidence))
  const raw = 96 - P * 3.2 - Q * 1.8
  const score = Math.round(Math.max(35, Math.min(97, raw)) * 10) / 10
  const band = bandOf(score)
  const meta = BAND_META[band]

  // 置信区间：置信度越低越宽（±(1-conf)*16），并夹在 [0,100]
  const half = Math.round((1 - conf) * 16 * 10) / 10
  const ci: [number, number] = [
    Math.round(Math.max(0, score - half) * 10) / 10,
    Math.round(Math.min(100, score + half) * 10) / 10,
  ]

  return {
    score,
    band,
    bandLabel: meta.label,
    advice: `属于${meta.label}，建议您${meta.retestText}后再次检测。`,
    retestDays: meta.retestDays,
    color: meta.color,
    ci,
    confidence: conf,
  }
}

// ── ② 发生机制文案库（8 体质，全部过合规护栏） ─────────────────────────────

export interface TongueMechanism {
  /** 一句总述 */
  general: string
  /** 3~4 条成因参考 */
  items: string[]
}

/** 原始文案（写完后统一净化，避免逐条漏检） */
const RAW_MECHANISM: Record<string, TongueMechanism> = {
  yangxu: {
    general: '多与体内阳气偏弱、温煦不足有关；身体像「火力」偏小，怕冷、容易疲乏。',
    items: [
      '先天禀赋不足——天生阳气偏弱，从小手脚就比同龄人凉。',
      '久处寒凉——常吹空调冷风、贪食生冷冰饮，寒气长期停留在体内。',
      '作息耗损——长期晚睡、过度劳累，身体的「火力」被一点点消耗。',
      '缺乏活动——久坐少动，气血运行偏慢，暖意到不了四肢末梢。',
    ],
  },
  yinxu: {
    general: '多与体内津液偏少、整体偏「燥」有关；像缺了水的机器，容易发干、发热。',
    items: [
      '熬夜耗津——长期晚睡，身体来不及生成与保存水分。',
      '辛辣煎炸——爱吃辣、油炸、烧烤，燥热一点点积累。',
      '情绪紧张——长期焦虑急躁，也会让身体消耗得更快。',
      '劳作过度——高强度用脑或运动，消耗大于恢复。',
    ],
  },
  qixu: {
    general: '多与气的推动力量不足有关；身体像电量偏低，稍一活动就容易累。',
    items: [
      '先天不足或久病——底子偏弱，恢复偏慢。',
      '饮食不规律——三餐不定、节食，气血来源不足。',
      '思虑劳倦——长期操心、熬夜，气被一点点消耗。',
      '缺乏锻炼——久坐少动，气的运行也随之变弱。',
    ],
  },
  tanshi: {
    general: '多与体内水湿的运化不及有关；水液停聚偏多，身体发沉、舌苔厚腻。',
    items: [
      '嗜食肥甘——爱吃甜食、油炸、奶茶，加重脾胃负担。',
      '久坐少动——活动偏少，水湿不易代谢排出。',
      '环境潮湿——长期处在湿冷环境，外湿引动内湿。',
      '三餐不规律——脾胃运化变弱，湿气越积越多。',
    ],
  },
  shire: {
    general: '多因感受湿与热之邪，或嗜食肥甘厚味、饮食不节，湿与热蕴结于内所致。',
    items: [
      '湿郁日久化热——体内水液代谢偏慢，湿气长期停聚而化热。',
      '体内有湿又感热邪——本身运化偏弱、内有湿气，再遇热邪侵扰，湿与热交杂。',
      '饮食失宜——饮食不规律，或偏食甜食、油炸等高热量食物，运化不及而内热渐生。',
      '运动不足——久坐少动，体内代谢产物不能及时排出，积久成湿热。',
    ],
  },
  xueyu: {
    general: '多与气血运行不畅有关；运行一慢，容易在局部停住，出现瘀斑、唇色偏暗。',
    items: [
      '久坐少动——长时间不动，气血循环变慢。',
      '受寒受凉——寒气会让血流更加凝滞。',
      '情绪郁结——长期心情不畅，气行受阻，血行随之不畅。',
      '外伤或劳损——磕碰、旧伤也会留下瘀滞。',
    ],
  },
  qiyu: {
    general: '多与情绪长期不畅、气的舒展不够有关；心里憋着，身体也跟着紧。',
    items: [
      '压力长期累积——工作生活压力大，情绪无处释放。',
      '思虑过多——想得太多，气容易打结。',
      '缺少倾诉与运动——闷着不动，气更难舒展。',
      '作息颠倒——晚睡熬夜也会加重情绪起伏。',
    ],
  },
  pinghe: {
    general: '你的各项舌象特征偏中性、整体较均衡，这是比较理想的状态。',
    items: [
      '饮食有节——三餐规律、荤素搭配，是均衡的基础。',
      '作息规律——睡眠充足，身体有足够时间自我修整。',
      '心态平稳——情绪起伏小，气血运行顺畅。',
      '适度活动——保持一定运动量，让身体维持在舒适区间。',
    ],
  },
}

/** 净化后的机制文案库（模块加载即过一遍合规护栏，界面直接取用） */
export const TONGUE_MECHANISM: Record<string, TongueMechanism> = Object.fromEntries(
  Object.entries(RAW_MECHANISM).map(([k, v]) => [
    k,
    {
      general: shieldCopy(v.general).safe,
      items: v.items.map((s) => shieldCopy(s).safe),
    },
  ]),
)

/** 取某体质的机制文案；未知 key 回退平和质文案 */
export function getMechanism(constitutionKey: string): TongueMechanism {
  return TONGUE_MECHANISM[constitutionKey] || TONGUE_MECHANISM.pinghe
}

// ── ③ 复测历史见 tongue-history.ts（拆出以保持本模块纯函数、可单测，不牵连 Taro） ──
