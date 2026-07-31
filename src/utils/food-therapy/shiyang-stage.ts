// 清通调补固 · 食养阶段引擎（统一视图层）
// ============================================================
// 设计原则：本模块不是与现有食疗引擎「并排」的两套东西，
// 而是从同一份食材数据（INGREDIENT_DICT）里「长」出来的一个叙事层：
//   · 食养定位栏 = 现有 overall_nature / ingredients 的升级表达
//   · 核心食材表 = 现有引擎逐食材输出的「标准化表格版」
//   · 搭配建议   = 现有配对关系的「阶段叙事」外衣
//   · 合规声明   = 现有 shield.ts 的自动脱敏 + 统一声明
// 所有面向用户的生成文案均过 shieldCopy() 自动规避医疗宣称违禁词。

import { INGREDIENT_DICT, type IngredientEntry } from '../shiyang-dictionary'
import { shieldCopy, FOOD_THERAPY_DISCLAIMER } from '../compliance/shield'

export type ShiyangStage = '清' | '通' | '调' | '补' | '固'

export const STAGE_ORDER: ShiyangStage[] = ['清', '通', '调', '补', '固']

export interface StageMeta {
  stage: ShiyangStage
  label: string        // 「清阶」
  coreTag: string      // 默认核心作用标签（商家可覆盖）
  desc: string         // 阶段一句话释义（用于定位栏兜底）
}

export const STAGE_META: Record<ShiyangStage, StageMeta> = {
  清: { stage: '清', label: '温和清润', coreTag: '温和清润', desc: '清润舒缓，给日常做减法' },
  通: { stage: '通', label: '轻畅疏通', coreTag: '轻畅舒畅', desc: '疏通调理，让身体更轻畅' },
  调: { stage: '调', label: '养护脾胃', coreTag: '养护脾胃', desc: '调和脾胃，养护运化之本' },
  补: { stage: '补', label: '温和补益', coreTag: '温和补益', desc: '温和补益，补足日常所需' },
  固: { stage: '固', label: '固本养护', coreTag: '固本养护', desc: '固本培元，稳住日常状态' },
}

// 食养作用关键词 → 阶段（确定性映射；单关键词仅归一个主导阶段，保证可复现）
const STAGE_KEYWORDS: Record<ShiyangStage, string[]> = {
  清: ['清热', '清火', '润燥', '生津', '利咽', '润喉', '舒喉', '润爽', '凉血', '祛火', '解暑', '清润', '疏风', '润肺', '润养', '润', '祛燥', '去火', '清润'],
  通: ['润肠', '消食', '化积', '消积', '助消化', '通肠', '化食', '清理肠道', '通便', '导滞', '化滞'],
  调: ['健脾', '和胃', '化湿', '运化', '养胃', '温中', '开胃', '食欲', '调和', '理气', '暖中'],
  补: ['补钙', '补虚', '补气血', '养血', '补血', '益血', '补蛋白', '补充营养', '营养', '温养', '滋补', '益气', '补气', '增营', '温补', '暖身'],
  固: ['固本', '收涩', '益肾', '固表', '补肾', '稳固', '培元', '固元'],
}

// 相邻阶段搭配（打底=上一阶，巩固=下一阶）。
// 清为调理起点 → 巩固落「调」，契合「先清后调、循序渐进」主线。
export const STAGE_NEIGHBORS: Record<ShiyangStage, { base: ShiyangStage | null; consolidate: ShiyangStage }> = {
  清: { base: null, consolidate: '调' },
  通: { base: '清', consolidate: '调' },
  调: { base: '通', consolidate: '补' },
  补: { base: '调', consolidate: '固' },
  固: { base: '补', consolidate: '清' },
}

// 阶段默认暖心一句话（无人工文案时兜底；过 shieldCopy 仍安全）
const STAGE_ONELINER: Record<ShiyangStage, string> = {
  清: '日常清润舒缓，适合需要温和清润、给身体做减法的时候。',
  通: '帮助身体保持轻畅，适合饮食油腻、需要疏通调理的时候。',
  调: '温和养护脾胃运化，适合日常调理、把底子慢慢养好的时候。',
  补: '温和补充营养，适合生长发育或日常需要多加一点的时候。',
  固: '固本培元、稳住状态，适合日常打底、长期温和养护的时候。',
}

// 通用合规声明（食品预包装合规 + 食养护栏合并，过 shieldCopy）
const UNIFIED_DISCLAIMER =
  '以上内容为传统食养文化与营养学常识分享，仅作日常饮食参考，不替代医疗诊断与治疗建议。'

function safe(text: string): string {
  return shieldCopy(text).safe
}

