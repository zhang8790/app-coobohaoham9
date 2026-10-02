// 食材食疗 · 规则辅助（纯关键词，无 LLM/AI）
// ------------------------------------------------------------
// 仅保留本地规则能力：食类识别（resolveFoodType）与 NLU 结果类型。
// 原 LLM 网关（food-therapy-ai / 通义千问 Qwen）调用已全部移除，
// 咨询推荐引擎现 100% 走纯规则打分（见 consult-recommend.ts）。

export interface NluResult {
  matched_rule_id: string | null
  health_tags: string[]
  emotion_tags: string[]
  nature_hint: string
  food_type?: string | null // 用户点名的食类（水果/坚果/茶/汤…），用于收窄候选池
  source: 'rule'
}

// 类目关键词 → 归一化食类（供 food_type 识别；与 consult-recommend 的 FOOD_TYPE_MATCH 对齐）
const FOOD_TYPE_RULES: { type: string; kw: string[] }[] = [
  { type: '水果', kw: ['水果', '果', '鲜果', '果蔬'] },
  { type: '坚果', kw: ['坚果', '核桃', '腰果', '花生', '瓜子', '果仁'] },
  { type: '茶', kw: ['茶', '茶饮'] },
  { type: '汤羹', kw: ['汤', '羹', '煲'] },
  { type: '蔬菜', kw: ['蔬菜', '青菜', '菜'] },
  { type: '主食', kw: ['饭', '粥', '面', '主食', '杂粮', '米'] },
  { type: '零食', kw: ['零食', '糕点', '饼干', '糖果', '蜜饯'] },
  { type: '饮', kw: ['饮', '汁', '奶', '酸奶'] },
]

export function resolveFoodType(text: string): string | null {
  for (const f of FOOD_TYPE_RULES) {
    if (f.kw.some((k) => text.includes(k))) return f.type
  }
  return null
}
