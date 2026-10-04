/**
 * 体质快速测试引擎
 * 5道题 → 9种体质 → 推荐/慎用食材 + 推荐商品性味
 * 纯前端本地计算，不依赖网络
 */

import type { Product } from '@/db/types'
import { deriveProductStage, type ShiyangStage } from '@/utils/food-therapy/shiyang-stage'

// ── 体质定义 ──────────────────────────────────────────────────────────────

export interface ConstitutionType {
  key: string
  name: string
  emoji: string
  color: string         // 主色
  colorLight: string    // 浅色背景
  description: string   // 一句话体质描述
  characteristics: string[]  // 典型表现
  recommendNature: string[] // 宜食性味（对应 overall_nature）
  avoidNature: string[]     // 忌食性味
  recommendFoods: string[]   // 推荐食材 key
  avoidFoods: string[]      // 慎用食材 key
  healthGoals: string[]     // 对应健康目标
  bodyStates: string[]      // 对应 BODY_CROWD_OPTIONS
  recommendStage: ShiyangStage // 对应「清通调补固」调理阶段，用于「按调理路径」精准配对
}

export const CONSTITUTION_TYPES: Record<string, ConstitutionType> = {
  yangxu: {
    key: 'yangxu',
    name: '阳虚质',
    emoji: '🧊',
    color: '#15803D',
    colorLight: '#F0FDF4',
    description: '畏寒怕冷，手脚冰凉，容易疲劳',
    characteristics: ['手脚常年偏凉', '怕冷喜热', '容易疲劳乏力', '换季容易感冒'],
    recommendNature: ['温热', '微温', '平性'],
    avoidNature: ['大寒', '寒凉'],
    recommendFoods: ['jiang', 'yangrou', 'guiyuan', 'hongzao', 'hetao', 'nangua'],
    avoidFoods: ['lvdou', 'yinmi', 'kugua', 'xiangjiao'],
    healthGoals: ['补气养血', '温中散寒'],
    bodyStates: ['体虚怕冷'],
    recommendStage: '补',
  },
  yinxu: {
    key: 'yinxu',
    name: '阴虚质',
    emoji: '🔥',
    color: '#15803D',
    colorLight: '#F0FDF4',
    description: '口干咽燥，容易上火，手心发热',
    characteristics: ['经常觉得口干', '容易上火冒痘', '手脚心发热', '睡眠偏浅易醒'],
    recommendNature: ['寒凉', '微寒', '平性'],
    avoidNature: ['温热', '大热', '微温'],
    recommendFoods: ['梨', 'lvdou', 'yinmi', 'muer', 'jinyinhua', 'lianou'],
    avoidFoods: ['yangrou', 'jiang', 'dasuan', 'hetao', 'cong'],
    healthGoals: ['滋阴润燥', '清热降火'],
    bodyStates: ['易上火'],
    recommendStage: '清',
  },
  qixu: {
    key: 'qixu',
    name: '气虚质',
    emoji: '🌬️',
    color: '#15803D',
    colorLight: '#F0FDF4',
    description: '气短懒言，容易疲乏，抵抗力偏弱',
    characteristics: ['说话声音偏轻', '容易疲乏', '稍微活动就气喘', '容易感冒'],
    recommendNature: ['平性', '微温', '温热'],
    avoidNature: ['大寒', '寒凉'],
    recommendFoods: ['hongzao', 'hetao', 'paigu', 'jirou', 'guiyuan', 'nangua'],
    avoidFoods: ['kugua', 'lvdou'],
    healthGoals: ['补气养血', '健脾养胃'],
    bodyStates: ['体虚怕冷'],
    recommendStage: '补',
  },
  tanshi: {
    key: 'tanshi',
    name: '痰湿质',
    emoji: '💧',
    color: '#15803D',
    colorLight: '#F0FDF4',
    description: '身体困重，舌苔厚腻，面部易出油',
    characteristics: ['总觉得身体沉沉的', '舌苔厚腻', '面部或头发容易出油', '大便黏滞'],
    recommendNature: ['平性', '凉性', '寒性'],
    avoidNature: ['温热', '大热', '微温'],
    recommendFoods: ['yinmi', 'bailuobo', 'lianou', 'doufu', 'donggua', 'huanggua'],
    avoidFoods: ['yangrou', 'jirou', 'hetao', 'dasuan'],
    healthGoals: ['利水消肿', '清热降火'],
    bodyStates: [],
    recommendStage: '通',
  },
 shire: {
    key: 'shire',
    name: '湿热质',
    emoji: '🌿',
    color: '#15803D',
    colorLight: '#F0FDF4',
    description: '面部油光，易长痘，嘴里发苦',
    characteristics: ['脸上容易出油长痘', '嘴里偶尔发苦', '大便偏干或黏滞', '脾气偏急'],
    recommendNature: ['寒凉', '微寒', '平性'],
    avoidNature: ['温热', '大热', '微温'],
    recommendFoods: ['lvdou', 'yinmi', 'muer', 'huanggua', 'donggua', 'kugua'],
    avoidFoods: ['yangrou', 'jirou', 'jiang', 'hetao', 'cong', 'dasuan'],
    healthGoals: ['清热降火', '利水消肿'],
    bodyStates: ['易上火'],
    recommendStage: '清',
  },
  xueyu: {
    key: 'xueyu',
    name: '血瘀质',
    emoji: '🩸',
    color: '#15803D',
    colorLight: '#F0FDF4',
    description: '容易出现瘀斑，嘴唇颜色偏暗',
    characteristics: ['磕碰后容易留瘀青', '嘴唇颜色偏暗', '面色晦暗', '偶尔局部疼痛'],
    recommendNature: ['平性', '温性', '微温'],
    avoidNature: ['大寒'],
    recommendFoods: ['nangua', 'lianou', 'shanzha', 'cong', 'dasuan', 'hongzao'],
    avoidFoods: [],
    healthGoals: [],
    bodyStates: [],
    recommendStage: '固',
  },
  qiyu: {
    key: 'qiyu',
    name: '气郁质',
    emoji: '🌙',
    color: '#15803D',
    colorLight: '#F0FDF4',
    description: '情绪波动大，容易焦虑或低落',
    characteristics: ['情绪起伏较大', '容易焦虑或低落', '睡眠不太稳定', '对压力敏感'],
    recommendNature: ['平性', '微温', '温性'],
    avoidNature: ['大寒', '寒凉'],
    recommendFoods: ['guiyuan', 'shanzha', 'muer', 'lianou', 'nangua', 'hetao'],
    avoidFoods: [],
    healthGoals: ['舒缓安适', '补气养血'],
    bodyStates: [],
    recommendStage: '调',
  },
  pinghe: {
    key: 'pinghe',
    name: '平和质',
    emoji: '☯️',
    color: '#15803D',
    colorLight: '#F0FDF4',
    description: '身体状态较好，饮食睡眠正常',
    characteristics: ['睡眠质量不错', '胃口正常', '情绪相对稳定', '换季少生病'],
    recommendNature: ['平性', '微温', '微寒'],
    avoidNature: [],
    recommendFoods: ['lianou', 'fanqie', 'bailuobo', 'doufu', 'baicai', 'nangua'],
    avoidFoods: [],
    healthGoals: ['健脾养胃'],
    bodyStates: [],
    recommendStage: '固',
  },
}

