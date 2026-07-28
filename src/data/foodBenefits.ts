/**
 * 菜品级「食材组合 · 食养作用」示例数据（前端展示用，后续可平滑迁移到 Supabase）
 * 与现有单食材食养(shiyangEntries)区分：这里描述的是「整道菜」的综合作用，
 * 由原材料食材配合而成，分「现代营养」与「中医食疗」两个维度。
 *
 * 字段说明：
 *  - ingredients    原材料食材 + 各自作用
 *  - modernNutrition 现代营养作用（分点）
 *  - tcmTherapy     中医食疗功效（分点）
 *  - suitableFor    适合人群
 *  - matchKeywords  演示用：商品名包含其一即展示（后端接入后改用 product.id 精确匹配）
 */
export interface IngredientRole {
  name: string
  icon?: string
  role: string
}

export interface BenefitItem {
  title: string
  desc: string
}

export interface FoodBenefit {
  id: string
  productName: string
  subtitle?: string
  ingredients: IngredientRole[]
  modernNutrition: BenefitItem[]
  tcmTherapy: BenefitItem[]
  suitableFor: string[]
  matchKeywords?: string[]
}

export const FOOD_BENEFITS: Record<string, FoodBenefit> = {
  'sample-yangrou-huimian': {
    id: 'sample-yangrou-huimian',
    productName: '羊肉烩面',
    subtitle: '一碗热汤面，温润补养两不误',
    ingredients: [
      { name: '羊肉', icon: '🥩', role: '优质蛋白、血红素铁、锌、B 族维生素；性温味甘，温中补虚、益气养血' },
      { name: '羊骨高汤', icon: '🍲', role: '长时间熬煮出胶原与氨基酸，汤体温润，易消化、养胃' },
      { name: '手工宽面', icon: '🍜', role: '碳水主食，快速供能；煮熟后质地柔软，脾胃偏弱也好吸收' },
    ],
    modernNutrition: [
      { title: '快速补充能量、缓解疲劳', desc: '宽烩面富含碳水化合物，快速供能，适合体力消耗大、饥饿、上班族、劳作之后食用。' },
      { title: '补充优质蛋白与造血营养素', desc: '羊肉含优质蛋白质、血红素铁、锌、B 族维生素，有助于改善体虚乏力、缺铁性贫血，帮助身体组织修复。' },
      { title: '易消化、温和养胃', desc: '煮熟的宽面质地柔软；长时间熬煮的羊汤温润，脾胃偏弱、胃口差的人适量吃更容易吸收。' },
      { title: '配菜均衡营养', desc: '传统烩面搭配海带、豆腐丝、青菜、粉条，补充膳食纤维、矿物质，丰富营养结构。' },
    ],
    tcmTherapy: [
      { title: '温中散寒、暖身驱寒', desc: '改善手脚冰凉、畏寒怕冷、脾胃虚寒、受凉肚子隐痛，秋冬食用暖身效果明显。' },
      { title: '益气补虚', desc: '适合体虚瘦弱、大病后调养、气血不足人群。' },
      { title: '温养', desc: '辅助缓解怕冷、腰膝酸软、精神疲乏等状态（食养参考，不替代医疗建议）。' },
      { title: '健脾开胃', desc: '熬汤香料（生姜、白芷等）去腥暖胃，增进食欲。' },
    ],
    suitableFor: ['手脚常年冰凉', '虚寒体质', '气血不足', '体力劳动者', '秋冬畏寒人群'],
    matchKeywords: ['烩面', '羊肉烩面', '羊肉汤面'],
  },
}

/** 按商品精确匹配(product.id)或演示关键词(product.name)取菜品食养数据 */
export function getFoodBenefit(product?: { id?: string; name?: string } | null): FoodBenefit | null {
  if (!product) return null
  if (product.id && FOOD_BENEFITS[product.id]) return FOOD_BENEFITS[product.id]
  const name = product.name || ''
  for (const key of Object.keys(FOOD_BENEFITS)) {
    const b = FOOD_BENEFITS[key]
    if (b.matchKeywords?.some((k) => name.includes(k))) return b
  }
  return null
}
