// 情绪编译三阶段翻译规则库（对应方案 §4.1）
// ------------------------------------------------------------
// 把抽象的「功能→场景→情绪→身份」翻译逻辑固化为可配置规则模板，
// 支持后台动态更新（运营在 category_emotion_profiles / 独立规则表热更新），无需发版。
//
// 三阶段：
//   阶段一 功能→场景：提取核心功能 → 匹配高频消费场景 → 生成场景化问句
//   阶段二 场景→情绪：锚定场景 → 挖掘内心潜台词 → 第二人称状态确认
//   阶段三 情绪→身份：情绪满足 → 映射自我认同 → 正向身份标签确认
//
// 本文件是「规则种子」。编译引擎（emotion-compile 云函数）与商家预览均可消费本模块。
// 后续运营迭代只需改 STAGE* 常量（或改为从 DB 读取），前端/函数无需重新发版。

export interface Stage1Rule {
  /** 功能属性分类（可含多个，按顿号分隔） */
  functionAttr: string
  /** 匹配典型场景 */
  scene: string
  /** 输出句式模板（__ 为占位符） */
  template: string
  /** 落地示例 */
  example: string
}

export interface Stage2Rule {
  /** 典型场景 */
  scene: string
  /** 核心情绪锚点 */
  emotionAnchor: string
  /** 输出句式模板 */
  template: string
  /** 落地示例 */
  example: string
}

export interface Stage3Rule {
  /** 情绪满足点 */
  emotionSatisfaction: string
  /** 对应身份标签 */
  identityTag: string
  /** 输出句式模板 */
  template: string
  /** 落地示例 */
  example: string
}

// ============ 阶段一：功能 → 场景 ============
export const STAGE1_FUNCTION_TO_SCENE: Stage1Rule[] = [
  { functionAttr: '热饮、烘焙甜品', scene: '深夜加班', template: '加班到__点，需要一口__？', example: '加班到十点，需要一口暖的？' },
  { functionAttr: '轻食、单人餐', scene: '周末一人食', template: '周末不想出门，又想吃得__？', example: '周末不想出门，又想吃得精致点？' },
  { functionAttr: '按摩、SPA、采耳', scene: '下班疲惫', template: '累了一天，浑身发紧？', example: '累了一天，浑身发紧？' },
  { functionAttr: '茶饮、咖啡馆', scene: '午后摸鱼', template: '下午三点，有点撑不住了？', example: '下午三点，有点撑不住了？' },
  // 水果 / 生鲜
  { functionAttr: '水果、鲜果、生鲜', scene: '午后小憩', template: '嘴里没味道的时候，想来点__？', example: '嘴里没味的时候，想来点清爽的？' },
  { functionAttr: '零食、坚果', scene: '独处追剧', template: '一个人安安静静的时候，就想吃__？', example: '一个人安安静静，就想嚼点什么？' },
  // 娱乐
  { functionAttr: '娱乐、电影、KTV', scene: '朋友聚会', template: '好久没彻底放松了，想去__？', example: '好久没彻底放松了，想去嗨一下？' },
  // 运动/健身
  { functionAttr: '运动、健身、瑜伽', scene: '下班后', template: '坐了一天，身体想要__？', example: '坐了一天，身体想要动一动？' },
]

