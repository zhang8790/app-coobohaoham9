// 食养成分数据字典（移植自小程序端 src/utils/shiyang-dictionary.ts，保持双端一致）
// 商家后台情绪工作台用于「食养成分打标」，与小程序端共用 product_emotion.shiyang_tags/shiyang_copy 同一 DB 列。
// 所有功效表述均为传统食养文化参考，不替代医疗建议。

export interface IngredientEntry {
  zh: string
  nature: string // 温/凉/平/寒/微温/微寒
  icon: string
  color: string
  benefits: string[] // 食养功效（合规措辞）
  audiences: string[] // 适用人群（状态描述，非病症）
  scenarios: string[] // 生活场景
  aliases?: string[] // 别名 / 简称 / 同义词，提升识别命中率
}

export interface ShiyangTag {
  zh: string
  icon: string
  color: string
}

// 与小程序端保持一致的维度常量（共用 DB 列形状）
export const SHIYANG_DIMENSION_KEY = 'shiyang' as const
export const SHIYANG_DIMENSION_LABEL = '食养成分'
export const SHIYANG_DIMENSION_MAX = 5 // 每商品最多选 5 个食材

// 食养成分种子词典（59 条，按性味分组）
export const INGREDIENT_DICT: Record<string, IngredientEntry> = {
  // ── 温性 · 暖身类 ──
  jiang:        { zh: '生姜',   nature: '温', icon: '🫚', color: '#D97706', benefits: ['驱寒暖身', '温中'],           audiences: ['畏寒人群', '淋雨受寒后'],      scenarios: ['换季温差', '着凉初期'], aliases: ['姜'] },
  hongzao:      { zh: '红枣',   nature: '温', icon: '🫘', color: '#B45309', benefits: ['补中养血'],                   audiences: ['气血偏弱', '经期后'],          scenarios: ['日常温补'], aliases: ['枣', '大枣'] },
  guiyuan:      { zh: '桂圆',   nature: '温', icon: '🟤', color: '#92400E', benefits: ['补益心脾'],                   audiences: ['思虑多', '睡眠浅'],            scenarios: ['劳神之后'], aliases: ['龙眼'] },
  hetao:        { zh: '核桃',   nature: '温', icon: '🥜', color: '#78350F', benefits: ['日常滋补', '健脑'],             audiences: ['用脑较多'],                   scenarios: ['工作学习任务重'], aliases: ['胡桃'] },
  cong:         { zh: '葱白',   nature: '温', icon: '🧅', color: '#C5E4A7', benefits: ['辛温发散'],                   audiences: ['初起畏寒'],                   scenarios: ['着凉初期'], aliases: ['葱'] },
  dasuan:       { zh: '大蒜',   nature: '温', icon: '🧄', color: '#E5E0D8', benefits: ['散寒', '开胃'],                 audiences: ['换季'],                       scenarios: ['日常调味'], aliases: ['蒜'] },
  nangua:       { zh: '南瓜',   nature: '温', icon: '🎃', color: '#F59E0B', benefits: ['补中'],                       audiences: ['体弱', '术后调养'],            scenarios: ['日常'], aliases: ['倭瓜', '金瓜'] },
  shanzha:      { zh: '山楂',   nature: '微温', icon: '🔴', color: '#DC2626', benefits: ['消食化积'],                 audiences: ['食滞', '油腻后'],              scenarios: ['吃多不消化'], aliases: ['山里红', '红果'] },
  chenpi:       { zh: '陈皮',   nature: '温', icon: '🍊', color: '#EA580C', benefits: ['理气健脾'],                   audiences: ['积食', '痰多'],              scenarios: ['油腻饮食后'], aliases: ['桔皮', '橘皮'] },
  jirou:        { zh: '鸡肉',   nature: '温', icon: '🍗', color: '#B45309', benefits: ['补虚', '温中益气'],             audiences: ['体弱', '术后'],                scenarios: ['调养期'], aliases: ['鸡', '仔鸡'] },
  zhurou:       { zh: '猪肉',   nature: '平', icon: '🥓', color: '#9A3412', benefits: ['补虚', '滋阴润燥'],             audiences: ['日常', '体弱'],                scenarios: ['日常'], aliases: ['猪', '豚肉'] },
  xia:          { zh: '虾',     nature: '温', icon: '🦐', color: '#DC2626', benefits: ['补肾', '补充蛋白'],             audiences: ['日常'],                       scenarios: ['日常'], aliases: ['虾仁', '大虾'] },
  paigu:        { zh: '排骨',   nature: '平', icon: '🍖', color: '#B91C1C', benefits: ['补钙', '补益'],                 audiences: ['体弱', '生长期'],              scenarios: ['调养期'], aliases: ['肋排', '腔骨'] },
  yangrou:      { zh: '羊肉',   nature: '温', icon: '🍲', color: '#92400E', benefits: ['温补', '暖身'],                 audiences: ['畏寒', '体弱'],                scenarios: ['换季温差', '冬季'], aliases: ['羊'] },

  // ── 凉/寒 · 清热润燥类 ──
  li:           { zh: '梨',     nature: '凉', icon: '🍐', color: '#A8D672', benefits: ['生津润燥'],                   audiences: ['秋燥人群', '用嗓较多者'],      scenarios: ['干燥时节', '用嗓过度'], aliases: ['雪梨', '鸭梨', '秋梨', '梨子'] },
  jinyinhua:    { zh: '金银花', nature: '寒', icon: '🌼', color: '#F9E076', benefits: ['清热舒缓'],                   audiences: ['咽喉不适', '易上火'],          scenarios: ['咽喉干痒时'], aliases: ['银花', '忍冬'] },
  lvdou:        { zh: '绿豆',   nature: '寒', icon: '🟢', color: '#22C55E', benefits: ['清热解暑'],                   audiences: ['暑热', '易上火'],              scenarios: ['夏季'], aliases: ['青小豆'] },
  kugua:        { zh: '苦瓜',   nature: '寒', icon: '🥒', color: '#4ADE80', benefits: ['清热'],                       audiences: ['饮食油腻', '易上火'],          scenarios: ['油腻饮食后'], aliases: ['凉瓜'] },
  bailuobo:     { zh: '白萝卜', nature: '凉', icon: '🥕', color: '#F0F4F8', benefits: ['理气化痰'],                   audiences: ['痰多', '食积'],              scenarios: ['吃多不消化'], aliases: ['萝卜', '莱菔'] },
  xiangjiao:    { zh: '香蕉',   nature: '寒', icon: '🍌', color: '#F7DC6F', benefits: ['润肠'],                       audiences: ['肠燥'],                       scenarios: ['日常'], aliases: ['蕉'] },
  bocai:        { zh: '菠菜',   nature: '凉', icon: '🥬', color: '#16A34A', benefits: ['养血润燥'],                   audiences: ['贫血', '干燥'],                scenarios: ['日常'], aliases: ['菠柃菜', '红根菜'] },
  yinmi:        { zh: '薏米',   nature: '凉', icon: '🌾', color: '#D4C5A9', benefits: ['清热利湿'],                   audiences: ['湿热'],                       scenarios: ['夏季'], aliases: ['薏仁', '苡米', '薏苡仁'] },
  fanqie:       { zh: '番茄',   nature: '凉', icon: '🍅', color: '#EF4444', benefits: ['生津', '补充维C', '开胃'],       audiences: ['日常', '食欲不振'],            scenarios: ['日常', '夏季'], aliases: ['西红柿', '洋柿子'] },
  huanggua:     { zh: '黄瓜',   nature: '凉', icon: '🥒', color: '#84CC16', benefits: ['清热解暑', '补水'],             audiences: ['暑热', '易上火'],              scenarios: ['夏季'], aliases: ['青瓜'] },
  donggua:      { zh: '冬瓜',   nature: '凉', icon: '🥒', color: '#A3E635', benefits: ['清热利水', '消肿'],             audiences: ['暑热', '湿热'],                scenarios: ['夏季'], aliases: ['白瓜', '枕瓜'] },
  lianou:       { zh: '莲藕',   nature: '凉', icon: '🪷', color: '#FCA5A5', benefits: ['健脾开胃', '凉血'],             audiences: ['日常', '体热'],                scenarios: ['日常'], aliases: ['藕'] },
  haidai:       { zh: '海带',   nature: '寒', icon: '🟢', color: '#0E7490', benefits: ['化痰软坚', '补充碘'],           audiences: ['日常', '痰多'],                scenarios: ['日常'], aliases: ['昆布', '江白菜'] },
  doufu:        { zh: '豆腐',   nature: '凉', icon: '🧊', color: '#E5E7EB', benefits: ['清热润燥', '补充蛋白'],         audiences: ['日常', '素食'],                scenarios: ['日常'], aliases: ['嫩豆腐', '水豆腐'] },
  baicai:       { zh: '白菜',   nature: '微寒', icon: '🥬', color: '#BEF264', benefits: ['清热', '润肠'],               audiences: ['日常', '燥热'],                scenarios: ['日常'], aliases: ['大白菜', '黄芽菜'] },
  qiezi:        { zh: '茄子',   nature: '凉', icon: '🍆', color: '#7C3AED', benefits: ['清热', '活血'],                 audiences: ['日常', '易上火'],              scenarios: ['日常', '夏季'], aliases: ['茄', '落苏'] },

  // ── 平性 · 温和滋养类 ──
  fengmi:       { zh: '蜂蜜',   nature: '平', icon: '🍯', color: '#F59E0B', benefits: ['润喉润肠'],                   audiences: ['咽喉干', '肠燥'],              scenarios: ['咽喉不适', '早起'], aliases: ['蜜', '蜂糖'] },
  yiner:        { zh: '银耳',   nature: '平', icon: '🍄', color: '#F5E6D3', benefits: ['滋阴润肺'],                   audiences: ['干燥', '久咳'],              scenarios: ['秋燥时节'], aliases: ['白木耳', '雪耳'] },
  baihe:        { zh: '百合',   nature: '微寒', icon: '🌷', color: '#F0AB8D', benefits: ['清心安神'],                 audiences: ['心烦', '睡眠浅'],              scenarios: ['睡前'], aliases: ['野百合'] },
  lianzi:       { zh: '莲子',   nature: '平', icon: '🪷', color: '#6EE7B7', benefits: ['养心安神'],                   audiences: ['心悸', '睡眠浅'],              scenarios: ['日常'], aliases: ['莲实'] },
  shanyao:      { zh: '山药',   nature: '平', icon: '🥖', color: '#D4C4A8', benefits: ['健脾'],                       audiences: ['脾胃偏弱'],                   scenarios: ['日常调养'], aliases: ['淮山', '怀山'] },
  gouqi:        { zh: '枸杞',   nature: '平', icon: '🔴', color: '#EF4444', benefits: ['养肝明目'],                   audiences: ['用眼多', '熬夜'],              scenarios: ['用眼过度'], aliases: ['杞子', '枸杞子'] },
  heizhima:     { zh: '黑芝麻', nature: '平', icon: '🖤', color: '#374151', benefits: ['润肠', '日常滋养'],             audiences: ['发质干', '肠燥'],              scenarios: ['日常'], aliases: ['芝麻', '黑脂麻'] },
  xiaomi:       { zh: '小米',   nature: '凉', icon: '🌽', color: '#FCD34D', benefits: ['养胃'],                       audiences: ['胃弱'],                       scenarios: ['日常'], aliases: ['粟', '粟米'] },
  pingguo:      { zh: '苹果',   nature: '平', icon: '🍎', color: '#EF4444', benefits: ['健脾', '补充营养'],               audiences: ['日常', '肠胃偏弱'],             scenarios: ['日常', '加餐'] },
  huluobo:      { zh: '胡萝卜', nature: '平', icon: '🥕', color: '#F97316', benefits: ['明目', '补充营养'],             audiences: ['用眼多'],                     scenarios: ['日常'] },
  niunai:       { zh: '牛奶',   nature: '平', icon: '🥛', color: '#E5E7EB', benefits: ['补钙', '补蛋白'],               audiences: ['全人群'],                     scenarios: ['日常'], aliases: ['奶', '牛乳'] },
  jidan:        { zh: '鸡蛋',   nature: '平', icon: '🥚', color: '#FDE68A', benefits: ['补虚'],                       audiences: ['日常'],                       scenarios: ['日常'], aliases: ['蛋', '鸡子'] },
  niurou:       { zh: '牛肉',   nature: '平', icon: '🥩', color: '#B91C1C', benefits: ['补气血'],                     audiences: ['体弱', '术后'],                scenarios: ['调养期'], aliases: ['牛'] },
  jiyu:         { zh: '鲫鱼',   nature: '平', icon: '🐟', color: '#64748B', benefits: ['健脾利湿'],                   audiences: ['术后', '体弱'],                scenarios: ['恢复期的温和食补'], aliases: ['鲫', '鲋鱼'] },
  ningmeng:     { zh: '柠檬',   nature: '凉', icon: '🍋', color: '#FACC15', benefits: ['补充维C'],                   audiences: ['易疲劳', '换季'],              scenarios: ['日常'], aliases: ['柠', '益母果'] },
  mihoutao:     { zh: '猕猴桃', nature: '寒', icon: '🥝', color: '#65A30D', benefits: ['补充维C'],                   audiences: ['日常'],                       scenarios: ['日常'], aliases: ['奇异果', '猕猴梨'] },
  xingren:      { zh: '杏仁',   nature: '温', icon: '🥜', color: '#D2B48C', benefits: ['润肠', '滋养'],               audiences: ['肠燥'],                       scenarios: ['日常'], aliases: ['杏核', '杏子'] },
  papaya:       { zh: '木瓜',   nature: '温', icon: '🟠', color: '#F97316', benefits: ['助消化'],                     audiences: ['积食'],                       scenarios: ['油腻饮食后'], aliases: ['木梨', '万寿果'] },
  zhizi:        { zh: '紫菜',   nature: '寒', icon: '🟣', color: '#8B5CF6', benefits: ['化痰软坚'],                   audiences: ['痰多'],                       scenarios: ['日常'], aliases: ['海苔', '索菜'] },
  bingtang:     { zh: '冰糖',   nature: '平', icon: '🍬', color: '#BFDBFE', benefits: ['润肺', '调和滋味'],               audiences: ['干燥', '咽喉干'],              scenarios: ['秋冬炖煮', '甜品汤羹'], aliases: ['老冰糖'] },
  tudou:        { zh: '土豆',   nature: '平', icon: '🥔', color: '#A16207', benefits: ['补充能量', '健脾', '饱腹'],       audiences: ['日常', '体弱'],                scenarios: ['日常'], aliases: ['马铃薯', '洋芋'] },
  dami:         { zh: '大米',   nature: '平', icon: '🍚', color: '#F5F5F4', benefits: ['养胃', '补充能量'],             audiences: ['全人群'],                     scenarios: ['日常'], aliases: ['稻米', '白米'] },
  miantiao:     { zh: '面条',   nature: '平', icon: '🍜', color: '#FCD34D', benefits: ['补充能量', '饱腹'],             audiences: ['日常'],                       scenarios: ['日常', '主食'], aliases: ['面', '挂面'] },
  muer:         { zh: '木耳',   nature: '平', icon: '⚫', color: '#1F2937', benefits: ['润燥', '清理肠道'],             audiences: ['日常'],                       scenarios: ['日常'], aliases: ['黑木耳', '云耳'] },
  xianggu:      { zh: '香菇',   nature: '平', icon: '🍄', color: '#92400E', benefits: ['健脾', '增强食欲'],             audiences: ['日常'],                       scenarios: ['日常'], aliases: ['香蕈', '冬菇'] },
}

