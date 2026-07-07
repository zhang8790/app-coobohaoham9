// 情绪词库（中英文对照）
// 用于商品标签，帮助商家提升商品感染力

export interface MoodTag {
  zh: string  // 中文
  en: string  // 英文
  icon: string // 图标（可选）
  color: string // 标签颜色
}

// 情绪分类
export const MOOD_CATEGORIES = {
  positive: '积极情绪',
  warm: '温暖情感',
  fresh: '清新自然',
  luxury: '奢华高端',
  fun: '趣味活泼',
  calm: '平静放松',
}

// 情绪词库（按分类组织）
export const MOOD_TAGS: Record<string, MoodTag[]> = {
  positive: [
    { zh: '快乐', en: 'Happy', icon: '😊', color: '#FFD700' },
    { zh: '兴奋', en: 'Excited', icon: '🎉', color: '#FF6B6B' },
    { zh: '满足', en: 'Satisfied', icon: '😌', color: '#4ECDC4' },
    { zh: '惊喜', en: 'Surprised', icon: '🎁', color: '#FF8C00' },
    { zh: '幸福', en: 'Happy', icon: '💖', color: '#FF69B4' },
  ],
  
  warm: [
    { zh: '温馨', en: 'Warm', icon: '🏠', color: '#FFB6C1' },
    { zh: '浪漫', en: 'Romantic', icon: '🌹', color: '#FF1493' },
    { zh: '甜蜜', en: 'Sweet', icon: '🍯', color: '#FFA07A' },
    { zh: '感动', en: 'Touching', icon: '😭', color: '#87CEEB' },
    { zh: '治愈', en: 'Healing', icon: '🩹', color: '#98FB98' },
  ],
  
  fresh: [
    { zh: '清爽', en: 'Refreshing', icon: '🍃', color: '#00CED1' },
    { zh: '清新', en: 'Fresh', icon: '🌿', color: '#32CD32' },
    { zh: '自然', en: 'Natural', icon: '🌳', color: '#228B22' },
    { zh: '纯净', en: 'Pure', icon: '💧', color: '#87CEFA' },
    { zh: '解暑', en: 'Cooling', icon: '❄️', color: '#00BFFF' },
  ],
  
  luxury: [
    { zh: '奢华', en: 'Luxury', icon: '👑', color: '#FFD700' },
    { zh: '高端', en: 'Premium', icon: '💎', color: '#B9F2FF' },
    { zh: '精致', en: 'Exquisite', icon: '✨', color: '#DDA0DD' },
    { zh: '典雅', en: 'Elegant', icon: '🏛️', color: '#DEB887' },
    { zh: '尊贵', en: 'Noble', icon: '🏆', color: '#FFD700' },
  ],
  
  fun: [
    { zh: '有趣', en: 'Fun', icon: '🎈', color: '#FF69B4' },
    { zh: '可爱', en: 'Cute', icon: '🧸', color: '#FFB6C1' },
    { zh: '活力', en: 'Energetic', icon: '⚡', color: '#FF4500' },
    { zh: '潮流', en: 'Trendy', icon: '🔥', color: '#FF0000' },
    { zh: '个性', en: 'Unique', icon: '💫', color: '#9370DB' },
  ],
  
  calm: [
    { zh: '平静', en: 'Calm', icon: '🧘', color: '#87CEEB' },
    { zh: '放松', en: 'Relaxed', icon: '😌', color: '#98FB98' },
    { zh: '舒适', en: 'Comfortable', icon: '🛋️', color: '#DEB887' },
    { zh: '安逸', en: 'Leisure', icon: '☕', color: '#D2B48C' },
    { zh: '慢生活', en: 'Slow Life', icon: '🐌', color: '#A0522D' },
  ],
}

// 场景标签库
export const SCENE_TAGS: MoodTag[] = [
  { zh: '夏日', en: 'Summer', icon: '☀️', color: '#FFD700' },
  { zh: '冬日', en: 'Winter', icon: '❄️', color: '#87CEEB' },
  { zh: '春秋', en: 'Spring/Autumn', icon: '🌸', color: '#FFB6C1' },
  { zh: '应季', en: 'In Season', icon: '🗓️', color: '#32CD32' },
  { zh: '节日', en: 'Festival', icon: '🎊', color: '#FF6B6B' },
  { zh: '生日', en: 'Birthday', icon: '🎂', color: '#FF69B4' },
  { zh: '约会', en: 'Date', icon: '💑', color: '#FF1493' },
  { zh: '聚会', en: 'Party', icon: '🎉', color: '#FF8C00' },
  { zh: '送礼', en: 'Gift', icon: '🎁', color: '#9370DB' },
  { zh: '自用', en: 'Personal', icon: '🏠', color: '#A9A9A9' },
]

// 获取所有情绪标签（扁平化）
export function getAllMoodTags(): MoodTag[] {
  return Object.values(MOOD_TAGS).flat()
}

// 根据中文名查找标签
export function findMoodTag(zh: string): MoodTag | undefined {
  return getAllMoodTags().find(tag => tag.zh === zh)
}

// 根据英文名查找标签
export function findMoodTagByEn(en: string): MoodTag | undefined {
  return getAllMoodTags().find(tag => tag.en === en)
}

// 导出所有情绪标签（扁平化数组）
export const MOOD_TAGS_ALL = getAllMoodTags()

// 导出所有场景标签（扁平化数组）
export const SCENE_TAGS_ALL = [...SCENE_TAGS]
