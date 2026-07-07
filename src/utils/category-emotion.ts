// 品类情绪编译框架（Category-aware Emotion Compile）
// ------------------------------------------------------------
// 这是「情绪编译」系统的真实骨架：把"情绪翻译"从单一通用函数，
// 升级为"按本地生活类目区分气质"的编译策略。
//
// 为什么需要它：
//   生鲜、餐饮、美业、娱乐……每个业态的情绪基调、比喻意象、叙事角度都不同。
//   之前 emotion-description.ts 不分品类，所有商品都套同一套意境，
//   导致"餐饮"和"美业"的情绪文案气质趋同，失去代入感。
//
// 设计：
//   - 每个类目一份 CategoryEmotionProfile（基调 / 可用情绪标签 / 专属比喻 / 叙事角度 / 起笔收束）
//   - resolveCategoryProfile(category) 做模糊匹配（支持主类目名 + 别名）
//   - 编译引擎（emotion-description.ts）消费本文件，按类目产出差异化叙事
//
// 类目来源：项目实际 Store.category 取值（餐饮/零售/水果/服务/娱乐/其他）
//          + 本地生活常见细分（饮品/烘焙/美业/亲子/健身/酒店等），以别名挂载到基类目策略。

import type { CategoryEmotionProfileRow } from '@/db/types'
import { supabase } from '@/client/supabase'

export interface CategoryEmotionProfile {
  /** 主类目 key */
  key: string
  /** 展示名 */
  label: string
  /** 类目整体情绪基调（一句话，用于运营理解） */
  tone: string
  /** 该类目认可的 mood 标签（约束编译时优先采用的意境；不在其中的标签降级为通用） */
  allowedMoodTags: string[]
  /** 类目专属比喻/意象库（轮流取，覆盖通用意境比喻） */
  metaphors: string[]
  /** 叙事角度提示（轮流取，空串表示无额外角度） */
  angles: string[]
  /** 可选：类目专属起笔模板（接收 scene moment 字符串） */
  openers?: ((m: string) => string)[]
  /** 可选：类目专属收束语 */
  closers?: string[]
  /** 别名（用于模糊匹配：用户输入的类目名命中其一即采用本策略） */
  aliases?: string[]
}

// =====================
// 各业态情绪编译策略
// =====================

const 餐饮: CategoryEmotionProfile = {
  key: '餐饮',
  label: '餐饮美食',
  tone: '烟火人间，与人共食的妥帖',
  allowedMoodTags: ['治愈', '满足', '幸福', '温馨', '甜蜜', '愉悦', '分享', '用餐时光', '放松', '仪式感', '怀旧', '温暖'],
  metaphors: ['灶上咕嘟的汤', '一桌人对坐的灯', '街角老馆子的香', '碗中升腾的热气'],
  angles: ['与人共食，滋味更浓。', '一蔬一饭，最抚凡人心。', '围坐的此刻，便是归处。'],
  closers: ['趁热，慢慢吃。', '这一餐，值得好好坐下来。'],
  aliases: ['正餐', '小吃', '快餐', '火锅', '烧烤', '夜宵', '外卖', '饭', '餐', '美食', '餐厅'],
}

const 饮品: CategoryEmotionProfile = {
  key: '饮品',
  label: '饮品',
  tone: '微醺与小憩，唇齿间的喘息',
  allowedMoodTags: ['甜蜜', '治愈', '放松', '愉悦', '清新', '清爽', '浪漫', '慢生活'],
  metaphors: ['杯壁凝着的水珠', '午后的一口清凉', '巷口捧着的那杯暖', '吸管搅动的甜'],
  angles: ['小口啜饮，日子慢下来。', '给自己一段喘息。'],
  closers: ['慢慢喝，不着急。'],
  aliases: ['奶茶', '咖啡', '果茶', '酒水', '茶', '饮料', '汽水', '果汁'],
}

const 烘焙: CategoryEmotionProfile = {
  key: '烘焙',
  label: '烘焙甜点',
  tone: '晨间手作的温度',
  allowedMoodTags: ['甜蜜', '治愈', '温馨', '幸福', '满足', '浪漫'],
  metaphors: ['刚出炉的暖香', '窗台边那块松软', '晨光里的酥皮', '指尖沾着的糖粉'],
  angles: ['一口下去，整个人都松了。', '甜的东西，最懂安慰。'],
  closers: ['趁新鲜，尝一口。'],
  aliases: ['面包', '甜点', '蛋糕', '西点', '糕点', '甜品'],
}