// ── 测试题目 ──────────────────────────────────────────────────────────────

export interface TestQuestion {
  id: number
  question: string
  hint: string
  /** 结果页「分维度专业点评」的维度名（缺省回退 question） */
  dimLabel?: string
  options: {
    label: string
    value: number
    effect: Partial<Record<ConstitutionKey, number>>
    /** 选项的具体表现（答题时展示，帮用户对号入座；比 label 更细） */
    hint?: string
    /** 该表现指向的专业解读（结果页「依据」用，统一「提示…」口径，不含违禁词） */
    reading?: string
  }[]
}

/** 0=A, 1=B, 2=C, 3=D 对各体质的加分影响 */
type ConstitutionKey = keyof typeof CONSTITUTION_TYPES

/**
 * 题目设计原则（消除「人人平和质」偏置）：
 *  - 每题第 1 项「基本没有 / 说不清」为中性基线，effect 为空，不给任何体质加分；
 *    旧版该基线给平和质 +3，导致几乎人人测出平和，个性化形同虚设。
 *  - 平和质不再由选项主动加分，仅在「所有偏颇质最高分低于阈值」时作为兜底判定；
 *  - 每题只给与之强相关的偏颇质加分，覆盖 yangxu/yinxu/qixu/tanshi/shire/xueyu/qiyu 七类区分。
 */
