// @title 创作中心
// 简化版创作中枢：只保留两大创作动作 —— 创作文章 / 发布视频，外加「我的创作」管理入口。
// 写心情配方卡、素材工坊、心情广场已按需求移除。
import { useRef, useEffect, Component, type MutableRefObject, type ReactNode } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'
import './index.scss'

type SharePayload = { title: string; path: string; imageUrl: string }

/** 错误边界：任何渲染异常落到可读提示，而不是整页白屏 */
class HubErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: any) {
    return { err: e?.message || String(e) }
  }
  componentDidCatch(e: any) {
    console.error('[make] 中枢渲染异常', e)
  }
  render() {
    if (this.state.err) {
      return (
        <View className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
          <Text className="text-2xl text-destructive font-bold">页面出错了</Text>
          <Text className="text-base text-muted-foreground mt-3 leading-relaxed text-center">{this.state.err}</Text>
          <View className="mt-6 px-6 py-3 rounded-xl bg-primary" hoverClass="none" onClick={() => Taro.navigateBack()}>
            <Text className="text-white font-bold">返回</Text>
          </View>
        </View>
      )
    }
    return this.props.children
  }
}

export default function MakePage() {
  const shareRef = useRef<SharePayload>({
    title: '来电有喜 · 创作中心',
    path: '/pages/content/content-center/make/index',
    imageUrl: '',
  })

  useShareAppMessage(() => ({
    title: shareRef.current.title,
    path: shareRef.current.path,
    imageUrl: shareRef.current.imageUrl || undefined,
  }))
  useShareTimeline(() => ({
    title: shareRef.current.title,
    query: '',
    imageUrl: shareRef.current.imageUrl || undefined,
  }))
  useEffect(() => {
    // 真机若未开启「分享到朋友圈」能力，showShareMenu 会 reject，静默兜底
    try {
      Taro.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] }).catch(() => {})
    } catch { /* 忽略 */ }
  }, [])

  return (
    <HubErrorBoundary>
      <View className="min-h-screen bg-background">
        {/* 顶栏 */}
        <View className="px-5 pt-6 pb-2">
          <Text className="text-3xl font-bold text-foreground">创作中心</Text>
          <Text className="block text-base text-muted-foreground mt-1">把你的好内容分享出去，好友打开即锁定为客户</Text>
        </View>

        {/* 两大创作动作 */}
        <View className="px-5 mt-4 flex flex-col gap-4">
          {/* 创作文章 */}
          <View
            className="flex items-center gap-4 p-5 rounded-3xl bg-primary/10 border border-primary/20 active:scale-[0.99]"
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: '/pages/content/content-center/make-rich/index' })}>
            <View className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0">
              <Icon name="pencil" size={28} className="text-white" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="block text-2xl font-bold text-foreground">创作文章</Text>
              <Text className="block text-sm text-muted-foreground mt-0.5">写图文 · 套模板 · 插好物 · 一键发布</Text>
            </View>
            <Text className="text-muted-foreground text-xl">›</Text>
          </View>

          {/* 发布视频 */}
          <View
            className="flex items-center gap-4 p-5 rounded-3xl bg-card border border-border active:scale-[0.99]"
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: '/pages/content/content-center/make-video/index' })}>
            <View className="w-14 h-14 rounded-2xl bg-destructive flex items-center justify-center flex-shrink-0">
              <Icon name="video-plus" size={28} className="text-white" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="block text-2xl font-bold text-foreground">发布视频</Text>
              <Text className="block text-sm text-muted-foreground mt-0.5">选视频 · 上传 · 发布得金豆</Text>
            </View>
            <Text className="text-muted-foreground text-xl">›</Text>
          </View>
        </View>

        {/* 我的创作（管理已发布 / 草稿） */}
        <View className="px-5 mt-8">
          <View
            className="flex items-center justify-between py-3 border-t border-border"
            hoverClass="none"
            onClick={() => Taro.navigateTo({ url: '/pages/content/content-center/my-articles/index' })}>
            <View className="flex items-center gap-2">
              <Icon name="file-document" size={20} className="text-primary" />
              <Text className="text-lg text-foreground">我的创作</Text>
            </View>
            <Text className="text-muted-foreground text-lg">›</Text>
          </View>
        </View>
      </View>
    </HubErrorBoundary>
  )
}
