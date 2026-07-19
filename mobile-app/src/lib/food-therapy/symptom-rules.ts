// 人群症状规则库（方案「第二层数据库」）
// 4 大类：咽喉 / 经期 / 长期体质 / 临时场景
// 每条规则含：优先级食疗标签、禁忌性味、禁忌食疗标签、提醒文案。
// 默认以 TS 常量实现（与 shiyang-dictionary 一致，便于前端直用）；
// 现已支持从 DB 注入覆盖：小程序端拉取 symptom_rules 后调用 setActiveRules()，
// 运营可在 admin-web 免发版增删改规则。迁移未执行/加载失败时回退本默认集。

import type { FitRule } from './types'

// 默认规则集（硬编码兜底，与迁移 00101 种子一致）
export const DEFAULT_SYMPTOM_RULES: FitRule[] = [
  // ── 一、咽喉类 ──
  {
    id: 'throat-sore',
    category: 'throat',
    label: '咽喉干痒/不适',
    keywords: ['咽喉', '嗓子', '喉咙', '干痒', '咽痛', '用嗓', 'K歌', '唱歌', '讲课', '主播'],
    priorityHealthTags: ['润肺止咳', '清热降火'],
    banNatures: ['温热', '大热'],
    banHealthTags: ['温中散寒'],
    remindText: '少辛辣过烫，忌烟酒刺激，温饮润喉',
  },
  {
    id: 'throat-voice',
    category: 'throat',
    label: '用嗓过度',
    keywords: ['用嗓', '嗓子哑', '讲课', '主播', '嘶哑', '说话多', '喊麦'],
    priorityHealthTags: ['润肺止咳', '滋阴润燥'],
    banNatures: ['大热'],
    banHealthTags: [],
    remindText: '温饮润喉，避免冰饮与辛辣',
  },

  // ── 二、经期类 ──
  {
    id: 'menstruation',
    category: 'menstruation',
    label: '经期/生理期',
    keywords: ['经期', '大姨妈', '生理期', '例假', '月经', '痛经', '宫寒'],
    priorityHealthTags: ['补气养血', '温中散寒'],
    banNatures: ['寒凉', '大寒'],
    banHealthTags: ['清热降火', '利水消肿'],
    remindText: '忌生冷寒凉，宜温饮温食，注意保暖',
  },

  // ── 三、长期体质类 ──
  {
    id: 'constitution-fire',
    category: 'constitution',
    label: '易上火体质',
    keywords: ['易上火', '上火', '长痘', '口腔溃疡', '怕热', '湿热'],
    priorityHealthTags: ['清热降火', '滋阴润燥'],
    banNatures: ['温热', '大热'],
    banHealthTags: [],
    remindText: '少辛辣温补，多清润滋阴',
  },
  {
    id: 'constitution-cold',
    category: 'constitution',
    label: '畏寒怕冷',
    keywords: ['畏寒', '怕冷', '手脚凉', '体寒', '宫寒', '阳虚'],
    priorityHealthTags: ['温中散寒', '补气养血'],
    banNatures: ['寒凉', '大寒'],
    banHealthTags: ['清热降火'],
    remindText: '宜温补，忌生冷寒凉',
  },
  {
    id: 'constitution-spleen',
    category: 'constitution',
    label: '脾胃偏弱',
    keywords: ['脾胃', '消化弱', '胃弱', '容易胀', '脾虚', '积食', '没胃口'],
    priorityHealthTags: ['健脾养胃', '消食化积'],
    banNatures: [],
    banHealthTags: [],
    remindText: '七分饱，细嚼慢咽，忌暴饮暴食',
  },
  {
    id: 'constitution-sleep',
    category: 'constitution',
    label: '睡眠浅/失眠',
    keywords: ['睡眠浅', '失眠', '睡不好', '多梦', '入睡难', '焦虑睡'],
    priorityHealthTags: ['安神助眠', '补气养血'],
    banNatures: ['大热'],
    banHealthTags: [],
    remindText: '晚间宜清淡温润，忌兴奋刺激',
  },

  // ── 四、临时场景类 ──
  {
    id: 'scene-stayup',
    category: 'scene',
    label: '熬夜后',
    keywords: ['熬夜', '加班', '通宵', '晚睡', '夜班'],
    priorityHealthTags: ['补气养血', '安神助眠'],
    banNatures: ['大热'],
    banHealthTags: [],
    remindText: '补气血的同时早点休息',
  },
  {
    id: 'scene-greasy',
    category: 'scene',
    label: '油腻饮食后',
    keywords: ['油腻', '吃多', '撑', '积食', '火锅', '烧烤', '大餐', '解腻'],
    priorityHealthTags: ['消食化积', '清热降火'],
    banNatures: ['温热'],
    banHealthTags: [],
    remindText: '解腻消食，适量为宜',
  },
  {
    id: 'scene-season',
    category: 'scene',
    label: '换季温差',
    keywords: ['换季', '降温', '温差', '着凉', '感冒前期', '冷'],
    priorityHealthTags: ['温中散寒', '补气养血'],
    banNatures: ['寒凉', '大寒'],
    banHealthTags: ['清热降火'],
    remindText: '注意保暖，温食护体',
  },
  {
    id: 'scene-autumn',
    category: 'scene',
    label: '秋燥',
    keywords: ['秋燥', '干燥', '皮肤干', '口干', '鼻干', '燥'],
    priorityHealthTags: ['滋阴润燥', '润肺止咳'],
    banNatures: ['大热'],
    banHealthTags: [],
    remindText: '多润少燥，忌辛辣助火',
  },
  {
    id: 'scene-exercise',
    category: 'scene',
    label: '运动后',
    keywords: ['运动', '健身', '出汗', '锻炼', '跑步', '撸铁'],
    priorityHealthTags: ['补气养血'],
    banNatures: ['大寒'],
    banHealthTags: [],
    remindText: '运动后可温补，忌立刻冰饮',
  },
]

// ── 运行时激活规则（可被 DB 覆盖）──
let ACTIVE_RULES: FitRule[] = DEFAULT_SYMPTOM_RULES

// 返回当前激活规则（DB 注入或默认兜底）
export function getActiveRules(): FitRule[] {
  return ACTIVE_RULES
}

// DB 加载成功后注入覆盖（空数组或异常时不覆盖，保留兜底）
export function setActiveRules(rules: FitRule[] | null | undefined): void {
  if (Array.isArray(rules) && rules.length > 0) ACTIVE_RULES = rules
}

// 兼容别名：保持既有 import { SYMPTOM_RULES } 不破坏（等价于默认集）
export const SYMPTOM_RULES = DEFAULT_SYMPTOM_RULES

// 关键词匹配：将用户输入的身体状态/场景文本解析为规则（取命中最多的）
export function resolveSymptomRule(text: string): FitRule | null {
  const t = (text || '').trim()
  if (!t) return null
  let best: { rule: FitRule; score: number } | null = null
  for (const r of getActiveRules()) {
    let score = 0
    for (const kw of r.keywords) {
      if (t.includes(kw)) score += 1
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { rule: r, score }
    }
  }
  return best?.rule ?? null
}

export function getRuleById(id: string): FitRule | undefined {
  return getActiveRules().find((r) => r.id === id)
}

export function listRulesByCategory(category: FitRule['category']): FitRule[] {
  return getActiveRules().filter((r) => r.category === category)
}