export const TEST_QUESTIONS: TestQuestion[] = [
  {
    id: 1,
    question: '平时怕冷吗？',
    hint: '手脚温度、对冷的耐受',
    options: [
      { label: '手脚温暖，基本不怕冷', value: 0, effect: {} },
      { label: '偶尔怕冷，手脚偏凉', value: 1, effect: { yangxu: 2, qixu: 1 } },
      { label: '经常手脚冰凉', value: 2, effect: { yangxu: 3, qixu: 2 } },
      { label: '一年四季都怕冷，夏天也凉', value: 3, effect: { yangxu: 4, xueyu: 1 } },
    ],
  },
  {
    id: 2,
    question: '容易上火吗？',
    hint: '口干 / 冒痘 / 口腔溃疡等',
    options: [
      { label: '很少上火', value: 0, effect: {} },
      { label: '换季或熬夜时偶尔上火', value: 1, effect: { yinxu: 2, shire: 1 } },
      { label: '经常觉得口干、咽干', value: 2, effect: { yinxu: 3, shire: 2 } },
      { label: '频繁冒痘、口腔溃疡', value: 3, effect: { shire: 3, yinxu: 1, xueyu: 1 } },
    ],
  },
  {
    id: 3,
    question: '胃口和消化怎么样？',
    hint: '吃完饭后的感受',
    options: [
      { label: '胃口好，消化正常', value: 0, effect: {} },
      { label: '偶尔腹胀、容易累', value: 1, effect: { qixu: 2, tanshi: 1 } },
      { label: '经常腹胀、食欲不振', value: 2, effect: { qixu: 2, tanshi: 3 } },
      { label: '吃点就胀，大便偏黏', value: 3, effect: { tanshi: 4, qixu: 1 } },
    ],
  },
  {
    id: 4,
    question: '面色和气血怎么样？',
    hint: '唇色、气色、是否易留瘀青',
    options: [
      { label: '面色红润，精力尚可', value: 0, effect: {} },
      { label: '偶尔疲乏，气色一般', value: 1, effect: { qixu: 1 } },
      { label: '唇色偏暗、磕碰易留瘀青', value: 2, effect: { xueyu: 3, qixu: 1 } },
      { label: '面色晦暗、常现瘀斑', value: 3, effect: { xueyu: 4 } },
    ],
  },
  {
    id: 5,
    question: '情绪状态怎么样？',
    hint: '最近一个月的总体感受',
    options: [
      { label: '情绪平稳，心态不错', value: 0, effect: {} },
      { label: '偶尔焦虑或低落', value: 1, effect: { qiyu: 2 } },
      { label: '常感压力大、烦躁', value: 2, effect: { qiyu: 3 } },
      { label: '情绪起伏大，较难自控', value: 3, effect: { qiyu: 4, yinxu: 1 } },
    ],
  },
]

/**
 * 深度问诊题库（9 题 · 食养评估专用）
 * ----------------------------------------------------------------------------
 * 相比快速版（5 题）覆盖更全的中医体质自评维度，共 9 个专项：
 *   ① 寒热倾向 ② 汗出 ③ 精力 ④ 口咽与火热 ⑤ 睡眠 ⑥ 情绪 ⑦ 头身感觉 ⑧ 饮食消化 ⑨ 面色与瘀象
 * 每题选项给出「具体表现」（hint，答题时帮用户对号入座）与「专业解读」（reading，结果页
 * 依据链使用），口径统一为「提示…」，不出现诊断 / 辨证 / 疾病词。第 1 项为中性基线（effect 为空）。
 */
