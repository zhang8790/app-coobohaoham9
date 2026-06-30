// @title 首页
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getProductsByEmotion, getProducts, getAnnouncements, addToCart } from '@/db/api'
import type { Product, Announcement } from '@/db/types'
import {
  analyzeEmotion, rankProductsByEmotion, getEmotionPoetry,
  QUICK_MOOD_PRESETS, type ScoredProduct, type EmotionAnalysisResult
} from '@/utils/emotionEngine'

const SCENES = [
  { name: '治愈空间', icon: 'i-mdi-leaf', color: '#4CAF50' },
  { name: '用餐时光', icon: 'i-mdi-food', color: '#FF7043' },
  { name: '购物时刻', icon: 'i-mdi-shopping', color: '#7B1FA2' },
  { name: '学习空间', icon: 'i-mdi-book-open', color: '#1976D2' },
]

// 匹配标签样式
const MATCH_LABEL_STYLE: Record<string, string> = {
  '完美契合': 'bg-primary text-white',
  '较好匹配': 'bg-accent text-white',
  '有点匹配': 'bg-muted text-secondary',
}

export default function IndexPage() {
  const [mood, setMood] = useState('')
  const [analysis, setAnalysis] = useState<EmotionAnalysisResult | null>(null)
  const [ipBubble, setIpBubble] = useState('侠客，今日有喜，好物相候！')
  const [poetry, setPoetry] = useState('')
  const [feedItems, setFeedItems] = useState<ScoredProduct<Product>[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [annIdx, setAnnIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [emotionActive, setEmotionActive] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 小程序启动时捕获 scene：ref=推广码 或 s=门店短码&r=推广码
  const routeParams = useMemo(() => Taro.getCurrentInstance().router?.params as any || {}, [])
  useEffect(() => {
    // 直接 URL 参数（H5 / 普通跳转）
    const refDirect = routeParams.ref as string || ''
    const storeShortDirect = routeParams.s as string || ''

    // scene 参数（小程序码扫码进入）
    let refFromScene = ''
    let storeShortFromScene = ''
    if (routeParams.scene) {
      try {
        const scene = decodeURIComponent(routeParams.scene as string)
        const refMatch = scene.match(/ref=([A-Z0-9]{6})/i)
        const sMatch = scene.match(/[?&]?r=([A-Z0-9]{6})/i) || scene.match(/^r=([A-Z0-9]{6})/i)
        const storeMatch = scene.match(/s=([A-Z0-9]{8})/i)
        if (refMatch) refFromScene = refMatch[1].toUpperCase()
        if (sMatch) refFromScene = sMatch[1].toUpperCase()
        if (storeMatch) storeShortFromScene = storeMatch[1].toUpperCase()
      } catch { /* ignore */ }
    }

    const finalRef = (refDirect || refFromScene).toUpperCase()
    const finalStore = (storeShortDirect || storeShortFromScene).toUpperCase()

    // 保存推广码到 Storage，登录后自动绑定
    if (finalRef) Taro.setStorageSync('pendingReferralCode', finalRef)

    // 若有门店短码，查询门店 ID 并跳转
    if (finalStore) {
      import('@/client/supabase').then(({ supabase }) => {
        supabase.from('stores').select('id').eq('short_code', finalStore).maybeSingle()
          .then(({ data }) => {
            if (data?.id) {
              Taro.navigateTo({ url: `/pages/store-home/index?id=${data.id}` })
            }
          })
      })
    }
  }, [routeParams])

  // 首页分享
  useShareAppMessage(() => ({ title: '来店有喜 · 武侠生活平台，好物相候！', path: '/pages/index/index' }))
  useShareTimeline(() => ({ title: '来店有喜 · 武侠江湖，有喜相逢' }))

  // 加载公告
  const loadAnnouncements = useCallback(async () => {
    const data = await getAnnouncements()
    setAnnouncements(data)
  }, [])

  // 加载 Feed（默认无情绪时展示全量，有情绪时用情绪查询）
  const loadFeed = useCallback(async (emotionResult?: EmotionAnalysisResult) => {
    setLoading(true)
    let raw: Product[]
    if (emotionResult && emotionResult.detectedTags.length > 0) {
      raw = await getProductsByEmotion(emotionResult.detectedTags, 40)
    } else {
      raw = await getProducts({ limit: 30 })
    }
    const scored = rankProductsByEmotion(raw, emotionResult?.tagScores ?? {})
    setFeedItems(scored)
    setLoading(false)
  }, [])

  useEffect(() => { loadAnnouncements(); loadFeed() }, [loadAnnouncements, loadFeed])
  useDidShow(() => { loadFeed(analysis ?? undefined) })

  // 公告轮播
  useEffect(() => {
    if (announcements.length <= 1) return
    const t = setInterval(() => setAnnIdx(i => (i + 1) % announcements.length), 3000)
    return () => clearInterval(t)
  }, [announcements.length])

  // 情绪输入实时防抖分析（500ms）
  const handleMoodInput = (value: string) => {
    setMood(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!value.trim()) {
      setAnalysis(null)
      setEmotionActive(false)
      setPoetry('')
      setIpBubble('侠客，今日有喜，好物相候！')
      loadFeed()
      return
    }
    debounceTimer.current = setTimeout(() => {
      const result = analyzeEmotion(value)
      setAnalysis(result)
      setIpBubble(result.ipBubble)
      setPoetry(getEmotionPoetry(result.detectedTags, result.intensity))
      setEmotionActive(result.detectedTags.length > 0)
      loadFeed(result)
    }, 500)
  }

  // 点击快捷情绪词
  const handleQuickMood = (preset: typeof QUICK_MOOD_PRESETS[number]) => {
    setMood(preset.label)
    const result = analyzeEmotion(preset.label)
    setAnalysis(result)
    setIpBubble(result.ipBubble)
    setPoetry(getEmotionPoetry(result.detectedTags, result.intensity))
    setEmotionActive(true)
    loadFeed(result)
  }

  // 清空情绪
  const clearEmotion = () => {
    setMood('')
    setAnalysis(null)
    setEmotionActive(false)
    setPoetry('')
    setIpBubble('侠客，今日有喜，好物相候！')
    loadFeed()
  }

  const handleAddCart = async (product: Product) => {
    const uid = (await import('@/client/supabase').then(m => m.supabase.auth.getUser())).data.user
    if (!uid) { Taro.navigateTo({ url: '/pages/login/index' }); return }
    setAddingId(product.id)
    await addToCart(product.id, product.store_id)
    setAddingId(null)
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  // 有情绪时的匹配商品数
  const matchedCount = feedItems.filter(f => f.matchScore > 0).length

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-background px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-base">喜</span>
          </div>
          <span className="text-2xl font-bold text-foreground">来店有喜</span>
        </div>
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
          <div className="i-mdi-magnify text-xl text-muted-foreground" />
          <span className="text-xl text-muted-foreground">搜索好物、门店...</span>
        </div>
      </div>

      {/* IP伴侣气泡 —— 随情绪动态变化 */}
      <div className="mx-4 mt-4 p-4 rounded-2xl flex items-start gap-3 transition"
        style={{ background: emotionActive ? '#FFEEDD' : '#FFF0E8', border: emotionActive ? '1.5px solid #C2410C' : '1.5px solid transparent' }}>
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
          style={{ boxShadow: emotionActive ? '0 0 0 4px rgba(194,65,12,0.15)' : 'none' }}>
          <span className="text-white text-2xl">🦊</span>
        </div>
        <div className="flex-1">
          <p className="text-xl text-foreground leading-relaxed">{ipBubble}</p>
          {/* 情绪强度指示 */}
          {analysis && analysis.intensity !== 'low' && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-base text-muted-foreground">情绪强度</span>
              {[1, 2, 3].map(i => (
                <div key={i} className="w-3 h-3 rounded-full"
                  style={{ background: i <= (analysis.intensity === 'high' ? 3 : 2) ? '#C2410C' : '#E7DDD0' }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 情绪输入区 */}
      <div className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: '#FFF0E8' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xl font-bold text-foreground">此刻心情如何？</p>
          {emotionActive && (
            <div className="flex items-center gap-1 text-primary text-xl" onClick={clearEmotion}>
              <div className="i-mdi-close-circle text-xl" />
              <span>清空</span>
            </div>
          )}
        </div>

        {/* 快捷情绪词 */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3" style={{ whiteSpace: 'nowrap' }}>
          {QUICK_MOOD_PRESETS.map(preset => (
            <div key={preset.label}
              onClick={() => handleQuickMood(preset)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xl border transition ${mood === preset.label ? 'bg-primary text-white border-primary' : 'bg-white text-foreground border-border'}`}>
              <span>{preset.emoji}</span>
              <span>{preset.label}</span>
            </div>
          ))}
        </div>

        {/* 输入框 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 border-2 rounded-xl px-4 py-3 bg-white transition"
            style={{ borderColor: emotionActive ? '#C2410C' : 'var(--color-input)' }}>
            <input className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="直接说心情，自动为你匹配好物..."
              value={mood}
              onInput={(e) => { const ev = e as any; handleMoodInput(ev.detail?.value ?? ev.target?.value ?? '') }}
            />
          </div>
          {loading && <div className="i-mdi-loading text-2xl text-primary animate-spin flex-shrink-0" />}
        </div>

        {/* 情绪分析结果 —— 识别到的标签 */}
        {analysis && analysis.detectedTags.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-mdi-tag-multiple text-xl text-primary" />
              <span className="text-xl text-muted-foreground">识别到情绪：</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {analysis.detectedTags.map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full text-xl bg-primary/10 text-primary border border-primary/20">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 武侠诗意翻译 */}
        {poetry && (
          <div className="mt-3 p-3 bg-white rounded-xl border border-border">
            <p className="text-xl text-secondary leading-relaxed italic">「{poetry}」</p>
            <div className="flex items-center justify-between mt-2">
              {emotionActive && matchedCount > 0 && (
                <span className="text-xl text-primary font-bold">已为你筛选 {matchedCount} 件好物 ↓</span>
              )}
              <div onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}
                className="flex items-center gap-1 text-primary text-xl ml-auto">
                <span>去探索</span>
                <div className="i-mdi-arrow-right text-xl" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 公告栏 */}
      {announcements.length > 0 && (
        <div className="mx-4 mt-4 px-4 py-2 rounded-xl bg-card border border-border flex items-center gap-2">
          <div className="i-mdi-bullhorn text-xl text-primary flex-shrink-0" />
          <span className="text-xl text-foreground flex-1 truncate">{announcements[annIdx]?.content}</span>
        </div>
      )}

      {/* 场景卡片 */}
      <div className="mt-4 px-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-2xl font-bold text-foreground">选个场景</span>
          <span className="text-xl text-primary" onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}>查看全部</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {SCENES.map(scene => (
            <div key={scene.name}
              onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}
              className="flex-shrink-0 flex flex-col items-center gap-2 px-5 py-4 rounded-2xl bg-card border border-border"
              style={{ minWidth: 88 }}>
              <div className={`${scene.icon} text-3xl`} style={{ color: scene.color }} />
              <span className="text-xl text-foreground">{scene.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feed流 */}
      <div className="mt-4 px-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">
              {emotionActive ? '情绪专属推荐' : '为你推荐'}
            </span>
            {emotionActive && matchedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-base bg-primary text-white">{matchedCount}件契合</span>
            )}
          </div>
          {emotionActive && (
            <div className="flex items-center gap-1 text-muted-foreground text-xl" onClick={clearEmotion}>
              <span>全部商品</span>
            </div>
          )}
        </div>

        {/* 加载中骨架 */}
        {loading && feedItems.length === 0 && (
          <div className="flex gap-3">
            {[0, 1].map(col => (
              <div key={col} className="flex flex-col gap-3" style={{ width: 'calc(50% - 6px)' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} className="bg-card rounded-2xl overflow-hidden border border-border animate-pulse">
                    <div className="w-full bg-muted" style={{ height: '140px' }} />
                    <div className="p-3 flex flex-col gap-2">
                      <div className="h-5 bg-muted rounded w-3/4" />
                      <div className="h-4 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 双列瀑布流 */}
        {!loading || feedItems.length > 0 ? (
          <div className="flex gap-3">
            <div className="flex flex-col gap-3" style={{ width: 'calc(50% - 6px)' }}>
              {feedItems.filter((_, i) => i % 2 === 0).map(item => (
                <FeedCard key={item.product.id} item={item} addingId={addingId} onAddCart={handleAddCart} />
              ))}
            </div>
            <div className="flex flex-col gap-3" style={{ width: 'calc(50% - 6px)' }}>
              {feedItems.filter((_, i) => i % 2 === 1).map(item => (
                <FeedCard key={item.product.id} item={item} addingId={addingId} onAddCart={handleAddCart} />
              ))}
            </div>
          </div>
        ) : null}

        {feedItems.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="i-mdi-store-search text-6xl text-muted-foreground" />
            <p className="text-xl text-muted-foreground">暂无匹配好物，换个心情词试试~</p>
          </div>
        )}
      </div>

      {/* 悬浮按钮 */}
      <div className="fixed bottom-24 right-4 flex flex-col gap-3 z-50">
        {/* 创作按钮 */}
        <button type="button"
          className="flex items-center gap-1 rounded-full bg-card border border-border"
          style={{ boxShadow: '0 4px 16px rgba(194,65,12,0.18)', animation: 'fabGlow 2.5s ease-in-out infinite' }}
          onClick={() => Taro.navigateTo({ url: '/pages/content-center/make/index' })}>
          <div className="py-2 px-4 flex items-center gap-1">
            <span className="text-xl">✍️</span>
            <span className="text-xl text-foreground font-bold">创作</span>
          </div>
        </button>
        {/* UGC游记 */}
        <button type="button"
          className="w-12 h-12 rounded-full bg-card flex items-center justify-center border border-border"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          onClick={() => Taro.navigateTo({ url: '/pages/ugc-publish/index' })}>
          <div className="i-mdi-camera text-2xl text-foreground" />
        </button>
        {/* 扫码购物 */}
        <button type="button"
          className="w-12 h-12 rounded-full bg-primary flex items-center justify-center"
          style={{ boxShadow: '0 4px 12px rgba(194,65,12,0.35)' }}
          onClick={() => {
            Taro.scanCode({
              scanType: ['barCode', 'qrCode'],
              success: async (res) => {
                const code = res.result
                // 尝试按条形码查找商品
                const { getProductByBarcode } = await import('@/db/api')
                const prod = await getProductByBarcode(code)
                if (prod) {
                  Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(prod.id)}` })
                } else {
                  Taro.showToast({ title: '未找到对应商品', icon: 'none' })
                }
              },
              fail: () => {},
            })
          }}>
          <div className="i-mdi-barcode-scan text-2xl text-white" />
        </button>
      </div>
    </div>
  )
}

// ====== FeedCard —— 支持情绪匹配度展示 ======
function FeedCard({
  item, addingId, onAddCart
}: {
  item: ScoredProduct<Product>
  addingId: string | null
  onAddCart: (p: Product) => void
}) {
  const { product, matchScore, matchLabel } = item
  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border relative"
      style={{ borderColor: matchScore > 0 ? 'rgba(194,65,12,0.3)' : undefined }}
      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })}>

      {/* 匹配徽标 */}
      {matchLabel && (
        <div className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-base font-bold ${MATCH_LABEL_STYLE[matchLabel] ?? 'bg-muted text-secondary'}`}>
          {matchLabel}
        </div>
      )}

      <Image src={product.image_url || ''} mode="aspectFill" className="w-full" style={{ height: '140px' }} />

      <div className="p-3">
        <p className="text-xl font-bold text-foreground leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {product.name}
        </p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xl font-bold text-primary">¥{product.price}</span>
          {product.original_price && (
            <span className="text-base text-muted-foreground line-through">¥{product.original_price}</span>
          )}
        </div>

        {/* 情绪标签 —— 匹配到的高亮显示 */}
        {product.mood_tags && product.mood_tags.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {product.mood_tags.slice(0, 3).map(t => (
              <span key={t}
                className={`px-2 py-0.5 rounded-full text-base ${matchScore > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-secondary'}`}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <button type="button"
        className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-primary flex items-center justify-center"
        onClick={e => { e.stopPropagation(); onAddCart(product) }}>
        {addingId === product.id
          ? <div className="i-mdi-loading text-white text-xl animate-spin" />
          : <div className="i-mdi-plus text-white text-xl" />}
      </button>
    </div>
  )
}
