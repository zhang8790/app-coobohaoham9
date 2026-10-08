// 食养成分数据字典（单一权威源：INGREDIENT_DICT 来自 @/lib/food-engine/dictionary，与网页后台共用，消除 C2 漂移）
// 提供：食材词典 / 编译 UI 标签库 / 身体状态关键词映射 / 文案生成 / 九体质适配
// 所有功效表述均为传统食养文化参考，不替代医疗建议

import { INGREDIENT_DICT, SHIYANG_DISCLAIMER } from '@/lib/food-engine/dictionary'
import type { IngredientEntry, ShiyangTag } from '@/lib/food-engine/dictionary'
export { INGREDIENT_DICT, SHIYANG_DISCLAIMER }
export type { IngredientEntry, ShiyangTag }

// 编译 UI 标签（按分类整理，供商家在打标页选用）
export const SHIYANG_CATEGORIES: Record<string, { label: string; tags: ShiyangTag[] }> = {
  warm: {
    label: '温性·暖身',
    tags: ['jiang','hongzao','guiyuan','hetao','nangua','chenpi','xingren','shanzha','jirou','zhurou','xia','paigu','yangrou','hongtang','huangqi','danggui','songzi','lizhi'].map(k => {
      const e = INGREDIENT_DICT[k]; return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
  cool: {
    label: '凉寒·清热',
    tags: ['li','jinyinhua','lvdou','kugua','bailuobo','xiangjiao','bocai','ningmeng','mihoutao','zhizi','yinmi','fanqie','huanggua','donggua','lianou','haidai','doufu','baicai','qiezi'].map(k => {
      const e = INGREDIENT_DICT[k]; return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
  neutral: {
    label: '平性·滋养',
    tags: ['fengmi','yiner','baihe','lianzi','shanyao','gouqi','heizhima','xiaomi','pingguo','huluobo','niunai','jidan','niurou','jiyu','bingtang','papaya','tudou','dami','miantiao','muer','xianggu','huasheng','hongdou','heidou','hongshu','putaogan','yumi','baibian','yanmai','heimi'].map(k => {
      const e = INGREDIENT_DICT[k]; return { zh: e.zh, icon: e.icon, color: e.color }
    }),
  },
};

// ── 身体状态 → 食养推荐映射（导购识别用）──
// 用户输入状态关键词 → 系统推荐对应的食材
export interface BodyStateRule {
  keywords: string[]
  label: string            // UI 展示名
  icon: string
  ingredients: string[]    // 推荐食材 key
  copy: string             // 导购话术
  avoidCopy: string        // 暂不建议的提醒
}

export const BODY_STATE_RULES: BodyStateRule[] = [
  {
    keywords: ['换季','感冒','着凉','畏寒','发冷','受寒'],
    label: '换季易感',
    icon: '🤧',
    ingredients: ['jiang','hongzao','nangua','dasuan','jidan'],
    copy: '换季温差大、容易着凉时，一碗温热食养帮身体暖起来——生姜与南瓜是很多人熟悉的暖身搭配。',
    avoidCopy: '建议暂缓冰饮和生冷食物',
  },
  {
    keywords: ['喉咙痛','嗓子疼','咽喉','干痒','咽痛','声音嘶哑','用嗓'],
    label: '咽喉不适',
    icon: '🗣️',
    ingredients: ['li','jinyinhua','fengmi','yiner'],
    copy: '用嗓多、嗓子干痒时的温和食养选择——冰糖雪梨配一点金银花，给咽喉一点舒缓的陪伴。',
    avoidCopy: '建议暂缓辛辣和油炸食物',
  },
  {
    keywords: ['熬夜','缺觉','加班','通宵','失眠','睡不好','眼疲劳','用眼'],
    label: '熬夜后的温柔',
    icon: '🌙',
    ingredients: ['gouqi','yiner','lianzi','heizhima','baihe'],
    copy: '熬完夜，给身体一点温柔补偿——一碗银耳莲子羹，润润的，也好消化。',
    avoidCopy: '建议尽量规律作息，食养为辅',
  },
  {
    keywords: ['上火','长痘','口腔溃疡','火气','口干','便秘'],
    label: '容易上火',
    icon: '🔥',
    ingredients: ['lvdou','kugua','jinyinhua','xiangjiao','li'],
    copy: '火气大的时候，来点清润的——绿豆汤配凉拌苦瓜，帮身体清爽一下。',
    avoidCopy: '建议暂缓辛辣油炸和过烫食物',
  },
  {
    keywords: ['秋燥','干咳','干燥','皮肤干','口干舌燥'],
    label: '秋燥润养',
    icon: '🍂',
    ingredients: ['li','yiner','fengmi','baihe','ningmeng'],
    copy: '天气转干，记得多润一润——梨与银耳是秋冬很搭的温润组合。',
    avoidCopy: '建议多补水，保持室内湿度',
  },
  {
    keywords: ['不消化','积食','撑','油腻','吃多','胃胀','没胃口'],
    label: '饮食油腻',
    icon: '🍖',
    ingredients: ['shanzha','chenpi','bailuobo','papaya','dasuan'],
    copy: '这顿吃得有点多？饭后一杯陈皮山楂水，给肠胃减减负。',
    avoidCopy: '建议细嚼慢咽，少食多餐',
  },
  {
    keywords: ['术后','恢复','体弱','虚','病后','调养'],
    label: '恢复期',
    icon: '💪',
    ingredients: ['niurou','jiyu','jidan','nangua','shanyao','hongzao'],
    copy: '身体恢复期，需要温和且有营养的补给——鲫鱼汤配蒸南瓜，好消化又补充元气。',
    avoidCopy: '恢复期饮食建议以清淡为主，结合自身情况选择',
  },
  {
    keywords: ['经期','姨妈','肚子疼','生理期'],
    label: '经期调养',
    icon: '🌸',
    ingredients: ['hongzao','guiyuan','jiang','niunai','hetao'],
    copy: '特殊时期，给自己一杯暖暖的红枣桂圆水。',
    avoidCopy: '建议避免生冷食物',
  },
];

// ── 文案生成 ──
export interface ShiyangCopyInput {
  ingredients: string[]      // ingredient keys
  scene?: string             // 用户当前场景
}

export interface ShiyangCopyOutput {
  cardTitle: string          // 卡片标题
  cardDetail: string         // 卡片正文（食养参考）
  disclaimer: string         // 声明
}

export function generateShiyangCopy(input: ShiyangCopyInput): ShiyangCopyOutput {
  const entries = input.ingredients
    .map(k => INGREDIENT_DICT[k])
    .filter(Boolean)

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
    : allAudiences.length ? `适合${allAudiences.slice(0, 3).join('、')}的日常搭配` : '传统食养搭配'

  const detail = `${natureStr}\n传统食养参考：${allBenefits.slice(0, 4).join('、')}。${subTitle}。`

  return {
    cardTitle: title,
    cardDetail: detail,
    disclaimer: SHIYANG_DISCLAIMER,
  }
}

// ── 导购：根据状态关键词返回推荐 ──
export function getIngredientsByBodyState(text: string): BodyStateRule | null {
  const t = (text || '').toLowerCase()
  for (const rule of BODY_STATE_RULES) {
    if (rule.keywords.some(k => t.includes(k))) return rule
  }
  return null
}

// 获取某个食材的完整信息
export function getIngredient(key: string): IngredientEntry | undefined {
  return INGREDIENT_DICT[key]
}

// 按性味分组输出（渲染顺序）
export const SHIYANG_NATURE_ORDER = ['温','微温','平','微寒','凉','寒']

// ── 由「性」推导适合体质人群（王琦九分法）──
// 食材字典只记录「性」(温/微温/平/微寒/凉/寒)，未记录「味」，
// 故「适合人群」依据传统食养性味理论从「性」推导，不再手写状态描述。
// 结论均为食养文化参考、非医疗诊断，须与页面免责声明一并展示。
export const CONSTITUTION_TYPES = ['平和质','气虚质','阳虚质','阴虚质','痰湿质','湿热质','血瘀质','气郁质','特禀质'] as const

type NatureKey = '温' | '微温' | '平' | '微寒' | '凉' | '寒'

// 性 → 适合体质：温/微温助阳散寒，凉/寒清热生津，平性温和普适
const NATURE_SUITABLE: Record<NatureKey, string[]> = {
  '温':   ['阳虚质', '气虚质', '平和质'],
  '微温': ['阳虚质', '气虚质', '平和质'],
  '平':   ['平和质', '各类体质日常皆可'],
  '微寒': ['阴虚质', '平和质'],
  '凉':   ['阴虚质', '湿热质', '平和质'],
  '寒':   ['湿热质', '阴虚质'],
}

// 性 → 宜少吃的体质（反向推导，提升安全提示的完整性）
const NATURE_AVOID: Partial<Record<NatureKey, string[]>> = {
  '温':   ['阴虚质', '湿热质'],
  '微温': ['阴虚质', '湿热质'],
  '微寒': ['阳虚质'],
  '凉':   ['阳虚质', '气虚质'],
  '寒':   ['阳虚质', '气虚质'],
  // 平性无明确宜少吃群体
}

// ── 由「味」推导适合体质（王琦九分法）──
// 甘补和中、苦清燥、辛行散、酸收敛、咸软坚、淡渗利、涩固涩。
// 与「性」互补，使综合结论更贴合传统食养理论。
const FLAVOR_SUITABLE: Record<string, string[]> = {
  '甘': ['平和质', '气虚质'],
  '苦': ['湿热质', '阴虚质'],
  '辛': ['气郁质', '血瘀质'],
  '酸': ['气虚质', '特禀质'],
  '咸': ['血瘀质', '痰湿质'],
  '淡': ['湿热质', '痰湿质'],
  '涩': ['气虚质'],
}
const FLAVOR_AVOID: Partial<Record<string, string[]>> = {
  '苦': ['阳虚质'],
  '辛': ['气虚质'],
}

// 食材 key → 味（甘/苦/酸/辛/咸/淡/涩）。字典条目未存「味」，集中维护于此。
export const FLAVOR_BY_KEY: Record<string, string> = {
  jiang: '辛', hongzao: '甘', guiyuan: '甘', hetao: '甘', cong: '辛', dasuan: '辛', nangua: '甘',
  shanzha: '酸', chenpi: '辛', jirou: '甘', zhurou: '甘', xia: '甘', paigu: '甘', yangrou: '甘',
  li: '甘', jinyinhua: '甘', lvdou: '甘', kugua: '苦', bailuobo: '辛', xiangjiao: '甘', bocai: '甘',
  yinmi: '甘', fanqie: '甘', huanggua: '甘', donggua: '甘', lianou: '甘', haidai: '咸', doufu: '甘',
  baicai: '甘', qiezi: '甘',
  fengmi: '甘', yiner: '甘', baihe: '甘', lianzi: '甘', shanyao: '甘', gouqi: '甘', heizhima: '甘',
  xiaomi: '甘', pingguo: '甘', huluobo: '甘', niunai: '甘', jidan: '甘', niurou: '甘', jiyu: '甘',
  ningmeng: '酸', mihoutao: '酸', xingren: '甘', papaya: '酸', zhizi: '甘', bingtang: '甘', tudou: '甘',
  dami: '甘', miantiao: '甘', muer: '甘', xianggu: '甘',
  hongtang: '甘', huangqi: '甘', danggui: '甘', songzi: '甘', lizhi: '甘', huasheng: '甘', hongdou: '甘',
  heidou: '甘', hongshu: '甘', putaogan: '甘', yumi: '甘', baibian: '甘', yanmai: '甘', heimi: '甘',
}

// ── 综合多食材的「性」+「味」，给出整体适合体质结论 ──
// 计分模型：每个食材按「性」与「味」分别对体质加分/减分，跨全部食材累加，
// 正分最高的若干体质为「更适合」，负分为「宜少吃」。避免逐条罗列、也避免只看单一「性」。
export interface ConstitutionFit {
  dominant: string        // 占比最高的「性」
  dominantCount: number
  total: number
  isMixed: boolean        // 是否混合多种「性」
  suitable: string[]      // 更适合的体质（按得分降序，取正分前若干）
  avoid: string[]         // 宜少吃的体质（负分）
}

export function analyzeConstitutionFit(entries: IngredientEntry[]): ConstitutionFit | null {
  const list = (entries || []).filter(Boolean)
  if (!list.length) return null

  const score: Record<string, number> = {}
  const add = (cons: string[] | undefined, delta: number) => {
    for (const c of cons || []) {
      if (!(CONSTITUTION_TYPES as readonly string[]).includes(c)) continue // 跳过非九体质键（如「各类体质日常皆可」展示短语）
      score[c] = (score[c] || 0) + delta
    }
  }
  const tally: Record<string, number> = {}

  for (const e of list) {
    const n = (e.nature || '').trim() as NatureKey
    if (n in NATURE_SUITABLE) {
      add(NATURE_SUITABLE[n], 1)
      add(NATURE_AVOID[n], -1)
    } else {
      add(['平和质'], 1) // 未知性兜底为平和质通用
    }
    const f = FLAVOR_BY_KEY[e.zh]
    if (f && FLAVOR_SUITABLE[f]) {
      add(FLAVOR_SUITABLE[f], 1)
      add(FLAVOR_AVOID[f], -1)
    }
    if (n) tally[n] = (tally[n] || 0) + 1
  }

  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1])
  const suitable = ranked.filter(([, v]) => v > 0).slice(0, 3).map(([c]) => c)
  const avoid = ranked.filter(([, v]) => v < 0).map(([c]) => c)
  const dominant = Object.entries(tally).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return SHIYANG_NATURE_ORDER.indexOf(a[0]) - SHIYANG_NATURE_ORDER.indexOf(b[0])
  })[0]?.[0] || '平'

  return {
    dominant,
    dominantCount: tally[dominant] || 0,
    total: list.length,
    isMixed: Object.keys(tally).length > 1,
    suitable,
    avoid,
  }
}