export const DEEP_BODY_QUESTIONS: TestQuestion[] = [
  {
    id: 1,
    dimLabel: '寒热倾向',
    question: '对冷热的整体耐受怎么样？',
    hint: '含手足温度、衣物增减、季节与空调环境下的反应',
    options: [
      { label: '寒热均衡', value: 0, effect: {}, hint: '手足温暖，不畏冷也不怕热，衣物与同龄人相当' },
      {
        label: '轻度畏寒',
        value: 1,
        effect: { yangxu: 2, qixu: 1 },
        hint: '手足偏凉（以指端、膝以下为多），较同龄人略怕冷，遇冷或空调环境加重',
        reading: '提示温煦偏弱，阳气不足以温养四肢',
      },
      {
        label: '明显畏寒',
        value: 2,
        effect: { yangxu: 3, qixu: 1, xueyu: 1 },
        hint: '手足常年不温，需多添衣被，食生冷后易腹部发凉或腹泻',
        reading: '提示阳气偏弱、温煦之力明显不足',
      },
      {
        label: '偏畏热',
        value: 3,
        effect: { yinxu: 3, shire: 1 },
        hint: '怕热、手足心偏热，喜冷饮，稍热即觉烦躁',
        reading: '提示津液偏少、内热偏盛',
      },
    ],
  },
  {
    id: 2,
    dimLabel: '汗出',
    question: '日常出汗的时机与多少，更接近哪种？',
    hint: '含活动后、夜间与汗后体感',
    options: [
      { label: '出汗正常', value: 0, effect: {}, hint: '气温高或运动后出汗，量适度，汗后不觉乏力' },
      {
        label: '动则易汗',
        value: 1,
        effect: { qixu: 3, yangxu: 1 },
        hint: '稍一活动就出汗，汗后疲乏、怕风，白天尤为明显',
        reading: '提示气的固摄偏弱、卫外不固',
      },
      {
        label: '夜间出汗',
        value: 2,
        effect: { yinxu: 3 },
        hint: '入睡后或睡中出汗，醒后汗止，常伴口干',
        reading: '提示津液偏少、夜间易外越',
      },
      {
        label: '汗多黏腻',
        value: 3,
        effect: { tanshi: 3, shire: 1 },
        hint: '汗出偏多、质地黏腻或汗味偏重，身体黏滞不爽',
        reading: '提示水湿偏盛、郁而偏热',
      },
    ],
  },
  {
    id: 3,
    dimLabel: '精力',
    question: '日常精神与疲劳后的恢复情况？',
    hint: '含白天精力、说话气力与恢复速度',
    options: [
      { label: '精力充沛', value: 0, effect: {}, hint: '一天精神尚可，劳累后休息即可恢复' },
      {
        label: '容易疲乏',
        value: 1,
        effect: { qixu: 3 },
        hint: '稍劳累就疲乏，懒得说话，休息后恢复偏慢',
        reading: '提示气力偏弱、推动不足',
      },
      {
        label: '气短懒言',
        value: 2,
        effect: { qixu: 4, yangxu: 1 },
        hint: '常感气不够用、说话声音偏轻，活动稍多即气喘',
        reading: '提示气偏不足、鼓动乏力',
      },
    ],
  },
  {
    id: 4,
    dimLabel: '口咽与火热',
    question: '口干、咽干、口疮或冒痘的情况？',
    hint: '含口咽干燥感、口疮与面部冒痘频率',
    options: [
      { label: '很少出现', value: 0, effect: {}, hint: '口咽清爽，很少口疮、冒痘' },
      {
        label: '偶尔出现',
        value: 1,
        effect: { yinxu: 2, shire: 1 },
        hint: '换季、熬夜或吃燥热食物时偶尔出现',
        reading: '提示津液偶有不及',
      },
      {
        label: '经常口干咽干',
        value: 2,
        effect: { yinxu: 3, shire: 1 },
        hint: '常觉口干咽燥，喜饮水，饮水后仍觉不润',
        reading: '提示津液偏少、失于濡润',
      },
      {
        label: '口苦口疮明显',
        value: 3,
        effect: { shire: 3, yinxu: 1 },
        hint: '经常口苦、口疮或面部冒痘，口气偏重',
        reading: '提示湿与热偏盛、上蒸于口',
      },
    ],
  },
  {
    id: 5,
    dimLabel: '睡眠',
    question: '入睡、睡眠深浅与多梦情况？',
    hint: '含入睡快慢、睡眠深浅与醒后感受',
    options: [
      { label: '睡眠良好', value: 0, effect: {}, hint: '入睡较快、睡得较沉，醒后精神好' },
      {
        label: '入睡偏难',
        value: 1,
        effect: { qiyu: 3 },
        hint: '躺下后翻来覆去、难以入睡，思虑较多',
        reading: '提示情志偏郁、气机不畅',
      },
      {
        label: '多梦易醒',
        value: 2,
        effect: { yinxu: 3, qiyu: 1 },
        hint: '睡眠浅、多梦，易醒或早醒，醒后难再入睡',
        reading: '提示津液偏少、心神失于濡养',
      },
      {
        label: '睡不解乏',
        value: 3,
        effect: { tanshi: 2, qixu: 2 },
        hint: '睡够时数仍觉疲乏，晨起犯困、身体发沉',
        reading: '提示水湿偏盛、清阳不升',
      },
    ],
  },
  {
    id: 6,
    dimLabel: '情绪',
    question: '近一个月的总体情绪与压力感受？',
    hint: '含焦虑、低落、烦躁与叹气频率',
    options: [
      { label: '平稳', value: 0, effect: {}, hint: '情绪比较平稳，心态放松' },
      {
        label: '偶尔波动',
        value: 1,
        effect: { qiyu: 2 },
        hint: '偶尔焦虑、低落或易烦躁',
        reading: '提示情志偶有不畅',
      },
      {
        label: '常感压力',
        value: 2,
        effect: { qiyu: 3 },
        hint: '常感压力大、易焦虑或郁闷，爱叹气',
        reading: '提示气机不畅、情志偏郁',
      },
      {
        label: '起伏较大',
        value: 3,
        effect: { qiyu: 4, yinxu: 1, shire: 1 },
        hint: '情绪起伏明显、较难自控，或容易发怒',
        reading: '提示气机郁滞日久，兼有郁热',
      },
    ],
  },
  {
    id: 7,
    dimLabel: '头身感觉',
    question: '头部昏沉或身体沉重的感觉？',
    hint: '含头重、身沉、头晕与阴雨天反应',
    options: [
      { label: '清爽', value: 0, effect: {}, hint: '头身清爽，无明显沉重感' },
      {
        label: '偶尔头重',
        value: 1,
        effect: { tanshi: 2 },
        hint: '偶尔头昏沉、身体发沉，阴雨天更明显',
        reading: '提示水湿偏盛、清阳受困',
      },
      {
        label: '常感沉重',
        value: 2,
        effect: { tanshi: 3, qixu: 1 },
        hint: '常觉头重如裹、身体沉重乏力，懒得动',
        reading: '提示水湿停聚偏重、困阻清阳',
      },
      {
        label: '头胀头晕',
        value: 3,
        effect: { yinxu: 2, shire: 2 },
        hint: '常感头胀、头晕或眼花，情绪紧张时加重',
        reading: '提示津液偏少、内热偏盛',
      },
    ],
  },
  {
    id: 8,
    dimLabel: '饮食消化',
    question: '食欲、餐后感受与大便情况？',
    hint: '含食欲、腹胀与大便性状',
    options: [
      { label: '正常', value: 0, effect: {}, hint: '食欲正常、餐后舒适，大便规律成形' },
      {
        label: '偶有腹胀',
        value: 1,
        effect: { qixu: 2, tanshi: 2 },
        hint: '偶尔腹胀、食欲一般，饭后容易犯困',
        reading: '提示运化偏慢、脾气略弱',
      },
      {
        label: '常腹胀便溏',
        value: 2,
        effect: { tanshi: 3, qixu: 2 },
        hint: '经常腹胀、食欲不振，大便偏溏或黏滞',
        reading: '提示水湿偏盛、运化不及',
      },
      {
        label: '喜甜腻口黏',
        value: 3,
        effect: { tanshi: 4, shire: 1 },
        hint: '偏爱甜腻油炸，口中黏腻，大便不爽',
        reading: '提示水湿偏盛、郁而偏热',
      },
    ],
  },
  {
    id: 9,
    dimLabel: '面色与瘀象',
    question: '面色、唇色与皮肤瘀斑情况？',
    hint: '含面色光泽、唇色与磕碰后瘀青',
    options: [
      { label: '红润有光', value: 0, effect: {}, hint: '面色红润、有光泽，唇色红润' },
      {
        label: '偏淡少华',
        value: 1,
        effect: { qixu: 2, yangxu: 1 },
        hint: '面色偏淡、少光泽，唇色偏淡',
        reading: '提示气力偏弱、荣养不足',
      },
      {
        label: '晦暗易瘀',
        value: 2,
        effect: { xueyu: 3, qixu: 1 },
        hint: '面色晦暗、唇色偏暗，磕碰后容易留瘀青',
        reading: '提示气血运行偏滞',
      },
      {
        label: '油腻偏红',
        value: 3,
        effect: { shire: 3 },
        hint: '面色偏红或油光，容易长痘',
        reading: '提示湿与热偏盛',
      },
    ],
  },
]

