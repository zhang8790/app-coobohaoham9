// 用户画像感知食疗分析引擎（V1 个性化核心，纯函数，零后端改动）
// ----------------------------------------------------------------------------
// 输入：商品 Product + 用户结构化画像 UserHealthProfile
// 输出：安全等级（复用 classifyProduct）+ 过敏原强预警 + 慢病/体质禁忌
//       + 食养契合度 profile-fit(0~100) + 个性化一句话点评（过 shieldCopy）
//
// 设计：完全复用现有引擎（classifyProduct / symptom-rules / resolveNature），
//       仅在其上加「用户维度」交叉比对，不重写既有逻辑。

import type { Product, UserHealthProfile } from '@/db/types'
import { toFoodTherapyInput, type Crowd, type FitTier } from './types'
import { classifyProduct } from './classifier'
import { getRuleById } from './symptom-rules'
import { resolveNature } from './nature'
import { profileToCrowds } from './profile-map'
import { ALLERGEN_DICT } from '@/utils/allergen-dictionary'
import { shieldCopy, FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'

const ALLERGEN_BY_KEY = Object.fromEntries(ALLERGEN_DICT.map((a) => [a.key, a]))

// 身体状态 / 慢病标签 → symptom-rules 规则 id（V1 覆盖有对应规则项）
const CROWD_RULE_MAP: Record<string, string> = {
  宫寒量少: 'menstruation',
  喉咙肿痛: 'throat-sore',
  易上火: 'constitution-fire',
  体虚怕冷: 'constitution-cold',
  脾胃虚寒: 'constitution-spleen',
  肠胃虚弱: 'constitution-spleen',
  失眠: 'constitution-sleep',
}

export interface ProfileAnalysisReport {
  /** 是否具备可用于个性化的画像（有 crowd 或过敏原即视为有） */
  hasProfile: boolean
  /** 由画像推导出的食疗人群（供 UI 展示） */
  crowds: Crowd[]
  /** 适配分档：recommend / caution / avoid / null（未命中任何栏） */
  tier: FitTier | null
  /** 过敏原强预警（用户过敏 ∩ 商品致敏原） */
  allergenHits: { key: string; name: string; severity: string }[]
  /** 慢病 / 体质禁忌说明（已 shield） */
  contraindications: string[]
  /** 食养契合度 0~100（对本用户的个性化分数） */
  profileFit: number
  /** 个性化一句话点评（已 shield） */
  comment: string
  /** 强制免责声明 */
  disclaimer: string
}

export function analyzeForProfile(
  product: Product,
  profile: UserHealthProfile | null,
): ProfileAnalysisReport {
  const hasProfile =
    !!profile &&
    (profileToCrowds(profile).length > 0 || (profile.allergies ?? []).length > 0)

  const crowds = profileToCrowds(profile)
  const input = toFoodTherapyInput(product)
  const tier = classifyProduct(input, crowds, null)
  const nature = resolveNature(product)

  // 1) 过敏原强预警
  const allergenHits: { key: string; name: string; severity: string }[] = []
  const userAllergies = (profile?.allergies ?? []).filter(Boolean)
  const productAllergens = (product.allergens ?? []).filter(Boolean)
  if (userAllergies.length && productAllergens.length) {
    for (const key of productAllergens) {
      if (userAllergies.includes(key) && ALLERGEN_BY_KEY[key]) {
        allergenHits.push({ key, name: ALLERGEN_BY_KEY[key].name, severity: ALLERGEN_BY_KEY[key].severity })
      }
    }
  }

  // 2) 慢病 / 体质禁忌（按 symptom-rules 比对性味 / 标签）
  const contraindications: string[] = []
  const tags = (product.health_tag ?? []).filter(Boolean)
  const profileStates = [
    ...(profile?.body_states ?? []),
    ...(profile?.chronic_conditions ?? []),
  ].filter(Boolean) as string[]
  for (const state of profileStates) {
    const rule = getRuleById(CROWD_RULE_MAP[state])
    if (!rule) continue
    if (nature && (rule.banNatures as string[]).includes(nature)) {
      contraindications.push(`您${state}，本品性${nature}，建议谨慎`)
    }
    const bannedTag = tags.find((t) => (rule.banHealthTags as string[]).includes(t))
    if (bannedTag) {
      contraindications.push(`您${state}，本品含「${bannedTag}」，建议谨慎`)
    }
  }
  // 慢病营养提示（仅当商品有结构化营养字段）
  const nut = product.nutrition
  if (nut) {
    if ((profile?.chronic_conditions ?? []).includes('高血糖') && (nut.sugar_g ?? 0) >= 15) {
      contraindications.push(`高血糖人群宜少糖，本品每 100g 含糖约 ${nut.sugar_g}g`)
    }
    if ((profile?.chronic_conditions ?? []).includes('高血压') && (nut.sodium_mg ?? 0) >= 400) {
      contraindications.push(`高血压人群宜低盐，本品每 100g 钠约 ${nut.sodium_mg}mg`)
    }
    if ((profile?.chronic_conditions ?? []).includes('高血脂') && (nut.fat_g ?? 0) >= 20) {
      contraindications.push(`高血脂人群宜低脂，本品每 100g 脂肪约 ${nut.fat_g}g`)
    }
  }

  // 3) 食养契合度 profile-fit 0~100
  let fit = 50
  if (tier === 'recommend') fit += 25
  else if (tier === 'caution') fit += 10
  else if (tier === 'avoid') fit -= 30
  if (allergenHits.length > 0) fit -= 25
  for (const state of profileStates) {
    const rule = getRuleById(CROWD_RULE_MAP[state])
    if (rule && tags.some((t) => (rule.priorityHealthTags as string[]).includes(t))) fit += 8
  }
  fit = Math.max(0, Math.min(100, fit))

  // 4) 个性化点评（必须先过 shieldCopy 屏蔽医疗宣称）
  let rawComment = ''
  if (allergenHits.length > 0) {
    rawComment = `您对${allergenHits.map((a) => a.name).join('、')}过敏，本品含相关成分，请谨慎选择`
  } else if (tier === 'recommend') {
    const tag = profileStates
      .map((s) => getRuleById(CROWD_RULE_MAP[s])?.priorityHealthTags?.[0])
      .find(Boolean) as string | undefined
    rawComment = tag ? `您${profileStates[0]}，本品${tag}，正相宜` : '本品与您的体质相宜，可放心品尝'
  } else if (tier === 'avoid') {
    rawComment = `您${profileStates[0] ?? '体质偏特殊'}，本品暂不太适合，建议少食用`
  } else if (tier === 'caution') {
    rawComment = '本品对您属谨慎食用，适量为宜'
  } else {
    rawComment = '已结合您的体质参考，可酌情选择'
  }
  const comment = shieldCopy(rawComment).safe

  return {
    hasProfile,
    crowds,
    tier,
    allergenHits,
    contraindications: contraindications.map((c) => shieldCopy(c).safe),
    profileFit: fit,
    comment,
    disclaimer: FOOD_THERAPY_DISCLAIMER,
  }
}
