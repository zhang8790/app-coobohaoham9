/**
 * 食安侦探解谜 —— 案件数据 + 评测引擎
 * 每个案件 = 一个真实商品配料表，用户要找出其中的「问题添加剂」(黄/黑风险)
 * 数据全部来自 knowledge-fragments.ts 的真实添加剂（风险等级/冷知识/危险提示）
 * 目的：训练用户扫配料表的核心能力，顺带解锁知识碎片
 */

import { KNOWLEDGE_FRAGMENTS } from '@/utils/knowledge-fragments'

// ── 案件模型 ──────────────────────────────────────────────────────────────

export interface DetectiveCase {
  id: string
  title: string            // 案件名（悬疑风）
  scene: string            // 案情描述（为什么查这个）
  productName: string      // 涉案商品
  brand: string            // 品牌（虚构）
  ingredientList: string[] // 真实配料表（含添加剂+普通食材）
  culprits: string[]       // 答案：需要标记的「问题添加剂」(黄/黑风险)
  difficulty: 1 | 2 | 3    // 难度
  points: number           // 破获奖励积分
  rewardFragment?: string  // 解锁的知识碎片 key
  hint: string             // 提示
}

// ── 案件库 ────────────────────────────────────────────────────────────────

export const DETECTIVE_CASES: DetectiveCase[] = [
  // ── 难度1：单一明显问题 ──
  {
    id: 'candy_mystery',
    title: '彩虹糖疑云',
    scene: '妈妈在给孩子挑糖果，货架上这包QQ糖颜色特别鲜艳。她说"颜色越亮越要小心"，让你帮忙看看配料表里藏了什么。',
    productName: '炫彩果汁软糖',
    brand: '童趣星球',
    ingredientList: ['白砂糖', '葡萄糖浆', '水', '卡拉胶', '柠檬黄', '胭脂红', '山梨酸钾'],
    culprits: ['柠檬黄', '胭脂红'],
    difficulty: 1,
    points: 10,
    rewardFragment: '柠檬黄',
    hint: '看那些带颜色名字的添加剂——越鲜艳越要留意',
  },
  {
    id: 'fried_dough',
    title: '老字号油条案',
    scene: '小区门口早餐摊的油条特别蓬松酥脆，老板说"祖传手艺"。但配料表上有一味"膨松剂"让你皱了皱眉。',
    productName: '即食脆皮油条',
    brand: '晨光坊',
    ingredientList: ['小麦粉', '水', '植物油', '硫酸铝钾', '碳酸氢钠', '食盐'],
    culprits: ['硫酸铝钾'],
    difficulty: 1,
    points: 10,
    rewardFragment: '硫酸铝钾',
    hint: '含"铝"的膨松剂长期吃对神经系统不友好',
  },
  // ── 难度2：多个问题 + 干扰项 ──
  {
    id: 'spicy_snack',
    title: '辣条谜案',
    scene: '办公室下午茶，同事拆了一包辣条分你。你扫了一眼配料表，发现"好吃"的背后藏着好几味需要警惕的添加。',
    productName: '麻辣王子辣条',
    brand: '湘味记',
    ingredientList: ['小麦粉', '植物油', '辣椒', '谷氨酸钠', '5\'-呈味核苷酸二钠', '脱氢乙酸钠', 'TBHQ', '柠檬黄'],
    culprits: ['脱氢乙酸钠', 'TBHQ', '柠檬黄'],
    difficulty: 2,
    points: 20,
    rewardFragment: '脱氢乙酸钠',
    hint: '鲜味剂(谷氨酸钠类)是安全的，重点看防腐剂和抗氧化剂',
  },
  {
    id: 'milk_tea',
    title: '速溶奶茶失踪案',
    scene: '熬夜赶方案，你冲了一杯速溶奶茶提神。植脂末的香味让你满足，但配料表里有一样东西比糖分更该警惕。',
    productName: '经典原味速溶奶茶',
    brand: '暖心冲',
    ingredientList: ['植脂末（部分氢化植物油）', '白砂糖', '红茶粉', '三氯蔗糖', '碳酸氢钠', '焦糖色'],
    culprits: ['部分氢化植物油'],
    difficulty: 2,
    points: 20,
    rewardFragment: '部分氢化植物油',
    hint: '植脂末括号里那行小字，是反式脂肪的别名',
  },
  // ── 难度3：高危 + 多重伪装 ──
  {
    id: 'sausage_case',
    title: '火腿肠护色谜案',
    scene: '露营烧烤，你串了几根火腿肠。朋友说"这颜色红得不太自然"。你拿起配料表，准备找出那个让肉"永葆青春"的元凶。',
    productName: '脆皮火山肠',
    brand: '野炊客',
    ingredientList: ['猪肉', '水', '淀粉', '食盐', '亚硝酸盐', '谷氨酸钠', '5\'-呈味核苷酸二钠', '山梨酸钾', '红曲红'],
    culprits: ['亚硝酸盐'],
    difficulty: 3,
    points: 30,
    rewardFragment: '亚硝酸盐',
    hint: '让肉制品保持粉红色的那味，是护色剂也是高危项',
  },
  {
    id: 'cake_case',
    title: '生日蛋糕伪装案',
    scene: '给孩子订的奶油蛋糕到了，雪白奶油格外诱人。但配料表上有两个"美白"嫌疑犯，还有一个让蛋糕"不会坏"的防腐剂。',
    productName: '北海道香浓奶油蛋糕',
    brand: '甜星烘焙',
    ingredientList: ['小麦粉', '鸡蛋', '白砂糖', '植物油', '部分氢化植物油', '二氧化钛', '脱氢乙酸钠', '丙酸钙'],
    culprits: ['部分氢化植物油', '二氧化钛', '脱氢乙酸钠'],
    difficulty: 3,
    points: 30,
    rewardFragment: '二氧化钛',
    hint: '白色颜料、反式脂肪、强力防腐剂——三个都在这张表里',
  },
  {
    id: 'sport_drink',
    title: '运动饮料调色案',
    scene: '健身完你买了瓶运动饮料补电解质。标签写着"0糖"，但配料表里的"0糖"是用什么换来的？颜色又是谁给的？',
    productName: '电解质活力饮',
    brand: '脉动星',
    ingredientList: ['水', '白砂糖', '柠檬酸', '阿斯巴甜', '三氯蔗糖', '维生素C', '牛磺酸', '柠檬黄', '苯甲酸钠'],
    culprits: ['阿斯巴甜', '柠檬黄', '苯甲酸钠'],
    difficulty: 3,
    points: 30,
    rewardFragment: '阿斯巴甜',
    hint: '代糖不全是安全的，人工色素和防腐剂也在凑热闹',
  },
]