// 编译 UI 标签（按性味分组，供商家在打标页选用）
export const SHIYANG_CATEGORIES: Record<string, { label: string; tags: ShiyangTag[] }> = {
  warm: {
    label: '温性·暖身',
    tags: ['jiang', 'hongzao', 'guiyuan', 'hetao', 'nangua', 'chenpi', 'xingren', 'shanzha', 'jirou', 'zhurou', 'xia', 'paigu', 'yangrou'].map(k => {
      const e = INGREDIENT_DICT[k]
      return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
  cool: {
    label: '凉寒·清热',
    tags: ['li', 'jinyinhua', 'lvdou', 'kugua', 'bailuobo', 'xiangjiao', 'bocai', 'ningmeng', 'mihoutao', 'zhizi', 'yinmi', 'fanqie', 'huanggua', 'donggua', 'lianou', 'haidai', 'doufu', 'baicai', 'qiezi'].map(k => {
      const e = INGREDIENT_DICT[k]
      return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
  neutral: {
    label: '平性·滋养',
    tags: ['fengmi', 'yiner', 'baihe', 'lianzi', 'shanyao', 'gouqi', 'heizhima', 'xiaomi', 'pingguo', 'huluobo', 'niunai', 'jidan', 'niurou', 'jiyu', 'bingtang', 'papaya', 'tudou', 'dami', 'miantiao', 'muer', 'xianggu'].map(k => {
      const e = INGREDIENT_DICT[k]
      return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
}

// 合规文案生成
export interface ShiyangCopyInput {
  ingredients: string[] // ingredient 中文名
  scene?: string
}

export interface ShiyangCopyOutput {
  cardTitle: string
  cardDetail: string
  disclaimer: string
}

export const SHIYANG_DISCLAIMER = '以上为传统食养文化参考，个体差异较大，不能替代专业医疗建议。如身体不适应及时休息，症状持续或加重请及时就医。'

// 中文名/别名 → 字典条目（支持别名反查，如「姜」也能定位到生姜条目）
const ALL_TERMS: Record<string, IngredientEntry> = (() => {
  const m: Record<string, IngredientEntry> = {}
  for (const e of Object.values(INGREDIENT_DICT)) {
    m[e.zh] = e
    for (const a of e.aliases || []) m[a] = e
  }
  return m
})()

export function generateShiyangCopy(input: ShiyangCopyInput): ShiyangCopyOutput {
  const entries = input.ingredients.map(zh => ALL_TERMS[zh]).filter(Boolean) as IngredientEntry[]

  if (entries.length === 0) {
    return { cardTitle: '无食养信息', cardDetail: '', disclaimer: SHIYANG_DISCLAIMER }
  }

  const names = entries.map(e => e.zh)
  const allBenefits = Array.from(new Set(entries.flatMap(e => e.benefits)))
  const allAudiences = Array.from(new Set(entries.flatMap(e => e.audiences)))

  const natureStr = entries.map(e => `${e.zh}（${e.nature}）`).join('、')
  const title = names.join('+')

  const subTitle = input.scene
    ? `${input.scene}时`
    : allAudiences.length
      ? `适合${allAudiences.slice(0, 3).join('、')}的日常搭配`
      : '传统食养搭配'

  const detail = `${natureStr}\n传统食养参考：${allBenefits.slice(0, 4).join('、')}。${subTitle}。`

  return {
    cardTitle: title,
    cardDetail: detail,
    disclaimer: SHIYANG_DISCLAIMER,
  }
}

// 把「中文名数组」转成 DB 存储形状 { shiyang: [...] }
export function toShiyangTags(zhNames: string[]): Record<string, string[]> {
  return { [SHIYANG_DIMENSION_KEY]: zhNames }
}

// 收集某食材的全部匹配候选（全名 + 别名，小写）
function candidateTerms(e: IngredientEntry): string[] {
  return [e.zh, ...(e.aliases || [])].map(s => s.toLowerCase()).filter(Boolean)
}

// 按商品名匹配食材 key（双向：① 商品名包含食材全名/别名；② 输入片段包含候选，支持单字/简称）
export function matchIngredientKeys(name: string): string[] {
  if (!name) return []
  const t = name.toLowerCase()
  const tokens = t.split(/[\s,，、/()（）\-+]+/).filter(Boolean)
  const hits: { key: string; len: number }[] = []
  for (const [key, e] of Object.entries(INGREDIENT_DICT)) {
    const cands = candidateTerms(e)
    if (!cands.length) continue
    const forward = cands.some(c => t.includes(c))
    const backward = tokens.some(tok => cands.some(c => tok.includes(c)))
    if (forward || backward) hits.push({ key, len: Math.max(...cands.map(c => c.length)) })
  }
  if (hits.length === 0) return []
  hits.sort((a, b) => b.len - a.len)
  const result: string[] = []
  for (const h of hits) {
    const covered = result.some(rk => {
      const rzh = INGREDIENT_DICT[rk].zh
      return rzh.length > h.len && rzh.includes(INGREDIENT_DICT[h.key].zh)
    })
    if (!covered) result.push(h.key)
  }
  return result
}

// 原料名搜索：编辑页「输入原料名快速添加」入口，按名称/别名模糊匹配
export function searchIngredients(query: string, limit = 30): string[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  const result: string[] = []
  for (const [key, e] of Object.entries(INGREDIENT_DICT)) {
    if (candidateTerms(e).some(c => c.includes(q) || q.includes(c))) result.push(key)
  }
  return result.slice(0, limit)
}

// 通过食材 key 数组取字典条目（供编辑页勾选 / 详情页渲染）
export function getIngredientEntries(keys: string[]): IngredientEntry[] {
  return (keys ?? []).map(k => INGREDIENT_DICT[k]).filter(Boolean) as IngredientEntry[]
}

// 解析商品原料条目：优先持久化 ingredients，否则按名称临时匹配
// 与小程序端 src/utils/ingredient-analysis.ts resolveIngredientEntries 语义保持一致
export function resolveIngredientEntries(product: { ingredients?: string[] | null; name?: string }): IngredientEntry[] {
  const persisted = product.ingredients && product.ingredients.length > 0 ? product.ingredients : null
  const keys = persisted ?? matchIngredientKeys(product.name || '')
  return getIngredientEntries(keys)
}
