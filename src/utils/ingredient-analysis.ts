// 原料 / 食养成分分析工具（单一权威源：来自 @/lib/food-engine/dictionary）
// 复用共享食材字典，将商品名称/描述解析为具体食材，供编辑页「智能识别原料」与详情页「原料分析」卡片使用。
// 所有功效/人群/场景措辞均来自食材字典，不替代医疗建议。

export {
  SHIYANG_DISCLAIMER,
  matchIngredientKeys,
  searchIngredients,
  getIngredientEntries,
  filterShiyangByIngredientList,
  resolveIngredientEntries,
} from '@/lib/food-engine/dictionary'
