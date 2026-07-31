// @title 发布视频
// 创作中心两大功能之一：选视频 → 上传 → 发布。复用 articles 表的 video_url 字段与
// 既有锁客链路（article_locks / 分享带 ref），发布后直接落到 article-detail 播放。
import { useState, useEffect, useRef, Component, type MutableRefObject, type ReactNode } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Text, Input, Image, Video } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { createArticle, addEmotionTongbao, grantEmotionBadge } from '@/db/api'
import { uploadToStorage, uploadVideo } from '@/utils/upload'
import { checkIllegalWords } from '@/utils/compliance-words'
import Icon from '@/components/Icon'
import './index.scss'

const UGC_REWARD = 2

type SharePayload = { title: string; path: string; imageUrl: string }

/** 错误边界：任何渲染/副作用异常都落到可读提示，而不是整页白屏 */
class VideoErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: any) {
    return { err: e?.message || String(e) }
  }
  componentDidCatch(e: any) {
    console.error('[make-video] 渲染异常', e)
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

export default function MakeVideoPage() {
  const shareRef = useRef<SharePayload>({
    title: '来电有喜 · 发布视频',
    path: '/pages/content/content-center/make-video/index',
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
    try {
      Taro.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] }).catch(() => {})
    } catch { /* 分享能力缺失不影响发布 */ }
  }, [])

  return (
    <VideoErrorBoundary>
      <VideoPublishEditor shareRef={shareRef} />
    </VideoErrorBoundary>
  )
}

