/**
 * 菜品级「食材组合 · 食养作用」示例数据（前端展示用，后续可平滑迁移到 Supabase）
 * 与现有单食材食养(shiyangEntries)区分：这里描述的是「整道菜」的综合作用，
 * 由原材料食材配合而成，分「现代营养」与「中医食疗」两个维度。
 *
 * 字段说明：
 *  - ingredients    原材料食材 + 各自作用
 *  - modernNutrition 现代营养作用（分点）
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
  suitableFor: string[]
  matchKeywords?: string[]
}

export const FOOD_BENEFITS: Record<string, FoodBenefit> = {
  'sample-yangrou-huimian': {
    id: 'sample-yangrou-huimian',
    productName: '羊肉烩面',
    subtitle: '一碗热汤面，温润暖身，日常也好消化',
    ingredients: [
      { name: '羊肉', icon: '🥩', role: '含优质蛋白质、血红素铁、锌、B 族维生素，性温，日常食养里常作温润搭配食材' },
      { name: '羊骨高汤', icon: '🍲', role: '长时间熬煮，汤体温润、口感柔和，肠胃偏敏感的人也容易接受' },
      { name: '手工宽面', icon: '🍜', role: '碳水主食，能快速补充能量；煮熟后质地柔软，肠胃偏弱的人也容易吸收' },
    ],
    modernNutrition: [
      { title: '快速补充能量', desc: '宽烩面富含碳水化合物，能较快补充能量，适合体力消耗大、容易饿、上班族、劳作之后食用。' },
      { title: '补充优质蛋白与矿物质', desc: '现代营养学认为，羊肉含优质蛋白质、血红素铁、锌、B 族维生素等营养成分；日常适量食用，可作为补铁、补充蛋白质的来源之一。' },
      { title: '口感柔和、温和适口', desc: '煮软的宽面口感柔和；久熬的羊汤温润，适合肠胃偏敏感、胃口一般的人日常适量食用。' },
      { title: '配菜丰富营养结构', desc: '传统烩面常搭配海带、豆腐、青菜、粉条等，丰富膳食纤维与矿物质，让营养更均衡。' },
    ],
    suitableFor: ['容易怕冷', '畏寒人群', '体力消耗大', '秋冬需要温润食养', '肠胃偏弱'],
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
