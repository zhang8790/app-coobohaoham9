// 食材配对探索器引擎（纯函数，无网络依赖）
// ------------------------------------------------------------
// 输入一种食材 → 输出：适合季节 / 适合体质 / 推荐搭配 / 可解释文案
// 所有结论均为传统食养文化参考，不替代医疗建议，严禁"治疗/降血压"等医疗宣称。

import {
  INGREDIENT_DICT,
  getIngredient,
  type IngredientEntry,
} from '../shiyang-dictionary'

export interface PairingSuggestion {
  partners: IngredientEntry[]      // 搭配的另一种/几种食材
  reason: string                   // 为什么这样配（可解释）
  goodFor: string[]                // 适合人群 / 场景标签
}

export interface IngredientPairingResult {
  ingredient: IngredientEntry
  suitableSeasons: string[]        // 适合的季节 / 时令
  suitableConstitutions: string[]  // 适合体质 / 人群（CROWD_OPTIONS 子集）
  pairings: PairingSuggestion[]
  copy: string                     // 该食材的一句话食养小结
}

// ── 性味 → 适合季节（规则映射，可解释）──
const NATURE_TO_SEASONS: Record<string, string[]> = {
  '温': ['冬季', '早春', '换季降温'],
  '微温': ['冬季', '早春', '换季降温'],
  '平': ['四季皆宜'],
  '凉': ['夏季', '秋燥'],
  '微寒': ['夏季', '秋燥'],
  '寒': ['盛夏', '暑热'],
}

// ── 性味 → 基础适合体质（BODY_CROWD_OPTIONS，安全的生活化体质标签）──
const NATURE_TO_CROWDS: Record<string, string[]> = {
  '温': ['体虚怕冷', '宫寒量少', '脾胃虚寒'],
  '微温': ['体虚怕冷', '宫寒量少', '脾胃虚寒'],
  '平': ['肠胃虚弱'],
  '凉': ['易上火', '喉咙肿痛'],
  '微寒': ['易上火', '喉咙肿痛'],
  '寒': ['易上火', '喉咙肿痛'],
}

// ── 功效/人群关键词 → 补充体质（仅取安全、非医疗化的标签）──
const KEYWORD_TO_CROWD: Array<{ kw: string[]; crowd: string }> = [
  { kw: ['安神', '宁神', '安睡', '助眠'], crowd: '失眠' },
  { kw: ['补气血', '养血', '补血', '补益', '滋补', '温中'], crowd: '免疫力低' },
  { kw: ['补气血', '养血', '补血', '温中'], crowd: '体虚怕冷' },
  { kw: ['润肠', '和胃', '健脾', '养胃', '补中'], crowd: '肠胃虚弱' },
]

// ── 配对规则表（人工精校，可解释、可审核）──
export interface PairingRule {
  id: string
  ingredients: string[]   // 2~3 个食材 key 组成搭配
  reason: string          // 为什么这样配
  goodFor: string[]       // 适合人群 / 场景
}

