// 食疗/安全系统 · 本地智能识别引擎（小程序端纯函数，零后端依赖）
// ----------------------------------------------------------------------------
// 委托单一权威源 @/lib/food-engine/engine 的 analyzeProduct，消除 C1 双端引擎漂移。
// 输入：商品/菜名（可选 + 已手动勾选的食材 key）
// 输出：拆分食材 → 聚合整体性味 → 组合食疗标签 → 推导情绪标签 → 预测过敏原
//        → 推导风险人群/提示 → 产出安全摘要。
// 设计原则：纯函数、确定性、输出严格落在固定枚举内；合规文案为传统食养文化参考，不含医疗宣称。
// 这是「结合现有 API 基础」的本地兜底层：即使未配置 LLM / 视觉密钥，输菜名也能立即给出结构化食养属性；
// 配置密钥后由 product-analyze Edge Function 做增强。

import { analyzeProduct, inferCategory, type ProductAnalysis as SharedAnalysis } from '@/lib/food-engine/engine'

export interface ProductAnalysis extends SharedAnalysis {
  /** 营养（结构化，文本识别无法精确给出，本地规则置 null，由 LLM/视觉增强补充） */
  nutrition: {
    energy_kj?: number
    protein_g?: number
    fat_g?: number
    carb_g?: number
    sugar_g?: number
    sodium_mg?: number
  } | null
  /** 安全评级 S/A/C/D（本地规则无法判定，置 null，由 LLM/视觉增强补充） */
  safety_grade: string | null
}

/**
 * 系统化食疗识别入口：写菜名 + 已勾选食材 → 系统拆分食材 → 组合生成全部食养字段。
 * 不依赖任何后端 / 密钥，是「智能识别」的本地确定性兜底层。
 * @param name 商品/菜名
 * @param manualIngredients 已手动勾选的食材 key（会与识别结果合并去重）
 */
export function analyzeProductFromName(name: string, manualIngredients: string[] = []): ProductAnalysis {
  const base = analyzeProduct(name, manualIngredients)
  return { ...base, nutrition: null, safety_grade: null }
}

export { inferCategory }
