import { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * 通用分享 Hook - 自动携带推广码
 * @param options 分享配置选项
 * @returns 分享配置（包含推广码）
 */
export function useShareWithReferral(options: {
  title: string
  path: string
  imageUrl?: string
  timelineTitle?: string
  timelineQuery?: string
}) {
  const { user } = useAuth()
  const [myCode, setMyCode] = useState('')

  // 获取我的推广码
  useEffect(() => {
    if (user) {
      import('@/client/supabase').then(({ supabase }) => {
        supabase.from('profiles').select('invite_code').maybeSingle()
          .then(({ data }: { data: any }) => {
            if (data?.invite_code) setMyCode(data.invite_code)
          })
          .catch(() => {}) // 忽略错误
      })
    }
  }, [user])

  // 分享给好友
  useShareAppMessage(() => {
    const separator = options.path.includes('?') ? '&' : '?'
    const sharePath = myCode ? `${options.path}${separator}ref=${myCode}` : options.path
    return {
      title: options.title,
      path: sharePath,
      imageUrl: options.imageUrl || ''}
  })

  // 分享到朋友圈
  useShareTimeline(() => {
    const separator = options.path.includes('?') ? '&' : '?'
    const baseQuery = options.timelineQuery || options.path.split('?')[1] || ''
    const shareQuery = myCode ? `${baseQuery}${baseQuery ? '&' : ''}ref=${myCode}` : baseQuery
    return {
      title: options.timelineTitle || options.title,
      query: shareQuery,
      imageUrl: options.imageUrl || ''}
  })

  return { myCode }
}