// ── 评测引擎 ──────────────────────────────────────────────────────────────

export interface CaseResult {
  caseId: string
  selected: string[]        // 用户标记的可疑项
  correct: string[]         // 标对的问题项
  missed: string[]          // 漏掉的问题项
  wrong: string[]           // 误报（安全项被标）
  score: number             // 0-100
  passed: boolean
  newFragments: string[]    // 本次新解锁的知识碎片
}

/**
 * 评测用户对案件的判断
 * 计分：每个正确标记 +X，每个漏标 -Y，每个误报 -Z
 */
export function evaluateCase(
  c: DetectiveCase,
  selected: string[],
): CaseResult {
  const selSet = new Set(selected)
  const culpritSet = new Set(c.culprits)

  const correct = c.culprits.filter((x) => selSet.has(x))
  const missed = c.culprits.filter((x) => !selSet.has(x))
  const wrong = selected.filter((x) => !culpritSet.has(x))

  // 计分
  const base = 100
  const perCorrect = Math.floor(base / (c.culprits.length * 2)) // 正确标记占一半权重
  const perMiss = Math.floor(base / (c.culprits.length * 4))
  const perWrong = Math.floor(base / (c.culprits.length * 4))

  let score = correct.length * perCorrect - missed.length * perMiss - wrong.length * perWrong
  score = Math.max(0, Math.min(100, score))

  // 通过线：至少标对所有问题项，且误报不超过1个
  const passed = correct.length === c.culprits.length && wrong.length <= 1

  // 新解锁碎片：本次标对的问题项，若有对应知识碎片
  const newFragments: string[] = []
  for (const name of correct) {
    if (KNOWLEDGE_FRAGMENTS[name]) {
      newFragments.push(name)
    }
  }
  // 奖励碎片也算（若未标对但 case 有 rewardFragment）
  if (c.rewardFragment && KNOWLEDGE_FRAGMENTS[c.rewardFragment] && !newFragments.includes(c.rewardFragment)) {
    // 通关才奖励
    if (passed) newFragments.push(c.rewardFragment)
  }

  return { caseId: c.id, selected, correct, missed, wrong, score, passed, newFragments }
}

/** 根据 id 取案件 */
export function getCaseById(id: string): DetectiveCase | undefined {
  return DETECTIVE_CASES.find((c) => c.id === id)
}

/** 难度标签 */
export function difficultyLabel(d: 1 | 2 | 3): string {
  return d === 1 ? '入门' : d === 2 ? '进阶' : '硬核'
}

/** 总案件数 */
export const TOTAL_CASES = DETECTIVE_CASES.length
