// @title 工艺礼品材质知识库（合规：仅 特性 / 寓意 / 体验，零功效宣称）
//
// 设计铁律：药膳手串 / 工艺礼品是「文创 + 香养体验」配饰，不是药品、不是疗法。
// 因此材质文案只描述「物理 / 感官特性」「文化寓意（吉祥话）」「佩戴体验」三类，
// 绝不出现 安神 / 活血 / 养生 / 功效 / 改善 等医疗或功效宣称（gift-shield 会拦截）。
//
// 复用范式：与 food-therapy / ingredient-analyze 一致的「知识库 + 纯函数派生」，
// 但本库为前端 TS 模块（轻量、随构建发布，无需迁移 / EF）。
// 若后续要运营后台可编辑，再升级为 Supabase 表（对齐 food_safety_libs）。

export interface MaterialInfo {
  /** 规范展示名 */
  name: string
  /** 材质特性（物理 / 感官，非功效） */
  traits: string
  /** 文化寓意（吉祥话，gift-shield 放行词） */
  meaning: string
  /** 佩戴 / 使用体验 */
  experience: string
}

/**
 * 材质知识库（常见手串 / 工艺礼品材质）。
 * 所有文案已避开 GIFT_FORBIDDEN_WORDS；渲染前仍统一过 giftShieldCopy 兜底。
 */
export const MATERIAL_KB: Record<string, MaterialInfo> = {
  '玛瑙': {
    name: '玛瑙',
    traits: '质地温润细腻，天然层叠纹彩，触手生温',
    meaning: '平安喜乐，顺遂安康，温润相伴',
    experience: '色泽沉静耐看，日常佩戴显气质',
  },
  '沉香': {
    name: '沉香',
    traits: '油脂温润，天然香韵，木质致密',
    meaning: '清雅自在，心境从容',
    experience: '香气清幽，把玩生香，手感油润',
  },
  '檀香': {
    name: '檀香',
    traits: '醇厚木香，纹理细密，油脂温润',
    meaning: '安宁祥和，自在从容',
    experience: '香气沉静，手感油润，把玩舒心',
  },
  '菩提': {
    name: '菩提子',
    traits: '质地坚实，天然星月纹路，久盘生浆',
    meaning: '坚韧平和，平安顺意',
    experience: '盘玩手感温厚，包浆后更显温润',
  },
  '水晶': {
    name: '水晶',
    traits: '通透莹润，天然冰裂包裹，折光灵动',
    meaning: '纯净明朗，好运相伴',
    experience: '清爽观感，搭配轻盈，光影灵动',
  },
  '银': {
    name: '银饰',
    traits: '光泽柔润，亲肤凉爽，简约百搭',
    meaning: '恒久纯净，温婉相伴',
    experience: '贴肤清凉，易养护光亮，搭配灵动',
  },
  '玉': {
    name: '玉石',
    traits: '温润剔透，质地坚韧，天然水头',
    meaning: '平安如意，温润如玉',
    experience: '贴肤清凉，典雅大方，佩戴显气质',
  },
  '翡翠': {
    name: '翡翠',
    traits: '翠色温润，质地坚韧，天然翠性',
    meaning: '平安如意，温润典雅',
    experience: '贴肤清凉，色泽灵动，佩戴显气质',
  },
  '珍珠': {
    name: '珍珠',
    traits: '珠光温雅，天然虹彩，圆润柔光',
    meaning: '圆满温婉，柔美相伴',
    experience: '柔润光泽，优雅百搭，衬显肤色',
  },
  '黑曜石': {
    name: '黑曜石',
    traits: '深邃油亮，天然火山玻璃质，质感沉稳',
    meaning: '坚毅守护，沉静内敛',
    experience: '冷调光泽，搭配酷感，手感厚实',
  },
  '木': {
    name: '木质',
    traits: '木质细腻，天然木纹，温润手感',
    meaning: '沉稳内敛，自然相伴',
    experience: '天然木香，盘玩温厚，质朴耐看',
  },
  '黄花梨': {
    name: '黄花梨',
    traits: '木质致密，天然鬼脸纹，油润生光',
    meaning: '沉稳内敛，自然相伴',
    experience: '纹理华美，盘玩温厚，把玩生包浆',
  },
  '紫檀': {
    name: '紫檀',
    traits: '木质坚硬，天然牛毛纹，色泽沉红',
    meaning: '沉稳内敛，恒久相伴',
    experience: '手感细腻油润，久盘色泽更深',
  },
  '石榴石': {
    name: '石榴石',
    traits: '色泽浓郁，天然包裹，晶莹透亮',
    meaning: '温暖活力，热情相伴',
    experience: '明艳搭配，衬显气色，光影灵动',
  },
  '碧玺': {
    name: '碧玺',
    traits: '色彩丰富，天然双色，折光绚丽',
    meaning: '多彩喜悦，好运相伴',
    experience: '明丽搭配，灵动闪烁，显活力',
  },
  '蜜蜡': {
    name: '蜜蜡',
    traits: '质地轻暖，天然流淌纹，色如蜜糖',
    meaning: '温润欢喜，岁月静好',
    experience: '轻巧贴肤，暖色调柔润，把玩温厚',
  },
  '砗磲': {
    name: '砗磲',
    traits: '瓷白温润，天然层理，质感细腻',
    meaning: '清净平和，自在欢喜',
    experience: '洁白温雅，搭配素净，触感润滑',
  },
  '朱砂': {
    name: '朱砂',
    traits: '色泽正红，质地温润，天然矿纹',
    meaning: '喜庆吉祥，红火相伴',
    experience: '色艳显气色，搭配素净更出彩',
  },
}

/**
 * 模糊匹配：商家填的材质标签 → 知识库条目。
 * 按 key 长度降序遍历，优先命中更具体的材质（如「沉香木」先命中「沉香」而非「木」）。
 */
export function lookupMaterial(raw: string): MaterialInfo | null {
  const r = (raw || '').trim()
  if (!r) return null
  if (MATERIAL_KB[r]) return MATERIAL_KB[r]
  const keys = Object.keys(MATERIAL_KB).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (r.includes(key) || key.includes(r)) return MATERIAL_KB[key]
  }
  return null
}