export const PAIRING_RULES: PairingRule[] = [
  {
    id: 'shanzha-hongtang',
    ingredients: ['shanzha', 'hongtang'],
    reason: '山楂偏温、擅长消食化积，配上红糖温中暖身，饭后一小碗，暖暖的也好消化。',
    goodFor: ['食滞', '手脚冰凉', '经期后', '吃多不消化'],
  },
  {
    id: 'jiang-hongtang',
    ingredients: ['jiang', 'hongtang'],
    reason: '生姜驱寒发散，红糖温中暖身，是很多人熟悉的驱寒暖身搭配。',
    goodFor: ['淋雨受寒', '体虚怕冷', '换季降温'],
  },
  {
    id: 'hongzao-guiyuan',
    ingredients: ['hongzao', 'guiyuan'],
    reason: '红枣补中养血，桂圆补益心脾，温润双补，给身体一点温柔的滋养。',
    goodFor: ['气血偏弱', '睡眠浅', '经期后', '思虑多'],
  },
  {
    id: 'yiner-lianzi-baihe',
    ingredients: ['yiner', 'lianzi', 'baihe'],
    reason: '银耳润、莲子宁心、百合安神，三者同煮是经典的秋燥润燥组合。',
    goodFor: ['干燥', '久咳', '心烦', '睡眠浅'],
  },
  {
    id: 'lvdou-bingtang',
    ingredients: ['lvdou', 'bingtang'],
    reason: '绿豆清热解暑，冰糖润肺调和滋味，夏天来一碗清爽又舒服。',
    goodFor: ['暑热', '易上火', '夏季'],
  },
  {
    id: 'chenpi-shanzha',
    ingredients: ['chenpi', 'shanzha'],
    reason: '陈皮理气健脾，山楂消食化积，饭后一杯陈皮山楂水，给肠胃减减负。',
    goodFor: ['油腻饮食后', '吃多不消化', '积食'],
  },
  {
    id: 'hetao-heizhima',
    ingredients: ['hetao', 'heizhima'],
    reason: '核桃健脑，黑芝麻润肠滋养，日常抓一把，润润的也好吃。',
    goodFor: ['用脑多', '发质干', '肠燥'],
  },
  {
    id: 'shanyao-gouqi',
    ingredients: ['shanyao', 'gouqi'],
    reason: '山药健脾，枸杞护眼滋养，温和平补，适合用眼多、脾胃偏弱的人。',
    goodFor: ['用眼多', '脾胃偏弱', '熬夜'],
  },
  {
    id: 'yangrou-danggui-jiang',
    ingredients: ['yangrou', 'danggui', 'jiang'],
    reason: '羊肉温补，当归补血活血，生姜去腥暖中，冬天一锅暖身又养人。',
    goodFor: ['畏寒', '体弱', '冬季', '经期后'],
  },
  {
    id: 'huangqi-jirou-hongzao',
    ingredients: ['huangqi', 'jirou', 'hongzao'],
    reason: '黄芪补气固表，红枣养血，与鸡肉同煲是温和的温补汤，适合恢复期的身体。',
    goodFor: ['术后恢复', '体虚', '换季调养', '易疲劳'],
  },
  {
    id: 'hongdou-yinmi',
    ingredients: ['hongdou', 'yinmi'],
    reason: '红豆利水消肿，薏米清热利湿，二者同煮是经典的健脾祛湿组合。',
    goodFor: ['湿热', '夏季', '水肿', '梅雨季'],
  },
  {
    id: 'huasheng-hongzao',
    ingredients: ['huasheng', 'hongzao'],
    reason: '花生养血健脾，红枣补中，平价又温和，是日常随手可做的温补小食。',
    goodFor: ['气血偏弱', '日常'],
  },
  {
    id: 'heidou-heizhima',
    ingredients: ['heidou', 'heizhima'],
    reason: '黑豆补肾养血，黑芝麻润肠，二者同吃是润养又低调的日常搭配。',
    goodFor: ['发质干', '肠燥', '日常滋养'],
  },
  {
    id: 'niunai-yanmai-putaogan',
    ingredients: ['niunai', 'yanmai', 'putaogan'],
    reason: '牛奶补钙、燕麦饱腹、葡萄干补气血，一碗温润的早餐组合，肠胃也轻松。',
    goodFor: ['肠胃虚弱', '日常', '早餐'],
  },
  {
    id: 'baibian-yinmi-shanyao',
    ingredients: ['baibian', 'yinmi', 'shanyao'],
    reason: '白扁豆健脾化湿、薏米利湿、山药健脾，三者同煮是温和的祛湿组合。',
    goodFor: ['湿热', '梅雨季', '脾胃偏弱'],
  },
  {
    id: 'lizhi-hongzao',
    ingredients: ['lizhi', 'hongzao'],
    reason: '荔枝补气血、红枣养血，温润双补；属性偏温，易上火的人适量就好。',
    goodFor: ['气血偏弱', '经期后'],
  },
  {
    id: 'hongshu-xiaomi',
    ingredients: ['hongshu', 'xiaomi'],
    reason: '红薯补中和胃、小米养胃，一碗温润主食，胃弱的人也舒服。',
    goodFor: ['胃弱', '日常', '主食'],
  },
]

// ── 工具：把全部食材导出为列表（供页面渲染候选项）──
export interface IngredientListItem {
  key: string
  entry: IngredientEntry
}

export const INGREDIENT_LIST: IngredientListItem[] = Object.keys(INGREDIENT_DICT).map(key => ({
  key,
  entry: INGREDIENT_DICT[key],
}))

// ── 工具：按名称 / 别名模糊搜索食材 ──
export function searchIngredients(query: string): IngredientListItem[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return INGREDIENT_LIST
  return INGREDIENT_LIST.filter(({ key, entry }) => {
    if (key.toLowerCase().includes(q)) return true
    if (entry.zh.toLowerCase().includes(q)) return true
    if ((entry.aliases || []).some(a => a.toLowerCase().includes(q))) return true
    return false
  })
}

// ── 工具：资质季节 ──
function getSuitableSeasons(nature: string): string[] {
  return NATURE_TO_SEASONS[nature] || ['四季皆宜']
}

// ── 工具：资质体质（性味基础 + 功效/人群关键词补充）──
function getSuitableConstitutions(entry: IngredientEntry): string[] {
  const base = new Set<string>(NATURE_TO_CROWDS[entry.nature] || [])
  const haystack = [
    ...(entry.benefits || []),
    ...(entry.audiences || []),
  ].join(' ')
  for (const { kw, crowd } of KEYWORD_TO_CROWD) {
    if (kw.some(k => haystack.includes(k))) base.add(crowd)
  }
  return Array.from(base)
}

// ── 核心：获取某食材的配对结果 ──
export function getIngredientPairing(key: string): IngredientPairingResult | null {
  const ingredient = getIngredient(key)
  if (!ingredient) return null

  const pairings: PairingSuggestion[] = PAIRING_RULES
    .filter(rule => rule.ingredients.includes(key))
    .map(rule => ({
      partners: rule.ingredients
        .filter(k => k !== key)
        .map(k => getIngredient(k))
        .filter(Boolean) as IngredientEntry[],
      reason: rule.reason,
      goodFor: rule.goodFor,
    }))

  const suitableSeasons = getSuitableSeasons(ingredient.nature)
  const suitableConstitutions = getSuitableConstitutions(ingredient)

  const natureLabel = ingredient.nature
  const constitutionLabel = suitableConstitutions.slice(0, 3).join('、')
  const seasonLabel = suitableSeasons.slice(0, 2).join('、')
  const copy = `${ingredient.zh}（${natureLabel}）${ingredient.benefits.slice(0, 2).join('、')}；适合${seasonLabel}食用，${constitutionLabel}的人很适合。以上为传统食养文化参考，不替代专业医疗建议。`

  return {
    ingredient,
    suitableSeasons,
    suitableConstitutions,
    pairings,
    copy,
  }
}
