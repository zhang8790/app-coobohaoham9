// 情绪系统 API 函数
// 创建时间: 2026-07-06
// 说明: 提供情绪匹配、内容获取等功能

import { supabase } from '@/client/supabase'
import type { EmotionContent } from './types'

/**
 * 匹配用户输入的情绪
 * @param text 用户输入的文本
 * @returns 匹配的情绪标签，如果没有匹配则返回 null
 */
export async function matchEmotion(text: string): Promise<string | null> {
  if (!text || text.trim().length === 0) return null

  const trimmedText = text.trim()

  // 1. 精确匹配（优先级1）
  const { data: exactMatch } = await supabase
    .from('emotion_keywords')
    .select('inner_label')
    .eq('keyword', trimmedText)
    .eq('priority', 1)
    .limit(1)
    .maybeSingle()

  if (exactMatch) return exactMatch.inner_label

  // 2. 模糊匹配（优先级1的关键词是否包含在文本中）
  const { data: fuzzyMatch } = await supabase
    .from('emotion_keywords')
    .select('inner_label, keyword')
    .eq('priority', 1)

  if (fuzzyMatch) {
    for (const item of fuzzyMatch) {
      if (trimmedText.includes(item.keyword)) {
        return item.inner_label
      }
    }
  }

  // 3. 通用匹配（优先级2）
  const { data: generalMatch } = await supabase
    .from('emotion_keywords')
    .select('inner_label')
    .eq('keyword', trimmedText)
    .eq('priority', 2)
    .limit(1)
    .maybeSingle()

  if (generalMatch) return generalMatch.inner_label

  // 4. 模糊匹配优先级2
  const { data: fuzzyGeneral } = await supabase
    .from('emotion_keywords')
    .select('inner_label, keyword')
    .eq('priority', 2)

  if (fuzzyGeneral) {
    for (const item of fuzzyGeneral) {
      if (trimmedText.includes(item.keyword)) {
        return item.inner_label
      }
    }
  }

  return null
}

/**
 * 获取情绪翻译文案（随机一条）
 * @param inner_label 情绪标签
 * @returns 翻译文案
 */
export async function getEmotionTranslation(inner_label: string): Promise<string> {
  const { data } = await supabase
    .from('emotion_content')
    .select('title')
    .eq('inner_label', inner_label)
    .eq('content_type', 'translation')
    .limit(1)
    .maybeSingle()

  return data?.title || '今天也是美好的一天。'
}

/**
 * 获取场景卡片列表
 * @param inner_label 情绪标签
 * @returns 场景卡片数组
 */
export async function getEmotionSceneCards(inner_label: string): Promise<EmotionContent[]> {
  const { data } = await supabase
    .from('emotion_content')
    .select('*')
    .eq('inner_label', inner_label)
    .eq('content_type', 'scene_card')
    .limit(3)

  return data || []
}

/**
 * 获取Feed流标题列表
 * @param inner_label 情绪标签
 * @param limit 数量限制
 * @returns Feed流标题数组
 */
export async function getEmotionFeedTitles(inner_label: string, limit = 10): Promise<EmotionContent[]> {
  const { data } = await supabase
    .from('emotion_content')
    .select('*')
    .eq('inner_label', inner_label)
    .eq('content_type', 'feed_title')
    .limit(limit)

  return data || []
}

/**
 * 获取完整的情绪响应（翻译文案 + 场景卡片 + Feed标题）
 * @param inner_label 情绪标签
 * @returns 完整的情绪响应对象
 */
export async function getEmotionResponse(inner_label: string) {
  const [translation, sceneCards, feedTitles] = await Promise.all([
    getEmotionTranslation(inner_label),
    getEmotionSceneCards(inner_label),
    getEmotionFeedTitles(inner_label, 3),
  ])

  return {
    inner_label,
    translation,
    sceneCards,
    feedTitles}
}
