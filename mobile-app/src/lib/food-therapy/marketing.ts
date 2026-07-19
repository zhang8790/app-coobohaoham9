// 营销素材自动生成（方案「第三层数据库」）
// 由商品导购数据（性味 / 食疗标签 / 情绪标签 / 场景规则）自动产出：
// 一句话销售话术 / 详情卖点 / 朋友圈文案 / 风险提醒 / 海报模板。
// 全部遵循合规红线：食养措辞仅为传统饮食文化参考，不替代医嘱。
//
// 模板来源：优先运营在 admin-web 配置的 food_therapy_templates（含占位符），
// 缺失时回退本文件 DEFAULT_TEMPLATES，输出与本函数原先逻辑一致。

import type { FitRule, FoodTherapyInput, MarketingCopy } from './types'
import {
  buildFillVars, fillTemplate, getTemplateContent, NATURE_DESC,
} from './templates'

export { NATURE_DESC }

export function generateMarketingCopy(input: FoodTherapyInput, rule?: FitRule | null): MarketingCopy {
  const v = buildFillVars(input, rule)

  const salesTpl = getTemplateContent('sales_word')
  const detailTpl = getTemplateContent('detail_desc')
  const circleTpl = getTemplateContent('circle_copy')
  const riskTpl = getTemplateContent('risk_tip')
  const posterTpl = getTemplateContent('poster_template')

  const short_sales_word = salesTpl ? fillTemplate(salesTpl, v) : `${v.name}｜${v.natureText}，${v.tagText}，一口就懂你的口味`
  const detail_desc = detailTpl ? fillTemplate(detailTpl, v) : `【${v.name}】${v.natureText}。${v.tagSentence}用心选材，让每一餐都有温度。`
  const circle_copy = circleTpl ? fillTemplate(circleTpl, v) : `今天点了${v.name}，${v.natureText}的治愈感真的绝了～${v.tagSentence}日常小确幸 get✨`
  const risk_tip = riskTpl
    ? fillTemplate(riskTpl, v)
    : `温馨提示：${v.remindText}。食养建议不替代医嘱，适量为佳。`
  const poster_template = posterTpl
    ? fillTemplate(posterTpl, v)
    : [
        `主标题：${v.name}`,
        `副标题：${v.natureText}·${v.tagText}`,
        '角标：食材食疗导购推荐',
        '脚注：食养参考·不替代医嘱',
      ].join('\n')

  return { short_sales_word, detail_desc, circle_copy, risk_tip, poster_template }
}
