// ============================================================
// 科目化自动派生（智能化内核）
// ------------------------------------------------------------
// 纯函数、零网络依赖。把商品已有的食养信号（health_tag / overall_nature /
// food_stage / 名称·食材关键词 / 营养）映射为「科目 key」集合。
// 与 subject-backfill Edge Function 内的规则保持一致（backfill 为服务端幂等回算）。
// 复用既有 food-therapy 引擎信号，不另起炉灶。
// ============================================================

import type { Product, UserHealthProfile } from '@/db/types'

/** 平台全局科目 key（与迁移 20260802_product_subjects 种子一致） */
export const ALL_SUBJECT_KEYS = [
  'spleen', 'sleep', 'heat', 'damp', 'women', 'kids', 'season', 'sugar',
] as const
export type SubjectKey = typeof ALL_SUBJECT_KEYS[number]

/** health_tag（固定食疗标签库 9 项）→ 科目 */
const HEALTH_TAG_TO_SUBJECT: Record<string, SubjectKey[]> = {
  '健脾养胃': ['spleen'],
  '消食化积': ['spleen'],
  '温中散寒': ['spleen'],
  '舒缓安适': ['sleep'],
  '清热降火': ['heat'],
  '滋阴润燥': ['heat'],
  '润养舒喉': ['heat'],
  '利水消肿': ['damp'],
  '补气养血': ['women'],
}

const COLD_NATURES = ['大寒', '寒凉', '凉', '微凉']
const WARM_NATURES = ['微温', '温', '温热', '大热']

/** 名称 / 食材 / 描述 关键词 → 科目（低频补充信号） */
const KEYWORD_SUBJECT: { kw: string[]; sub: SubjectKey }[] = [
  { kw: ['儿童', '宝宝', '小孩', '成长', '益智', '牛磺酸', 'dha', '学生', '钙'], sub: 'kids' },
  { kw: ['女性', '经期', '月经', '气血', '养颜', '美容', '孕', '哺乳', '宝妈'], sub: 'women' },
  { kw: ['控糖', '低糖', '无糖', '轻食', '代餐', '粗粮', '膳食纤维', '减脂', '健身餐'], sub: 'sugar' },
  { kw: ['节气', '时令', '当季', '应季', '春', '夏', '秋', '冬'], sub: 'season' },
  { kw: ['安神', '助眠', '安睡', '失眠', '百合', '酸枣仁', '桂圆', '莲子'], sub: 'sleep' },
  { kw: ['祛湿', '利湿', '消肿', '红豆', '薏米', '芡实'], sub: 'damp' },
]

/** 单品派生科目 key 集合（去重，顺序稳定） */
export function deriveSubjectKeys(p: Product): SubjectKey[] {
  const set = new Set<SubjectKey>()
  const tags = (p.health_tag || []).filter(Boolean)
  for (const t of tags) {
    const subs = HEALTH_TAG_TO_SUBJECT[t]
    if (subs) subs.forEach((s) => set.add(s))
  }

  const nature = (p.overall_nature || (p.therapy_json as any)?.overall_nature_code || '') as string
  if (COLD_NATURES.includes(nature)) set.add('heat')
  if (WARM_NATURES.includes(nature)) set.add('spleen')

  const stage = (p.food_stage || '') as string
  if (stage.includes('调')) set.add('spleen')
  if (stage.includes('清')) set.add('heat')
  if (stage.includes('补')) { set.add('women'); set.add('kids') }

  const text = (
    (p.name || '') + ' ' + (p.description || '') + ' ' +
    ((p.ingredients as string[] | undefined)?.join(' ') || '')
  ).toLowerCase()
  for (const { kw, sub } of KEYWORD_SUBJECT) {
    if (kw.some((k) => text.includes(k.toLowerCase()))) set.add(sub)
  }

  const sugar = (p.nutrition as any)?.sugar_g
  if (typeof sugar === 'number' && sugar <= 5) set.add('sugar')

  // 稳定顺序：按 ALL_SUBJECT_KEYS 顺序输出，便于前端展示一致
  return ALL_SUBJECT_KEYS.filter((k) => set.has(k))
}

/** 基于用户结构化健康画像，匹配其「最可能需要」的科目（智能化高亮用）。
 *  仅食养参考，不替代医嘱。 */
export function subjectKeysForProfile(hp: UserHealthProfile | null): SubjectKey[] {
  if (!hp) return []
  const set = new Set<SubjectKey>()
  const goals = (hp.health_goals || []).map((g) => g.toLowerCase())
  const conditions = (hp.chronic_conditions || []).map((c) => c.toLowerCase())
  const states = (hp.body_states || []).map((s) => s.toLowerCase())
  const all = [...goals, ...conditions, ...states]

  const has = (...keys: string[]) => keys.some((k) => all.some((a) => a.includes(k)))

  if (has('控糖', '减脂', '清热', '血糖')) set.add('sugar')
  if (has('控糖', '清热', '火', '燥')) set.add('heat')
  if (has('护胃', '脾胃', '胃', '消化')) set.add('spleen')
  if (has('眠', '安睡', '失', '焦虑', '压力')) set.add('sleep')
  if (has('湿', '肿', '水')) set.add('damp')
  if (hp.gender === '女' || has('经', '孕', '哺乳', '气血', '美容')) set.add('women')
  if (hp.age_group === '儿童' || hp.age_group === '青少年') set.add('kids')
  return ALL_SUBJECT_KEYS.filter((k) => set.has(k))
}