// ── 单食材 → 各阶段得分 ──
function scoreIngredientStage(entry: IngredientEntry): Record<ShiyangStage, number> {
  const score: Record<ShiyangStage, number> = { 清: 0, 通: 0, 调: 0, 补: 0, 固: 0 }
  const text = entry.benefits.join(' ')
  for (const st of STAGE_ORDER) {
    for (const kw of STAGE_KEYWORDS[st]) {
      if (text.includes(kw)) score[st] += 1
    }
  }
  return score
}

/**
 * 派生商品食养阶段：
 *  - 优先使用商家人工标注 override（food_stage 列）
 *  - 否则按 ingredients 主导功效确定性聚合，取最高分阶（并列按 STAGE_ORDER 优先）
 *  - 无任何命中返回 null（调用方优雅降级）
 */
export function deriveProductStage(
  ingredientKeys: string[] | null | undefined,
  override?: string | null,
): ShiyangStage | null {
  const ov = (override || '').trim()
  if (ov && (STAGE_ORDER as string[]).includes(ov)) return ov as ShiyangStage

  const entries = (ingredientKeys || [])
    .map((k) => INGREDIENT_DICT[k])
    .filter(Boolean) as IngredientEntry[]
  if (!entries.length) return null

  const total: Record<ShiyangStage, number> = { 清: 0, 通: 0, 调: 0, 补: 0, 固: 0 }
  for (const e of entries) {
    const s = scoreIngredientStage(e)
    for (const st of STAGE_ORDER) total[st] += s[st]
  }
  let best: ShiyangStage = '调'
  let bestScore = -1
  for (const st of STAGE_ORDER) {
    if (total[st] > bestScore) {
      bestScore = total[st]
      best = st
    }
  }
  return bestScore > 0 ? best : null
}

export interface StageIngredientRow {
  key: string
  name: string
  icon: string
  nature: string
  benefits: string[]   // 传统食养作用
  scenarios: string[]  // 适配场景
}

export interface ShiyangStageModule {
  stage: ShiyangStage | null
  label: string
  coreTag: string
  oneLiner: string
  ingredients: StageIngredientRow[]
  comboNarrative: string
  neighbors: { base: ShiyangStage | null; consolidate: ShiyangStage }
  disclaimer: string
}

/**
 * 构建「清通调补固」五区块数据（纯函数，确定性）。
 * @param ingredientKeys 商品 ingredients（INGREDIENT_DICT key 列表）
 * @param override       商家人工阶段（food_stage 列）
 * @param coreTagOverride 可选：商家自定义核心作用标签（否则取阶段默认）
 */
export function buildShiyangStageModule(
  ingredientKeys: string[] | null | undefined,
  override?: string | null,
  coreTagOverride?: string | null,
): ShiyangStageModule {
  const stage = deriveProductStage(ingredientKeys, override)
  const meta = stage ? STAGE_META[stage] : null

  const entries = (ingredientKeys || [])
    .map((k) => INGREDIENT_DICT[k])
    .filter(Boolean) as IngredientEntry[]

  const ingredients: StageIngredientRow[] = entries.map((e) => ({
    key: Object.keys(INGREDIENT_DICT).find((k) => INGREDIENT_DICT[k] === e) || e.zh,
    name: e.zh,
    icon: e.icon || '🍃',
    nature: e.nature,
    benefits: e.benefits,
    scenarios: e.scenarios,
  }))

  // 搭配建议：阶段上下游叙事（过合规脱敏）
  let comboNarrative = ''
  if (stage) {
    const nb = STAGE_NEIGHBORS[stage]
    const baseText = nb.base
      ? `先搭配「${STAGE_META[nb.base].label}·${STAGE_META[nb.base].coreTag}」类零食打底`
      : '本品为调理起点，上火/积食期可优先单独食用'
    const consText = `再搭配「${STAGE_META[nb.consolidate].label}·${STAGE_META[nb.consolidate].coreTag}」类零食巩固`
    comboNarrative = safe(
      `💡 搭配建议：本品为「${meta!.label}」食养零食，${baseText}，${consText}，按阶调理更均衡。`,
    )
  }

  return {
    stage,
    label: meta ? meta.label : '食养',
    coreTag: safe(coreTagOverride && coreTagOverride.trim() ? coreTagOverride.trim() : (meta ? meta.coreTag : '日常食养')),
    oneLiner: safe(stage ? STAGE_ONELINER[stage] : '温和食养，适量为宜。'),
    ingredients,
    comboNarrative,
    neighbors: stage ? STAGE_NEIGHBORS[stage] : { base: null, consolidate: '调' },
    disclaimer: safe(UNIFIED_DISCLAIMER),
  }
}

export { FOOD_THERAPY_DISCLAIMER }
