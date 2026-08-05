// ============================================================
// 首页宣传广告位（迁移 00227 配套）
// ------------------------------------------------------------
// 首页 AdBanner 拉取 is_active=true 的素材按 sort_order 轮播。
// 复用电商项目既有 Supabase 客户端（@/client/supabase）。
// 调用示例：
//   import { getActiveHomeAds } from '@/db/home-ads'
// ============================================================
import { supabase } from '@/client/supabase'

export type HomeAdMediaType = 'image' | 'video'

export interface HomeAd {
  id: string
  media_type: HomeAdMediaType
  media_url: string
  poster_url: string | null
  link_url: string | null
  title: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// 拉取首页轮播素材（仅活跃，按 sort_order 升序）。
// 失败时返回空数组，调用方应回退到演示渐变占位。
export async function getActiveHomeAds(): Promise<HomeAd[]> {
  const { data, error } = await supabase
    .from('home_ads')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[getActiveHomeAds] 查询失败:', error.message)
    return []
  }
  return (data as HomeAd[]) ?? []
}