const 水果生鲜: CategoryEmotionProfile = {
  key: '水果生鲜',
  label: '水果生鲜',
  tone: '土地与时令的鲜活',
  allowedMoodTags: ['清爽', '清新', '自然', '纯净', '解暑', '治愈', '活力', '满足'],
  metaphors: ['枝头带露的鲜', '山野吹来的风', '刚从土里醒来的清气', '井水镇过的脆'],
  angles: ['从田间到舌尖，不过片刻。', '应季的鲜，最懂身体。'],
  closers: ['鲜的，不必多说。'],
  aliases: ['果蔬', '水果', '生鲜', '蔬菜', '肉禽', '海鲜', '农产', '食材', '农场'],
}

const 零售: CategoryEmotionProfile = {
  key: '零售',
  label: '零售百货',
  tone: '悦己的小确幸与陪伴',
  allowedMoodTags: ['快乐', '满足', '惊喜', '治愈', '温馨', '可爱', '有趣', '浪漫', '甜蜜', '怀旧'],
  metaphors: ['抽屉里的小欢喜', '案头的一件趣物', '旧书页的香', '随手摆着的可爱'],
  angles: ['给自己一点甜。', '寻常日子里的小光。'],
  closers: ['喜欢，就带它回家。'],
  aliases: ['零食', '百货', '图书', '日用', '杂货', '文创', '超市', '便利店'],
}

const 美业: CategoryEmotionProfile = {
  key: '美业',
  label: '丽人美业',
  tone: '悦己与焕新的精致',
  allowedMoodTags: ['精致', '治愈', '放松', '浪漫', '甜蜜', '仪式感', '高端', '典雅'],
  metaphors: ['镜中焕然的自己', '指尖温柔的时光', '被妥帖照料的容颜', '发梢掠过的轻'],
  angles: ['为自己停下来的那一刻。', '好好爱自己，不亏。'],
  closers: ['你值得被温柔对待。'],
  aliases: ['美甲', '美容', '美发', '护肤', 'SPA', '丽人', '造型', '美睫', '纹绣'],
}

const 娱乐: CategoryEmotionProfile = {
  key: '娱乐',
  label: '休闲娱乐',
  tone: '释放与社交的沉浸',
  allowedMoodTags: ['快乐', '兴奋', '刺激', '活力', '愉悦', '分享', '有趣'],
  metaphors: ['灯影里炸开的笑', '一群人的喧闹', '卸下伪装的夜', '屏幕亮起的雀跃'],
  angles: ['痛快闹一场。', '和朋友，才够味。'],
  closers: ['今晚，尽兴就好。'],
  aliases: ['KTV', '剧本杀', '影院', '密室', '电玩', '桌游', '酒吧', '夜店', '游乐', '演出'],
}

const 运动健身: CategoryEmotionProfile = {
  key: '运动健身',
  label: '运动健身',
  tone: '活力与自律的突破',
  allowedMoodTags: ['活力', '满足', '专注', '兴奋', '放松', '自然'],
  metaphors: ['汗水落地的脆', '突破极限的喘息', '身体苏醒的晨', '肌肉舒展的暖'],
  angles: ['动起来，通体舒畅。', '坚持，身体会记得。'],
  closers: ['练完这一组，整个人都轻了。'],
  aliases: ['瑜伽', '游泳', '私教', '健身', '拳击', '骑行', '跑步', '舞蹈'],
}

const 亲子: CategoryEmotionProfile = {
  key: '亲子',
  label: '亲子',
  tone: '陪伴与成长的童真',
  allowedMoodTags: ['温馨', '幸福', '甜蜜', '治愈', '快乐', '可爱'],
  metaphors: ['孩子扬起的笑', '牵着的小手', '时光里的童真', '蹦跳着的身影'],
  angles: ['陪他长大，也是陪自己重温童年。', '孩子的笑，最能化开疲惫。'],
  closers: ['这样的时光，最珍贵。'],
  aliases: ['乐园', '早教', '摄影', '婴童', '儿童', '母婴', '托管'],
}

