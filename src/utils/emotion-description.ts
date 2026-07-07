// 情绪翻译引擎（品类感知的情绪编译）
// 将商品的功能属性（名称 / 情绪标签 / 场景标签 / 类目）翻译成
// 有武侠气韵、无推销腔、且符合「类目气质」的「情绪翻译」叙事文案。
//
// 设计原则（与项目「来电有喜」武侠世界观一致）：
//   1. 描述的是「拥有 / 使用这件物品时的心境画面」，而非「为什么该买它」；
//   2. 刻意回避「抢购 / 手慢无 / 最佳选择 / 值得信赖 / 品质保证」等电商带货话术；
//   3. 确定性生成（不再 Math.random），同一组标签每次结果稳定，便于商品页展示与商家预览；
//   4. 【品类感知】不同本地生活类目（餐饮 / 生鲜 / 美业 / 娱乐…）采用不同比喻库、叙事角度与收束语，
//      由 src/utils/category-emotion.ts 的 CategoryEmotionProfile 驱动。
//
// 复用项目已有的 v1 情绪标签 API：Product.mood_tags / Product.scene_tags / Store.category。

import type { Product } from '@/db/types'
import { resolveCategoryProfile } from './category-emotion'

// 情绪标签 → 意境（情绪翻译的核心词 + 一个武侠意象比喻）
const MOOD_REALM: Record<string, { realm: string; metaphor: string }> = {
  快乐: { realm: '畅快欢喜', metaphor: '一阵穿林的风' },
  兴奋: { realm: '雀跃悸动', metaphor: '檐角惊起的雀' },
  满足: { realm: '妥帖安然', metaphor: '灯下温着的一盏茶' },
  惊喜: { realm: '不期而遇的欢喜', metaphor: '雪后忽见的红梅' },
  幸福: { realm: '圆满', metaphor: '月圆之夜' },
  温馨: { realm: '家的暖意', metaphor: '灶上咕嘟的汤' },
  浪漫: { realm: '柔情缱绻', metaphor: '帘外一钩月' },
  甜蜜: { realm: '缱绻甜意', metaphor: '唇边化开的蜜' },
  感动: { realm: '心头一热', metaphor: '故人寄来的一封信' },
  治愈: { realm: '被轻轻抚平', metaphor: '雨后晒暖的棉被' },
  清爽: { realm: '清欢', metaphor: '山涧凉风' },
  清新: { realm: '如沐春风', metaphor: '晨雾里的青草' },
  自然: { realm: '本真', metaphor: '未施粉黛的容颜' },
  纯净: { realm: '无尘', metaphor: '初雪' },
  解暑: { realm: '清凉境', metaphor: '井水镇过的瓜' },
  奢华: { realm: '风华', metaphor: '锦缎上的金线' },
  高端: { realm: '端方雅正', metaphor: '案头一方端砚' },
  精致: { realm: '匠心', metaphor: '榫卯相扣的木作' },
  典雅: { realm: '古意', metaphor: '旧瓷上的一缕青花' },
  尊贵: { realm: '贵重', metaphor: '匣中珍藏的玉' },
  有趣: { realm: '逸趣', metaphor: '案头把玩的核桃' },
  可爱: { realm: '娇憨', metaphor: '檐下打盹的猫' },
  活力: { realm: '生气', metaphor: '破土的新笋' },
  潮流: { realm: '时韵', metaphor: '檐下新挂的灯笼' },
  个性: { realm: '独异', metaphor: '不与众同的一枝' },
  平静: { realm: '澄明', metaphor: '止水' },
  放松: { realm: '松弛', metaphor: '解开束发的带' },
  舒适: { realm: '熨帖', metaphor: '旧棉布衫' },
  安逸: { realm: '闲适', metaphor: '藤椅上半盏闲茶' },
  慢生活: { realm: '慢时光', metaphor: '日影西斜的午后' },
  孤独: { realm: '清寂', metaphor: '一盏孤灯' },
  怀旧: { realm: '旧时光', metaphor: '抽屉里的老照片' },
  温暖: { realm: '熨帖', metaphor: '炉边烘着的旧袄' },
  专注: { realm: '凝神', metaphor: '案头不灭的灯' },
  分享: { realm: '热闹', metaphor: '几人围坐的暖' },
  送礼: { realm: '心意', metaphor: '千里寄来的鹅毛' },
  实用: { realm: '妥帖', metaphor: '称手的旧物' },
  仪式感: { realm: '郑重', metaphor: '净手焚香的一刻' },
  用餐时光: { realm: '烟火', metaphor: '灶上咕嘟的汤' },
}

// 场景标签 → 心境时刻
const SCENE_MOMENT: Record<string, string> = {
  夏日: '暑气正盛的午后',
  冬日: '寒夜围炉时',
  春秋: '风日晴和的日子',
  应季: '当下的时令里',
  节日: '灯火可亲的节庆',
  生日: '生辰的那天',
  约会: '与心上人相对而坐',
  聚会: '三五好友围炉',
  送礼: '想赠予谁的时候',
  自用: '只属于自己的时刻',
}

