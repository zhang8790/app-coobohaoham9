// 食材食疗智能导购 —— 营销模板 / 导购话术库
// 模板内容含占位符：{name}{natureText}{tagText}{tagSentence}{remindText}
// 引擎 generateMarketingCopy 负责填充；运营可在 admin-web 改模板，无需发版。
// 默认以 TS 常量实现（与迁移 00102 种子一致）；小程序挂载时从 DB 注入覆盖，
// 迁移未执行/加载失败时回退默认集。

import type { FitRule, FoodTherapyInput } from './types'
import { resolveNature } from './nature'

export type TplKey = 'sales_word' | 'detail_desc' | 'circle_copy' | 'risk_tip' | 'poster_template'

export interface FoodTherapyTemplate {
  tpl_key: TplKey
  tpl_type: string
  title: string
  content: string
  is_active: boolean
}

export const NATURE_DESC: Record<string, string> = {
  '大寒': '清润寒凉',
  '寒凉': '清凉解燥',
  '平性': '平和滋养',
  '微温': '温润不燥',
  '温热': '温补暖身',
  '大热': '辛热暖阳',
}

// 默认模板集（硬编码兜底，与迁移 00102 种子一致）
export const DEFAULT_TEMPLATES: FoodTherapyTemplate[] = [
  { tpl_key: 'sales_word', tpl_type: 'sales', title: '一句话销售话术', content: '{name}｜{natureText}，{tagText}，一口就懂你的口味', is_active: true },
  { tpl_key: 'detail_desc', tpl_type: 'detail', title: '详情卖点文案', content: '【{name}】{natureText}。{tagSentence}用心选材，让每一餐都有温度。', is_active: true },
  { tpl_key: 'circle_copy', tpl_type: 'circle', title: '朋友圈 / 社群文案', content: '今天点了{name}，{natureText}的治愈感真的绝了～{tagSentence}日常小确幸 get✨', is_active: true },
  { tpl_key: 'risk_tip', tpl_type: 'risk', title: '风险提醒', content: '温馨提示：{remindText}。食养建议不替代医嘱，适量为佳。', is_active: true },
  { tpl_key: 'poster_template', tpl_type: 'poster', title: '海报模板', content: '主标题：{name}\n副标题：{natureText}·{tagText}\n角标：食材食疗导购推荐\n脚注：食养参考·不替代医嘱', is_active: true },
]

// ── 运行时激活模板（可被 DB 覆盖）──
let ACTIVE_TEMPLATES: FoodTherapyTemplate[] = DEFAULT_TEMPLATES

export function getActiveTemplates(): FoodTherapyTemplate[] {
  return ACTIVE_TEMPLATES
}

// DB 加载成功后注入覆盖（空数组或异常时不覆盖，保留兜底）
export function setActiveTemplates(templates: FoodTherapyTemplate[] | null | undefined): void {
  if (Array.isArray(templates) && templates.length > 0) ACTIVE_TEMPLATES = templates
}

// 取某类模板的激活正文；未配置返回 null（调用方回退默认）
export function getTemplateContent(key: TplKey): string | null {
  const t = ACTIVE_TEMPLATES.find((x) => x.tpl_key === key && x.is_active)
  return t?.content ?? null
}

// 计算填充变量（与 marketing.ts 原逻辑一致）
export interface FillVars {
  name: string
  natureText: string
  tagText: string
  tagSentence: string
  remindText: string
}

export function buildFillVars(input: FoodTherapyInput, rule?: FitRule | null): FillVars {
  const nature = resolveNature(input)
  const natureText = nature ? NATURE_DESC[nature] || nature : '风味均衡'
  const tags = (input.health_tag ?? []).slice(0, 3)
  const tagText = tags.length ? tags.join('、') : '家常好味'
  const tagSentence = tags.length ? `食养侧重：${tagText}。` : ''
  const name = input.name || '本店好物'
  const remindText = rule?.remindText ?? '食养建议不替代医嘱，适量为佳'
  return { name, natureText, tagText, tagSentence, remindText }
}

export function fillTemplate(tpl: string, v: FillVars): string {
  return tpl
    .replace(/\{name\}/g, v.name)
    .replace(/\{natureText\}/g, v.natureText)
    .replace(/\{tagText\}/g, v.tagText)
    .replace(/\{tagSentence\}/g, v.tagSentence)
    .replace(/\{remindText\}/g, v.remindText)
}