const 生活服务: CategoryEmotionProfile = {
  key: '生活服务',
  label: '生活服务',
  tone: '省心与托付的安心',
  allowedMoodTags: ['放松', '治愈', '实用', '温馨', '安心'],
  metaphors: ['交出去的轻松', '被妥帖打理的琐碎', '归家时的整洁', '不必自己动手的闲'],
  angles: ['麻烦的事，交给专业的人。', '把时间留给自己。'],
  closers: ['剩下的，安心就好。'],
  aliases: ['家政', '维修', '洗衣', '洗车', '保洁', '托管', '养护', '上门'],
}

const 酒店民宿: CategoryEmotionProfile = {
  key: '酒店民宿',
  label: '酒店民宿',
  tone: '栖居与远方的慢生活',
  allowedMoodTags: ['放松', '治愈', '慢生活', '浪漫', '平静', '安逸', '温馨'],
  metaphors: ['推开窗的山景', '一夜好眠的软', '异乡的灯', '院里那棵老树'],
  angles: ['在路上，也是在家。', '换一处地方，换一种心绪。'],
  closers: ['好好歇一晚。'],
  aliases: ['酒店', '民宿', '客栈', '住宿', '青旅'],
}

// 通用兜底（未匹配到任何类目时）
export const GENERIC_PROFILE: CategoryEmotionProfile = {
  key: '通用',
  label: '通用',
  tone: '安宁',
  allowedMoodTags: [],
  metaphors: [],
  angles: [''],
  aliases: [],
}

// =====================
// 类目策略表
// =====================
export const CATEGORY_EMOTION_MAP: Record<string, CategoryEmotionProfile> = {
  餐饮,
  饮品,
  烘焙,
  水果生鲜,
  零售,
  美业,
  娱乐,
  运动健身,
  亲子,
  生活服务,
  酒店民宿,
}

// ---------------------
// 运行时策略源（支持从云端 category_emotion_profiles 热更新）
// ---------------------
// activeMap 默认用内置策略；一旦从云端拉到策略即切换为云端版本，
// 使运营后台改词库/比喻库即时生效、无需发版。内置策略始终作为离线/失败兜底。
let activeMap: Record<string, CategoryEmotionProfile> = CATEGORY_EMOTION_MAP
let dbLoaded = false
let dbLoadingPromise: Promise<void> | null = null

// 云端行 → CategoryEmotionProfile（注意：openers 在库中是 string[]，
// 而编译引擎期望函数数组，故此处不映射 openers，统一回退通用起笔模板）
function rowToProfile(row: CategoryEmotionProfileRow): CategoryEmotionProfile {
  return {
    key: row.category_key,
    label: row.label,
    tone: row.tone || '',
    allowedMoodTags: row.allowed_mood_tags || [],
    metaphors: row.metaphors || [],
    angles: row.angles || [],
    closers: row.closers || undefined,
    aliases: row.aliases || [],
  }
}

/**
 * 从云端 category_emotion_profiles 拉取类目策略，覆盖内置策略。
 * 失败 / 行缺失时静默保留内置策略，不阻塞展示。
 * 带「已加载 / 并发去重」保护，整会话只拉一次。
 */
export async function loadCategoryEmotionProfilesFromDb(): Promise<void> {
  if (dbLoaded) return
  if (dbLoadingPromise) return dbLoadingPromise
  dbLoadingPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('category_emotion_profiles')
        .select('category_key,label,tone,allowed_mood_tags,metaphors,angles,openers,closers,aliases')
      if (error) throw error
      const rows = (data || []) as CategoryEmotionProfileRow[]
      if (rows.length) {
        const m: Record<string, CategoryEmotionProfile> = {}
        for (const r of rows) m[r.category_key] = rowToProfile(r)
        if (Object.keys(m).length) {
          activeMap = m
          dbLoaded = true
        }
      }
    } catch (e) {
      // 保留内置策略兜底
      console.warn('[emotion] 类目策略云端加载失败，使用内置策略', e)
    }
  })()
  return dbLoadingPromise
}

/**
 * 根据类目名（可能含别名）解析出对应的情绪编译策略。
 * 模糊匹配：命中主 key 或任意 alias（双向包含）即采用；否则返回通用策略。
 */
export function resolveCategoryProfile(category?: string | null): CategoryEmotionProfile {
  const c = (category || '').trim()
  if (!c) return activeMap['通用'] || GENERIC_PROFILE

  for (const key of Object.keys(activeMap)) {
    const p = activeMap[key]
    const aliases = p.aliases || []
    const hit = c.includes(key) || aliases.some(a => c.includes(a) || a.includes(c))
    if (hit) return p
  }
  return activeMap['通用'] || GENERIC_PROFILE
}