// 起笔：把场景化作一帧画面的开头（通用，类目未覆盖时回退到此）
const OPENERS = [
  (m: string) => `每逢${m}，`,
  (m: string) => `想起${m}的光景，`,
  (m: string) => `若是在${m}，`,
]

// 收束：一句克制的心境结语（通用，无 CTA、无促销）
const CLOSERS = [
  '不必赶路，慢慢享用便好。',
  '这一刻的安宁，够抵过半日烦忧。',
  '愿它陪你把寻常日子，过出滋味。',
  '如此，便已足够。',
]

function pick<T>(arr: T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length]
}

// 取第 variant 个情绪标签对应的意境（多标签时让候选各不相同）
// 传入的 moodTags 已是"经类目约束后的有效标签"
function realmFor(moodTags: string[] | undefined, variant: number) {
  if (!moodTags || moodTags.length === 0) return undefined
  const tag = moodTags[variant % moodTags.length]
  return MOOD_REALM[tag] || MOOD_REALM[moodTags[0]]
}

function momentFor(sceneTags: string[] | undefined) {
  if (!sceneTags || sceneTags.length === 0) return undefined
  return SCENE_MOMENT[sceneTags[0]]
}

// 组合一段情绪翻译叙事（确定性：同一 variant 永远产出同一句）
function buildOne(
  product: Partial<Product>,
  moodTags: string[] | undefined,
  sceneTags: string[] | undefined,
  category: string | undefined,
  variant: number,
): string {
  const name = product.name || '这件物事'

  // 1) 解析类目策略
  const profile = resolveCategoryProfile(category)

  // 2) 用类目 allowedMoodTags 约束有效情绪标签（提升编译质量，避免违和）
  let eff = moodTags || []
  if (profile.allowedMoodTags && profile.allowedMoodTags.length) {
    const filtered = eff.filter(t => profile.allowedMoodTags.includes(t))
    if (filtered.length) eff = filtered
  }

  const realmInfo = realmFor(eff, variant)
  const moment = momentFor(sceneTags)

  const realm = realmInfo?.realm || '安宁'
  const m = moment || '寻常的日子'

  // 3) 类目专属比喻优先，否则用通用意境比喻
  const catMetaphors = profile.metaphors && profile.metaphors.length ? profile.metaphors : null
  const metaphor = catMetaphors
    ? catMetaphors[variant % catMetaphors.length]
    : (realmInfo?.metaphor || '一盏灯')

  // 4) 类目叙事角度（无则空）
  const catAngles = profile.angles && profile.angles.length ? profile.angles : null
  const angle = catAngles ? catAngles[variant % catAngles.length] : ''

  // 5) 类目起笔 / 收束（无则回退通用）
  const openers = profile.openers && profile.openers.length ? profile.openers : OPENERS
  const closers = profile.closers && profile.closers.length ? profile.closers : CLOSERS

  const opener = pick(openers, variant)(m)

  const middles = [
    `${name}便如${metaphor}，${realm}漫上心头${angle ? '，' + angle : ''}。`,
    `一桩${realm}的心事，恰好被${name}接住——${metaphor}似的妥帖${angle ? '，' + angle : ''}。`,
    `所求不过${realm}，${name}像${metaphor}，静静候着${angle ? '，' + angle : ''}。`,
  ]
  const middle = pick(middles, variant)
  const closer = pick(closers, variant)

  return `${opener}${middle}${closer}`
}

// 无情绪标签时的中性兜底（仍是情绪翻译语气，不推销）
function fallbackLine(product: Partial<Product>): string {
  const name = product.name || '这件物事'
  return `${name}，静候懂它的人。愿它在你手里，慢慢显出滋味。`
}

/**
 * 生成单条「情绪翻译」叙事（确定性，商品详情页主叙事用）。
 * @param category 门店类目（Store.category），用于驱动品类感知编译；不传则走通用策略。
 */
export function generateEmotionDescription(
  product: Partial<Product>,
  moodTags: string[] = [],
  sceneTags: string[] = [],
  category?: string | null,
): string {
  if (moodTags.length === 0 && sceneTags.length === 0) {
    return fallbackLine(product)
  }
  return buildOne(product, moodTags, sceneTags, category ?? undefined, 0)
}

/**
 * 生成多条候选「情绪翻译」叙事（供商家后台挑选，确定性）。
 * @param category 门店类目，用于驱动品类感知编译。
 */
export function generateEmotionDescriptions(
  product: Partial<Product>,
  moodTags: string[] = [],
  sceneTags: string[] = [],
  count: number = 3,
  category?: string | null,
): string[] {
  if (moodTags.length === 0 && sceneTags.length === 0) {
    return [fallbackLine(product)]
  }
  const cat = category ?? undefined
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const line = buildOne(product, moodTags, sceneTags, cat, i)
    if (!out.includes(line)) out.push(line)
  }
  // 候选不足时补足（换不同起笔/收束组合）
  let k = count
  while (out.length < count) {
    const line = buildOne(product, moodTags, sceneTags, cat, k)
    if (!out.includes(line)) out.push(line)
    k++
  }
  return out
}