/**
 * 体质 → 倾向短语（专业口径，供结果页「依据链 · 指向」展示）。
 * 均为体质学描述，不含诊断 / 疗效 / 功效违禁词（避免被合规护栏二次净化）。
 */
export const TENDENCY_PHRASE: Record<string, string> = {
  yangxu: '阳气偏弱、温煦不足',
  yinxu: '津液偏少、失于濡润',
  qixu: '气力偏弱、推动不足',
  tanshi: '水湿偏盛、运化偏慢',
  shire: '湿与热偏盛',
  xueyu: '气血运行偏滞',
  qiyu: '气机不畅、情志偏郁',
  pinghe: '整体较为均衡',
}

// ── 评分引擎 ──────────────────────────────────────────────────────────────

export interface TestResult {
  primary: ConstitutionType
  secondary?: ConstitutionType
  scores: Record<string, number>
}

/** 偏颇质最高分低于该阈值时，判定为平和质（消除旧版「选健康选项就 +3 平和」的虚假偏置） */
const PINGHE_THRESHOLD = 3

/**
 * 根据答案计算体质得分（平和质为阈值兜底，非选项主动加分）。
 * @param questions 题库，默认快速版 5 题；食养评估传 DEEP_BODY_QUESTIONS（9 题深度问诊）
 */
