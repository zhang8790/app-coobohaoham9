// 食品致敏原关键词字典（依据 GB 7718《预包装食品标签通则》推荐标示的致敏物质）
// ----------------------------------------------------------------------------
// 用途：食品「全面安全分析」中识别商品标签/配料文本里出现的致敏原，
//       提示过敏人群（尤其儿童）慎用。与食品添加剂字典（additive-dictionary）、
//       食养字典（shiyang-dictionary）相互独立，避免把致敏原误判为添加剂或食材。
//
// 覆盖 GB 7718 强制推荐标示的「八类致敏物质」及其制品 + 2024 版新增建议的「芝麻」，
// 另补充儿童零食场景常见的「芒果 / 菠萝」作为次要提示（severity=medium）。
//
// 匹配方式：对标签原文做小写包含匹配（与 additive-dictionary 一致），
//           命中任一关键词即判定该致敏原「可能含有/含有」。

export type AllergenSeverity = 'high' | 'medium'

export interface AllergenInfo {
  key: string
  name: string               // 展示名（如 牛奶及乳制品）
  category: string           // 八类分组（如 乳及乳制品）
  severity: AllergenSeverity
  keywords: string[]         // 标签文本中可能出现的关键词/别名
  note: string               // 提示文案
}

// GB 7718 八类 + 芝麻；儿童零食额外高频致敏单列 medium
export const ALLERGEN_DICT: AllergenInfo[] = [
  {
    key: 'gluten',
    name: '含麸质谷物',
    category: '麸质谷物及其制品',
    severity: 'high',
    keywords: ['麸质', '面筋', '谷蛋白', '小麦', '大麦', '黑麦', '燕麦', '麦芽', '全麦', '麦麸', '面粉', '小麦粉'],
    note: '含麸质谷物（小麦/大麦/黑麦/燕麦等），乳糜泻及麸质不耐受人群应避免',
  },
  {
    key: 'crustacean',
    name: '甲壳类',
    category: '甲壳纲类动物及其制品',
    severity: 'high',
    keywords: ['虾', '蟹', '龙虾', '蟹肉', '虾仁', '虾皮', '甲壳', '海虾', '河虾'],
    note: '虾蟹等甲壳类，常见强致敏原，过敏人群禁用',
  },
  {
    key: 'fish',
    name: '鱼类',
    category: '鱼类及其制品',
    severity: 'high',
    keywords: ['鱼', '鱼肉', '鱼糜', '鱼松', '鱼干', '三文鱼', '鳕鱼', '带鱼', '金枪鱼', '巴沙鱼', '龙利鱼'],
    note: '鱼类及其制品，部分人群过敏，注意交叉污染',
  },
  {
    key: 'egg',
    name: '蛋类',
    category: '蛋类及其制品',
    severity: 'high',
    keywords: ['鸡蛋', '蛋黄', '蛋清', '全蛋', '咸蛋', '皮蛋', '蛋液', '蛋粉'],
    note: '蛋及蛋制品，婴幼儿首次添加需谨慎观察',
  },
  {
    key: 'peanut',
    name: '花生',
    category: '花生及其制品',
    severity: 'high',
    keywords: ['花生', '花生酱', '落花生', '花生碎', '花生仁'],
    note: '花生是儿童常见强致敏原，过敏可严重，需严格规避',
  },
  {
    key: 'soy',
    name: '大豆制品',
    category: '大豆及其制品',
    severity: 'high',
    keywords: ['大豆', '黄豆', '豆浆', '豆腐', '豆干', '酱油', '纳豆', '豆奶', '豆制品', '植物蛋白', '大豆分离蛋白', '大豆油'],
    note: '大豆及其制品，部分婴幼儿敏感',
  },
  {
    key: 'milk',
    name: '乳及乳制品',
    category: '乳及乳制品（含乳糖）',
    severity: 'high',
    keywords: ['牛奶', '牛乳', '羊奶', '奶粉', '奶油', '黄油', '奶酪', '芝士', '干酪', '炼乳', '乳清', '乳糖', '酸奶', '奶', '乳粉', '奶制品'],
    note: '牛奶及乳制品（含乳糖），乳糖不耐受与牛奶蛋白过敏者慎用',
  },
  {
    key: 'tree_nut',
    name: '坚果及果仁',
    category: '坚果及其制品',
    severity: 'high',
    keywords: ['杏仁', '榛子', '核桃', '腰果', '碧根果', '开心果', '夏威夷果', '巴旦木', '扁桃仁', '坚果', '松子', '榛仁', '核桃仁'],
    note: '树坚果（杏仁/核桃/腰果等），儿童强致敏原，需规避',
  },
  {
    key: 'sesame',
    name: '芝麻',
    category: '芝麻及其制品',
    severity: 'high',
    keywords: ['芝麻', '白芝麻', '黑芝麻', '芝麻酱', '麻酱'],
    note: '芝麻及制品，2024 版国标建议标示，过敏人群注意',
  },
  {
    key: 'mango',
    name: '芒果',
    category: '其他常见致敏（儿童）',
    severity: 'medium',
    keywords: ['芒果'],
    note: '芒果为儿童常见致敏水果，首次食用少量尝试',
  },
  {
    key: 'pineapple',
    name: '菠萝',
    category: '其他常见致敏（儿童）',
    severity: 'medium',
    keywords: ['菠萝'],
    note: '菠萝含菠萝蛋白酶，部分儿童口腔过敏，建议熟食或少量',
  },
]

/** 标签/配料文本 → 命中的致敏原列表（按字典顺序，去重） */
export function matchAllergens(text: string): AllergenInfo[] {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return []
  const hits: AllergenInfo[] = []
  for (const a of ALLERGEN_DICT) {
    const cands = a.keywords.map((s) => s.toLowerCase()).filter(Boolean)
    if (cands.some((c) => t.includes(c))) hits.push(a)
  }
  return hits
}