function VideoPublishEditor({ shareRef }: { shareRef: MutableRefObject<SharePayload> }) {
  const { user } = useAuth()

  const [title, setTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)   // 已上传的公网地址
  const [videoUploading, setVideoUploading] = useState(false)
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [coverUploading, setCoverUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    shareRef.current = {
      title: title.trim() || '来电有喜 · 视频分享',
      path: '/pages/content/content-center/make-video/index',
      imageUrl: coverImage || '',
    }
  }, [title, coverImage, shareRef])

  // 选择视频：直接调起相册/拍摄并上传到 videos 桶，返回公网地址
  const handleChooseVideo = async () => {
    if (videoUploading) return
    setVideoUploading(true)
    try {
      const url = await uploadVideo()
      if (url) setVideoUrl(url)
    } finally {
      setVideoUploading(false)
    }
  }

  // 可选封面
  const handleChooseCover = async () => {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      const tmp = res.tempFilePaths?.[0]
      if (!tmp) return
      setCoverImage(tmp)
      setCoverUploading(true)
      const url = await uploadToStorage(tmp, { bucket: 'images', silent: true })
      setCoverImage(url)
    } catch {
      setCoverImage(null)
      Taro.showToast({ title: '封面上传失败', icon: 'none' })
    } finally {
      setCoverUploading(false)
    }
  }

  const handlePublish = async () => {
    if (!title.trim()) { Taro.showToast({ title: '先给视频起个标题吧', icon: 'none' }); return }
    if (!videoUrl) { Taro.showToast({ title: '请先选择一个视频', icon: 'none' }); return }
    if (publishing) return
    if (videoUploading || coverUploading) { Taro.showToast({ title: '文件上传中，请稍候', icon: 'none' }); return }

    // 封面必须是已上传的公网地址
    if (coverImage && !/^https?:\/\//.test(coverImage)) {
      Taro.showToast({ title: '封面未上传成功，请重新选择', icon: 'none' }); return
    }

    // 合规硬闸：标题命中违禁词则拦截
    const hits = checkIllegalWords(title).found
    if (hits.length) {
      Taro.showModal({
        title: '标题需要修改',
        content: `检测到不合规词汇：${hits.slice(0, 6).join('、')}${hits.length > 6 ? ' 等' : ''}。\n食品相关内容请使用日常分享类表述。`,
        confirmText: '去修改', showCancel: false,
      })
      return
    }

    setPublishing(true)
    try {
      const art = await createArticle(title, '', [], [], {
        status: 'published',
        video_url: videoUrl,
        cover_image: coverImage ?? undefined,
      })
      const id = (art as any)?.id
      if (user?.id) {
        try { await addEmotionTongbao(user.id, UGC_REWARD, 'ugc_earn', id || undefined, '发布视频') } catch { /* ignore */ }
        try { await grantEmotionBadge(user.id, 'first_share') } catch { /* ignore */ }
      }
      Taro.showToast({ title: `发布成功 +${UGC_REWARD}金豆`, icon: 'success' })
      setTimeout(() => {
        if (id) Taro.redirectTo({ url: `/pages/content/article-detail/index?id=${id}` })
        else Taro.navigateBack()
      }, 800)
    } catch (e: any) {
      console.error('[make-video] 发布失败', e)
      Taro.showToast({ title: e?.message || '发布失败', icon: 'none' })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <View className="min-h-screen bg-background pb-28">
      {/* 顶栏 */}
      <View className="flex items-center justify-between px-4 py-3">
        <Text className="text-2xl font-bold text-foreground">发布视频</Text>
        <View className="flex items-center gap-1" hoverClass="none" onClick={() => Taro.navigateTo({ url: '/pages/content/content-center/my-articles/index' })}>
          <Icon name="file-document" size={18} className="text-primary" />
          <Text className="text-sm text-primary">我的</Text>
        </View>
      </View>

      {/* 标题 */}
      <View className="px-4">
        <Input
          className="w-full text-2xl font-bold text-foreground bg-transparent outline-none"
          placeholder="给视频起个标题…"
          value={title}
          onInput={(e: any) => setTitle(e.detail?.value || '')} />
      </View>

      {/* 视频选择 / 预览 */}
      <View className="px-4 mt-4">
        {!videoUrl ? (
          <View
            className="w-full h-56 rounded-2xl bg-card border-2 border-dashed border-border flex flex-col items-center justify-center"
            hoverClass="none"
            onClick={handleChooseVideo}>
            {videoUploading
              ? <Text className="text-lg text-muted-foreground">上传中…</Text>
              : (
                <>
                  <Icon name="video-plus" size={40} className="text-muted-foreground" />
                  <Text className="text-lg text-foreground mt-3">选择视频</Text>
                  <Text className="text-sm text-muted-foreground mt-1">从相册选择或拍摄，建议不超过 60 秒</Text>
                </>
              )}
          </View>
        ) : (
          <View className="relative rounded-2xl overflow-hidden bg-black">
            <Video
              src={videoUrl}
              className="w-full"
              style={{ height: '240px' }}
              controls
              showCenterPlayBtn
            />
            <View
              className="absolute top-2 right-2 px-3 py-1 rounded-full bg-black/50"
              hoverClass="none"
              onClick={handleChooseVideo}>
              <Text className="text-white text-sm">重新选择</Text>
            </View>
          </View>
        )}
      </View>

      {/* 封面（可选） */}
      <View className="px-4 mt-4 flex items-center gap-3">
        <View
          className="w-20 h-20 rounded-xl bg-card border border-dashed border-border flex items-center justify-center overflow-hidden"
          hoverClass="none"
          onClick={handleChooseCover}>
          {coverImage
            ? <Image src={coverImage} mode="aspectFill" className="w-full h-full" />
            : <Icon name="image-plus" size={28} className="text-muted-foreground" />}
        </View>
        <Text className="text-sm text-muted-foreground">
          {coverUploading ? '封面上传中…' : '加一张封面图（可选，分享更好看）'}
        </Text>
      </View>

      {/* 底部发布 */}
      <View className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 z-20">
        <View
          className={`flex items-center justify-center rounded-2xl py-3 ${publishing ? 'bg-primary/50' : 'bg-primary'}`}
          hoverClass="none"
          onClick={handlePublish}>
          <Text className="text-lg text-white font-bold">{publishing ? '发布中…' : `发布视频 +${UGC_REWARD}金豆`}</Text>
        </View>
      </View>
    </View>
  )
}