export function calculateResult(answers: number[], questions: TestQuestion[] = TEST_QUESTIONS): TestResult {
  const scores: Record<string, number> = {}
  for (const key of Object.keys(CONSTITUTION_TYPES)) {
    scores[key] = 0
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const answerIdx = answers[i]
    if (answerIdx === undefined || answerIdx < 0 || answerIdx >= q.options.length) continue
    const option = q.options[answerIdx]
    for (const [ctype, pts] of Object.entries(option.effect)) {
      if (ctype in CONSTITUTION_TYPES) {
        scores[ctype] = (scores[ctype] || 0) + (pts ?? 0)
      }
    }
  }

  // 排除平和质，找偏颇质中的最高分（消除旧版「选健康选项就+3平和」的虚假偏置）
  const biased = Object.entries(scores).filter(([k]) => k !== 'pinghe')
  const sorted = biased.sort((a, b) => b[1] - a[1])

  let primaryKey: string
  if (sorted.length === 0 || sorted[0][1] < PINGHE_THRESHOLD) {
    primaryKey = 'pinghe'
  } else {
    primaryKey = sorted[0][0]
  }
  const primary = CONSTITUTION_TYPES[primaryKey as keyof typeof CONSTITUTION_TYPES]

  // 次体质：第2名分数≥4 且与第1名分差≤5 才展示
  let secondary: ConstitutionType | undefined
  if (primaryKey !== 'pinghe' && sorted.length >= 2) {
    const second = sorted[1]
    if (second[1] >= 4 && sorted[0][1] - second[1] <= 5) {
      secondary = CONSTITUTION_TYPES[second[0] as keyof typeof CONSTITUTION_TYPES]
    }
  }

  return { primary, secondary, scores }
}

// ── 商品推荐 ──────────────────────────────────────────────────────────────

/** 根据体质筛选适合的商品 */
export function filterProductsByConstitution(
  products: Product[],
  constitution: ConstitutionType,
): { good: Product[]; caution: Product[] } {
  const good: Product[] = []
  const caution: Product[] = []

  for (const product of products) {
    const nature = product.overall_nature || '平性'
    if (constitution.avoidNature.includes(nature)) {
      caution.push(product)
    } else if (constitution.recommendNature.includes(nature)) {
      good.push(product)
    } else {
      // 平性食品全部放 good
      if (nature === '平性') good.push(product)
    }
  }

  return { good, caution }
}

/** 体质 → BODY_CROWD_OPTIONS 映射 */
export function constitutionToCrowds(constitution: ConstitutionType): string[] {
  return constitution.bodyStates
}

/** 体质 → 健康目标映射 */
export function constitutionToGoals(constitution: ConstitutionType): string[] {
  return constitution.healthGoals
}

// ── 按「清通调补固」阶段配对 ──────────────────────────────────────────────

/**
 * 按体质对应的「清通调补固」调理阶段，精准配对商品。
 * 复用详情页已建好的阶段引擎：
 *   · 商品阶段优先取商家人工标注 food_stage，否则由核心食材主导功效确定性派生；
 *   · 与 filterProductsByConstitution（按性味广筛）互补，是「调理路径」这一叙事层的深一层配对。
 * @param excludeIds 需排除的商品 id（通常传性味适配好物，避免与上层推荐撞车）
 */
export function recommendStageProducts(
  products: Product[],
  stage: ShiyangStage,
  limit = 6,
  excludeIds?: Set<string>,
): Product[] {
  const matched: Product[] = []
  for (const p of products) {
    if (excludeIds && p.id && excludeIds.has(p.id)) continue
    const s = deriveProductStage(p.ingredients, p.food_stage)
    if (s === stage) matched.push(p)
  }
  return matched.slice(0, limit)
}