// ============ 阶段二：场景 → 情绪 ============
export const STAGE2_SCENE_TO_EMOTION: Stage2Rule[] = [
  { scene: '深夜加班', emotionAnchor: '疲惫 + 孤独 + 不将就', template: '明明很累了，又不想随便对付自己？', example: '明明很累了，又不想随便对付自己？' },
  { scene: '周末一人食', emotionAnchor: '松弛 + 独处 + 自我取悦', template: '就想安安静静待着，不用说话不用社交？', example: '就想安安静静待着，不用说话不用社交？' },
  { scene: '下班放松', emotionAnchor: '解压 + 放空 + 回血', template: '不想带脑子，就想发会儿呆？', example: '不想带脑子，就想发会儿呆？' },
  // 水果 / 生鲜
  { scene: '午后小憩', emotionAnchor: '清爽 + 小确幸 + 治愈', template: '不是饿，就是嘴里想有点清爽的？', example: '不是饿，就是嘴里想有点清爽的？' },
  // 独处
  { scene: '独处追剧', emotionAnchor: '自我取悦 + 松弛 + 小确幸', template: '这种时候，只想对自己好一点？', example: '这种时候，只想对自己好一点？' },
  // 社交
  { scene: '朋友聚会', emotionAnchor: '兴奋 + 分享 + 温暖', template: '好久没跟朋友们好好聚聚了？', example: '好久没跟朋友们好好聚聚了？' },
]

// ============ 阶段三：情绪 → 身份 ============
export const STAGE3_EMOTION_TO_IDENTITY: Stage3Rule[] = [
  { emotionSatisfaction: '独处放松', identityTag: '懂生活、会留白', template: '你是懂得给自己留呼吸空间的人', example: '你是懂得给自己留呼吸空间的人' },
  { emotionSatisfaction: '认真吃饭', identityTag: '爱自己、不将就', template: '你是再忙也会好好照顾自己的人', example: '你是再忙也会好好照顾自己的人' },
  { emotionSatisfaction: '尝试新鲜事物', identityTag: '有品味、懂生活', template: '你是愿意为美好体验买单的人', example: '你是愿意为美好体验买单的人' },
  // 水果 / 生鲜
  { emotionSatisfaction: '清爽治愈', identityTag: '爱自然、懂滋养', template: '你是知道身体想要什么的人', example: '你是知道身体想要什么的人' },
  // 自我取悦
  { emotionSatisfaction: '自我取悦', identityTag: '爱自己、值得', template: '你是对自己挺好的那种人', example: '你是对自己挺好的那种人' },
  // 社交
  { emotionSatisfaction: '社交温暖', identityTag: '重情义、懂陪伴', template: '你是愿意把时间花在重要的人身上的人', example: '你是愿意把时间花在重要的人身上的人' },
]

// ---------- 阶段选择器（模糊命中，未命中回退首条） ----------

/** 阶段一：功能属性 → 场景化问句（__ 占位可被 scenePlaceholder 替换） */
export function stage1(functionAttr: string, scenePlaceholder = '__'): string {
  const key = (functionAttr || '').split('、')[0]
  const rule = STAGE1_FUNCTION_TO_SCENE.find(r => functionAttr.includes(r.functionAttr.split('、')[0]) || functionAttr.includes(key)) || STAGE1_FUNCTION_TO_SCENE[0]
  return rule.template.replace(/__/g, scenePlaceholder)
}

/** 阶段二：场景 → 情绪状态确认（第二人称） */
export function stage2(scene: string): string {
  const rule = STAGE2_SCENE_TO_EMOTION.find(r => scene.includes(r.scene)) || STAGE2_SCENE_TO_EMOTION[0]
  return rule.template
}

/** 阶段三：情绪满足点 → 身份确认 */
export function stage3(emotionSatisfaction: string): string {
  const rule = STAGE3_EMOTION_TO_IDENTITY.find(r => emotionSatisfaction.includes(r.emotionSatisfaction)) || STAGE3_EMOTION_TO_IDENTITY[0]
  return rule.template
}

/** 全链路：给定功能属性 + 场景 + 情绪满足点，产出三阶段文案 */
export function applyThreeStage(opts: {
  functionAttr: string
  scene: string
  emotionSatisfaction: string
  scenePlaceholder?: string
}): { stage1: string; stage2: string; stage3: string } {
  return {
    stage1: stage1(opts.functionAttr, opts.scenePlaceholder),
    stage2: stage2(opts.scene),
    stage3: stage3(opts.emotionSatisfaction),
  }
}
