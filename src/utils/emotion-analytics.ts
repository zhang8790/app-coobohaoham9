// @title 情绪导购漏斗埋点（非阻断 fire-and-forget）
// 五屏情绪详情页各屏行为采集，供商家「情绪漏斗」看板聚合分析。
// 设计原则：绝不阻塞 UI、不抛异常影响主流程；表缺失/权限问题仅 console.warn。
import { supabase } from '@/client/supabase'

export type EmotionEventType = 'enter' | 'screen_view' | 'cta_click' | 'order_created'

// 模块级缓存当前用户 id（进页 init 一次即可，避免每次埋点都 auth.getUser）
let _cachedUserId: string | null | undefined = undefined

// 进页时调用一次，缓存 user_id（用于后续按用户去重/归因）
export function initEmotionTracker() {
  if (_cachedUserId !== undefined) return
  _cachedUserId = null // 占位，防止重复触发
  supabase.auth.getUser()
    .then(({ data }) => { _cachedUserId = data.user?.id ?? null })
    .catch(() => { _cachedUserId = null })
}

// 埋点上报：非阻断，fire-and-forget
export function trackEmotionEvent(
  event_type: EmotionEventType,
  payload: {
    productId: string
    storeId?: string | null
    screenIndex?: number
    source?: string
  },
) {
  if (_cachedUserId === undefined) _cachedUserId = null

  supabase
    .from('emotion_funnel_events')
    .insert({
      user_id: _cachedUserId,
      product_id: payload.productId,
      store_id: payload.storeId ?? null,
      event_type,
      screen_index: payload.screenIndex ?? null,
      source: payload.source ?? 'emotion_detail',
    })
    .then(
      () => {},
      (e) => console.warn('[emotion-analytics] track failed:', e),
    )
}
