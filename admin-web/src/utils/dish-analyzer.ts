// 食疗分析引擎（admin-web）—— 委托单一权威源 @food-engine/engine 的 analyzeProduct
// ----------------------------------------------------------------------------
// 消除 C1 双端引擎漂移：原本与小程序端 src/utils/food-therapy/dishAnalyzer.ts 各有一份
// 聚合/映射逻辑；现统一调用 analyzeProduct（确定性、输出严格落在固定枚举内）。
// 本文件仅保留与后台录入表单对齐的 DishAnalysis 子集类型，逻辑全部下沉到共享引擎。
// 合规：所有文案为传统食养文化参考，不含医疗宣称。

import { analyzeProduct } from '@food-engine/engine'
import type { HealthTag, Scene, FoodCategory } from '@food-engine/wordTables'

export interface DishAnalysis {
  /** 命中的食材 key（已去重，含手动勾选） */
  ingredients: string[]
  /** 推断的商品分类（合法枚举，空串表示无法推断） */
  food_category: FoodCategory | ''
  /** 聚合整体性味（NATURE_SCALE） */
  overall_nature: string
  /** 组合健康标签（HEALTH_TAGS） */
  health_tag: HealthTag[]
  /** 正向调理作用文案（组合各食材功效） */
  positive_effect: string
  /** 食用风险提示 */
  risk_warning: string
  /** 适配场景（SCENE_OPTIONS） */
  scenes: Scene[]
  /** 五星推荐人群（CROWD_OPTIONS） */
  rec_crowds: string[]
  /** 谨慎食用人群（CROWD_OPTIONS） */
  cautious_crowds: string[]
  /** 禁止食用人群（CROWD_OPTIONS） */
  forbidden_crowds: string[]
}

/**
 * 系统化食疗分析入口：写菜名 → 系统拆分食材 → 组合生成全部食养字段。
 * @param name 商品/菜名
 * @param manualIngredients 已手动勾选的食材 key（会与识别结果合并去重）
 */
export function analyzeDish(name: string, manualIngredients: string[] = []): DishAnalysis {
  const a = analyzeProduct(name, manualIngredients)
  return {
    ingredients: a.ingredients,
    food_category: a.food_category,
    overall_nature: a.overall_nature,
    health_tag: a.health_tag,
    positive_effect: a.positive_effect,
    risk_warning: a.risk_warning,
    scenes: a.scenes,
    rec_crowds: a.rec_crowds,
    cautious_crowds: a.cautious_crowds,
    forbidden_crowds: a.forbidden_crowds,
  }
}
