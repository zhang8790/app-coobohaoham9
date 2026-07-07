// 情绪推荐引擎
// 根据用户情绪偏好推荐商品

import { supabase } from '@/client/supabase'
import type { Product } from '@/db/types'

// 记录用户情绪偏好（浏览/购买行为）
export async function recordEmotionPreference(
  userId: string,
  productId: string,
  moodTags: string[],
  action: 'view' | 'click' | 'purchase'
): Promise<void> {
  try {
    // 先检查是否已有记录
    const { data: existing } = await supabase
      .from('user_emotion_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .single()

    if (existing) {
      // 更新已有记录
      const { error } = await supabase
        .from('user_emotion_preferences')
        .update({
          mood_tags: moodTags,
          action,
          weight: action === 'purchase' ? 3 : action === 'click' ? 2 : 1,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('product_id', productId)

      if (error) console.error('[Emotion] 更新偏好失败:', error.message)
    } else {
      // 插入新记录
      const { error } = await supabase
        .from('user_emotion_preferences')
        .insert({
          user_id: userId,
          product_id: productId,
          mood_tags: moodTags,
          action,
          weight: action === 'purchase' ? 3 : action === 'click' ? 2 : 1,
        })

      if (error) console.error('[Emotion] 记录偏好失败:', error.message)
    }
  } catch (err) {
    console.error('[Emotion] 记录情绪偏好异常:', err)
  }
}

// 获取用户情绪偏好（汇总）
export async function getUserEmotionProfile(userId: string): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from('user_emotion_preferences')
      .select('mood_tags, weight')
      .eq('user_id', userId)

    if (error || !data) {
      console.error('[Emotion] 获取偏好失败:', error?.message)
      return {}
    }

    // 汇总情绪标签权重
    const profile: Record<string, number> = {}
    data.forEach(record => {
      const tags = record.mood_tags || []
      const weight = record.weight || 1
      tags.forEach(tag => {
        profile[tag] = (profile[tag] || 0) + weight
      })
    })

    return profile
  } catch (err) {
    console.error('[Emotion] 获取情绪画像异常:', err)
    return {}
  }
}

// 根据情绪偏好推荐商品
export async function getEmotionBasedRecommendations(
  userId: string,
  limit: number = 10
): Promise<Product[]> {
  try {
    // 1. 获取用户情绪画像
    const profile = await getUserEmotionProfile(userId)

    if (Object.keys(profile).length === 0) {
      // 如果没有偏好数据，返回热门商品
      const { data, error } = await supabase
        .from('products')
        .select('*, stores(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('[Emotion] 获取热门商品失败:', error.message)
        return []
      }

      return data || []
    }

    // 2. 根据情绪画像推荐商品
    const topTags = Object.entries(profile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag)

    const { data, error } = await supabase
      .from('products')
      .select('*, stores(*)')
      .eq('is_active', true)
      .overlaps('mood_tags', topTags)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Emotion] 情绪推荐失败:', error.message)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[Emotion] 情绪推荐异常:', err)
    return []
  }
}

// 情绪化搜索（根据用户输入的情绪词搜索商品）
export async function searchByEmotion(
  query: string,
  moodTags?: string[]
): Promise<Product[]> {
  try {
    let supabaseQuery = supabase
      .from('products')
      .select('*, stores(*)')
      .eq('is_active', true)

    // 如果指定了情绪标签，优先过滤
    if (moodTags && moodTags.length > 0) {
      supabaseQuery = supabaseQuery.overlaps('mood_tags', moodTags)
    }

    // 同时按商品名称/描述搜索
    if (query) {
      supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`)
    }

    const { data, error } = await supabaseQuery
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[Emotion] 情绪搜索失败:', error.message)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[Emotion] 情绪搜索异常:', err)
    return []
  }
}
