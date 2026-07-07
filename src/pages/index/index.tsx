// @title 首页
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Image, Input, Button, View, Text } from '@tarojs/components'
import { getProductsByEmotion, getProducts, getAnnouncements, addToCart } from '@/db/api'
import type { Product, Announcement } from '@/db/types'
import {
  analyzeEmotion, rankProductsByEmotion, getEmotionPoetry,
  QUICK_MOOD_PRESETS, type ScoredProduct, type EmotionAnalysisResult
} from '@/utils/emotionEngine'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'

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
  const { profile } = useAuth()
  const { currentCity, loading: locationLoading, detectLocation } = useLocation()
  const myRef = profile?.referral_code || ''
  // 记录当前要分享的商品，供 useShareAppMessage 闭包读取
  const shareProductRef = useRef<{ id: string; name: string; imageUrl: string } | null>(null)

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
  
  // 新增：首页弹窗状态
  const [showCampaignPopup, setShowCampaignPopup] = useState(false)
  const [campaignList, setCampaignList] = useState<any[]>([])
  const [loadingCampaign, setLoadingCampaign] = useState(false)
  // 门店红包对应的门店名（用于在首页弹窗标注「XX店专享」）
  const [storeNameMap, setStoreNameMap] = useState<Record<string, string>>({})

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

  // 首页启动时自动获取定位
  useEffect(() => {
    // 如果还没有城市信息，自动获取定位
    if (!currentCity) {
      detectLocation()
    }
  }, [currentCity, detectLocation])

  // 首页分享：若用户点击了某商品的分享按钮则分享该商品，否则分享首页（均携带推广码）
  useShareAppMessage(() => {
    const p = shareProductRef.current
    if (p) return {
      title: `${p.name} · 来店有喜江湖好物`,
      path: `/pages/product/index?id=${encodeURIComponent(p.id)}${myRef ? `&ref=${myRef}` : ''}`,
      imageUrl: p.imageUrl || undefined,
    }
    return {
      title: '来店有喜 · 武侠生活平台，好物相候！',
      path: `/pages/index/index${myRef ? `?ref=${myRef}` : ''}`,
    }
  })
  useShareTimeline(() => ({ title: '来店有喜 · 武侠江湖，有喜相逢' }))

  // 下拉刷新
  useEffect(() => {
    const handler = () => {
      loadFeed(analysis)
      loadAnnouncements()
      Taro.stopPullDownRefresh()
    }
    // Taro 小程序下拉刷新回调
    ;(Taro as any).onPullDownRefresh = handler
    return () => { ;(Taro as any).onPullDownRefresh = null }
  }, [analysis])

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
  
  // 新增：首页加载时检查是否有可领取的红包/实物活动
  useEffect(() => {
    checkCampaign()
  }, [currentCity])
  
  const checkCampaign = useCallback(async () => {
    if (!currentCity?.id) return

    setLoadingCampaign(true)
    try {
      const { supabase } = await import('@/client/supabase')
      const now = new Date().toISOString().split('T')[0]  // YYYY-MM-DD

      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('[Index] 查询活动失败', error)
        setLoadingCampaign(false)
        return
      }

      // 前端过滤：开始日期 / 结束日期 / 领取上限
      const today = new Date()
      const activeList = (data || []).filter(c => {
        if (c.start_date && new Date(c.start_date) > today) return false
        if (c.end_date && new Date(c.end_date) < today) return false
        if (c.claimed_count >= c.total_limit) return false
        return true
      })

      if (activeList.length > 0) {
        setCampaignList(activeList)
        // 解析门店专享红包的门店名
        const storeIds = activeList.map((c: any) => c.store_id).filter(Boolean)
        if (storeIds.length > 0) {
          const { data: stores } = await supabase
            .from('stores')
            .select('id, name')
            .in('id', storeIds)
          const map: Record<string, string> = {}
          ;(stores || []).forEach((s: any) => { map[s.id] = s.name })
          setStoreNameMap(map)
        }
        setTimeout(() => setShowCampaignPopup(true), 3000)
      }
    } catch (err) {
      console.error('[Index] 检查活动失败', err)
    }
    setLoadingCampaign(false)
  }, [currentCity])

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
    <View className="min-h-screen bg-background pb-6">
      {/* 顶部导航 */}
      <View className="sticky top-0 z-10 bg-background px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <View className="flex items-center gap-3">
          {/* Logo */}
          <View className="flex items-center gap-2 flex-shrink-0">
            <View className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Text className="text-white font-bold text-base">喜</Text>
            </View>
            <Text className="text-2xl font-bold text-foreground">来店有喜</Text>
          </View>

          {/* 城市选择 */}
          <View 
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 flex-shrink-0"
            onClick={() => Taro.navigateTo({ url: '/pages/city-select/index' })}
          >
            <View className="i-mdi-map-marker text-base text-primary" />
            <Text className="text-base text-foreground">{currentCity?.city_name || '选择'}</Text>
            <View className="i-mdi-chevron-down text-sm text-muted-foreground" />
          </View>

          {/* 搜索框 */}
          <View className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2"
            onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
            <View className="i-mdi-magnify text-xl text-muted-foreground" />
            <Text className="text-xl text-muted-foreground">搜索</Text>
          </View>
        </View>
      </View>

      {/* IP伴侣气泡 —— 随情绪动态变化 */}
      <View className="mx-4 mt-4 p-4 rounded-2xl flex items-start gap-3 transition"
        style={{ background: emotionActive ? '#FFEEDD' : '#FFF0E8', border: emotionActive ? '1.5px solid #C2410C' : '1.5px solid transparent' }}>
        <View className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
          style={{ boxShadow: emotionActive ? '0 0 0 4px rgba(194,65,12,0.15)' : 'none' }}>
          <Text className="text-white text-2xl">🦊</Text>
        </View>
        <View className="flex-1">
          <Text className="text-xl text-foreground leading-relaxed">{ipBubble}</Text>
          {/* 情绪强度指示 */}
          {analysis && analysis.intensity !== 'low' && (
            <View className="flex items-center gap-1 mt-1">
              <Text className="text-base text-muted-foreground">情绪强度</Text>
              {[1, 2, 3].map(i => (
                <View key={i} className="w-3 h-3 rounded-full"
                  style={{ background: i <= (analysis.intensity === 'high' ? 3 : 2) ? '#C2410C' : '#E7DDD0' }} />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* 情绪输入区 */}
      <View className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: '#FFF0E8' }}>
        <View className="flex items-center justify-between mb-3">
          <Text className="text-xl font-bold text-foreground">此刻心情如何？</Text>
          {emotionActive && (
            <View className="flex items-center gap-1 text-primary text-xl" onClick={clearEmotion} hoverClass="none">
              <View className="i-mdi-close-circle text-xl" />
              <Text>清空</Text>
            </View>
          )}
        </View>

        {/* 快捷情绪词 —— 使用 Taro 原生 View + 内联样式，确保微信小程序 100% 可点击 */}
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '8px', marginBottom: '12px' }}>
          {QUICK_MOOD_PRESETS.map((preset) => {
            const isActive = mood === preset.label
            return (
              <View
                key={preset.label}
                hoverClass="none"
                onClick={() => {
                  // 立即反馈
                  Taro.showToast({ title: `${preset.emoji} ${preset.label}`, icon: 'none', duration: 800 })
                  console.log('[Mood] handleQuickMood start:', preset.label)
                  try {
                    setMood(preset.label)
                    const result = analyzeEmotion(preset.label)
                    console.log('[Mood] analyzeEmotion result:', result)
                    setAnalysis(result)
                    setIpBubble(result.ipBubble)
                    setPoetry(getEmotionPoetry(result.detectedTags, result.intensity))
                    setEmotionActive(true)
                    loadFeed(result)
                    console.log('[Mood] handleQuickMood done')
                  } catch (err) {
                    console.error('[Mood] error:', err)
                    Taro.showToast({ title: `错误: ${String(err)}`, icon: 'none', duration: 3000 })
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '10px 18px',
                  borderRadius: '999px',
                  borderWidth: '1.5px',
                  borderStyle: 'solid',
                  borderColor: isActive ? 'transparent' : '#E7DDD0',
                  backgroundColor: isActive ? '#C2410C' : '#FFFFFF',
                  // 确保足够大的触摸区域
                  minWidth: '80px',
                  height: '40px',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: '16px' }}>{preset.emoji}</Text>
                <Text style={{
                  fontSize: '14px',
                  color: isActive ? '#FFFFFF' : '#333333',
                  fontWeight: isActive ? 'bold' : 'normal',
                }}>{preset.label}</Text>
              </View>
            )
          })}
        </View>

        {/* 输入框 */}
        <View className="flex items-center gap-2">
          <View className="flex-1 border-2 rounded-xl px-4 py-3 bg-white transition"
            style={{ borderColor: emotionActive ? '#C2410C' : 'var(--color-input)' }}>
            <Input className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="直接说心情，自动为你匹配好物..."
              value={mood}
              onInput={(e) => { const ev = e as any; handleMoodInput(ev.detail?.value ?? ev.target?.value ?? '') }}
            />
          </View>
          {loading && <View className="i-mdi-loading text-2xl text-primary animate-spin flex-shrink-0" />}
        </View>

        {/* 情绪分析结果 —— 识别到的标签 */}
        {analysis && analysis.detectedTags.length > 0 && (
          <View className="mt-3">
            <View className="flex items-center gap-2 mb-2">
              <View className="i-mdi-tag-multiple text-xl text-primary" />
              <Text className="text-xl text-muted-foreground">识别到情绪：</Text>
            </View>
            <View className="flex flex-wrap gap-2">
              {analysis.detectedTags.map(tag => (
                <Text key={tag} className="px-3 py-1 rounded-full text-xl bg-primary/10 text-primary border border-primary/20">
                  #{tag}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* 武侠诗意翻译 */}
        {poetry && (
          <View className="mt-3 p-3 bg-white rounded-xl border border-border">
            <Text className="text-xl text-secondary leading-relaxed italic">「{poetry}」</Text>
            <View className="flex items-center justify-between mt-2">
              {emotionActive && matchedCount > 0 && (
                <Text className="text-xl text-primary font-bold">已为你筛选 {matchedCount} 件好物 ↓</Text>
              )}
              <View onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}
                className="flex items-center gap-1 text-primary text-xl ml-auto">
                <Text>去探索</Text>
                <View className="i-mdi-arrow-right text-xl" />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* 公告栏 */}
      {announcements.length > 0 && (
        <View className="mx-4 mt-4 px-4 py-2 rounded-xl bg-card border border-border flex items-center gap-2">
          <View className="i-mdi-bullhorn text-xl text-primary flex-shrink-0" />
          <Text className="text-xl text-foreground flex-1 truncate">{announcements[annIdx]?.content}</Text>
        </View>
      )}

      {/* 红包/实物领取弹窗 */}
      {showCampaignPopup && campaignList.length > 0 && (
        <View className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <View className="w-10/12 max-h-4/5 bg-card rounded-3xl p-6 overflow-y-auto">
            <Text className="text-2xl font-bold text-foreground text-center block mb-4">
              🎁 限时福利
            </Text>
            <Text className="text-base text-muted-foreground text-center block mb-6">
              领取红包/实物，锁定专属门店优惠
            </Text>
            
            {/* 活动列表 */}
            <View className="gap-4 mb-6">
              {campaignList.map((campaign, index) => (
                <View key={campaign.id} className="p-4 rounded-2xl bg-background border border-border">
                  <View className="flex items-center gap-3 mb-3">
                    <Text className="text-3xl">
                      {campaign.campaign_type === 'red_packet' ? '🧧' : '🎁'}
                    </Text>
                    <View className="flex-1">
                      <Text className="text-xl font-bold text-foreground block">
                        {campaign.campaign_name}
                      </Text>
                      <Text className="text-base text-muted-foreground">
                        {campaign.campaign_type === 'red_packet' 
                          ? `¥${campaign.gift_value} 现金红包`
                          : campaign.gift_name}
                      </Text>
                      {campaign.store_id && storeNameMap[campaign.store_id] && (
                        <View className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full bg-red-100">
                          <Text className="text-xs text-red-600 font-bold">
                            {storeNameMap[campaign.store_id]} 专享
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View
                    className="w-full py-3 rounded-2xl bg-primary text-white text-center text-xl font-bold"
                    onClick={() => {
                      Taro.navigateTo({
                        url: `/pages/campaign-claim/index?campaignId=${campaign.id}`
                      })
                      setShowCampaignPopup(false)
                    }}
                  >
                    立即领取
                  </View>
                </View>
              ))}
            </View>
            
            {/* 关闭按钮 */}
            <View
              className="w-full py-3 rounded-2xl bg-muted text-muted-foreground text-center text-xl font-bold"
              onClick={() => setShowCampaignPopup(false)}
            >
              暂时不要
            </View>
          </View>
        </View>
      )}

      {/* 场景卡片 */}
      <View className="mt-4 px-4">
        <View className="flex items-center justify-between mb-3">
          <Text className="text-2xl font-bold text-foreground">选个场景</Text>
          <Text className="text-xl text-primary" onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}>查看全部</Text>
        </View>
        <View className="flex gap-3 overflow-x-auto pb-2">
          {SCENES.map(scene => (
            <View key={scene.name}
              onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}
              className="flex-shrink-0 flex flex-col items-center gap-2 px-5 py-4 rounded-2xl bg-card border border-border"
              style={{ minWidth: 88 }}>
              <View className={`${scene.icon} text-3xl`} style={{ color: scene.color }} />
              <Text className="text-xl text-foreground">{scene.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Feed流 */}
      <View className="mt-4 px-4">
        <View className="flex items-center justify-between mb-3">
          <View className="flex items-center gap-2">
            <Text className="text-2xl font-bold text-foreground">
              {emotionActive ? '情绪专属推荐' : '为你推荐'}
            </Text>
            {emotionActive && matchedCount > 0 && (
              <Text className="px-2 py-0.5 rounded-full text-base bg-primary text-white">{matchedCount}件契合</Text>
            )}
          </View>
          {emotionActive && (
            <View className="flex items-center gap-1 text-muted-foreground text-xl" onClick={clearEmotion}>
              <Text>全部商品</Text>
            </View>
          )}
        </View>

        {/* 加载中骨架 */}
        {loading && feedItems.length === 0 && (
          <View className="flex gap-3">
            {[0, 1].map(col => (
              <View key={col} className="flex flex-col gap-3" style={{ width: 'calc(50% - 6px)' }}>
                {[0, 1, 2].map(i => (
                  <View key={i} className="bg-card rounded-2xl overflow-hidden border border-border animate-pulse">
                    <View className="w-full bg-muted" style={{ height: '140px' }} />
                    <View className="p-3 flex flex-col gap-2">
                      <View className="h-5 bg-muted rounded w-3/4" />
                      <View className="h-4 bg-muted rounded w-1/2" />
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* 双列瀑布流 */}
        {!loading || feedItems.length > 0 ? (
          <View className="flex gap-3">
            <View className="flex flex-col gap-3" style={{ width: 'calc(50% - 6px)' }}>
              {feedItems.filter((_, i) => i % 2 === 0).map(item => (
                <FeedCard key={item.product.id} item={item} addingId={addingId} onAddCart={handleAddCart}
                  onShareClick={p => { shareProductRef.current = { id: p.id, name: p.name, imageUrl: p.image_url || '' } }} />

              ))}
            </View>
            <View className="flex flex-col gap-3" style={{ width: 'calc(50% - 6px)' }}>
              {feedItems.filter((_, i) => i % 2 === 1).map(item => (
                <FeedCard key={item.product.id} item={item} addingId={addingId} onAddCart={handleAddCart}
                  onShareClick={p => { shareProductRef.current = { id: p.id, name: p.name, imageUrl: p.image_url || '' } }} />
              ))}
            </View>
          </View>
        ) : null}

        {feedItems.length === 0 && !loading && (
          <View className="flex flex-col items-center justify-center py-12 gap-3">
            <View className="i-mdi-store-search text-6xl text-muted-foreground" />
            <Text className="text-xl text-muted-foreground">暂无匹配好物，换个心情词试试~</Text>
          </View>
        )}
      </View>

      {/* 悬浮按钮 */}
      <View className="fixed bottom-24 right-4 flex flex-col gap-3 z-50">
        {/* 创作按钮 */}
        <Button type="button"
          className="flex items-center gap-1 rounded-full bg-card border border-border"
          style={{ boxShadow: '0 4px 16px rgba(194,65,12,0.18)', animation: 'fabGlow 2.5s ease-in-out infinite' }}
          onClick={() => Taro.navigateTo({ url: '/pages/content-center/make/index' })}>
          <View className="py-2 px-4 flex items-center gap-1">
            <Text className="text-xl">✍️</Text>
            <Text className="text-xl text-foreground font-bold">创作</Text>
          </View>
        </Button>
        {/* UGC游记 */}
        <Button type="button"
          className="w-12 h-12 rounded-full bg-card flex items-center justify-center border border-border"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          onClick={() => Taro.navigateTo({ url: '/pages/ugc-publish/index' })}>
          <View className="i-mdi-camera text-2xl text-foreground" />
        </Button>
        {/* 扫码购物 */}
        <Button type="button"
          className="w-12 h-12 rounded-full bg-primary flex items-center justify-center"
          style={{ boxShadow: '0 4px 12px rgba(194,65,12,0.35)' }}
          onClick={() => {
            Taro.scanCode({
              scanType: ['barCode', 'qrCode'],
              success: async (res) => {
                const code = res.result
                const { getProductByBarcode, addToCart } = await import('@/db/api')
                const prod = await getProductByBarcode(code)
                if (prod && prod.stores) {
                  await addToCart(prod.id, (prod.stores as any).id)
                  Taro.showModal({
                    title: '已加入行囊',
                    content: `「${prod.name}」已加入购物车`,
                    confirmText: '去结算',
                    cancelText: '继续购物',
                    success: (r) => {
                      if (r.confirm) Taro.switchTab({ url: '/pages/cart/index' })
                    },
                  })
                } else if (prod) {
                  Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(prod.id)}` })
                } else {
                  Taro.showToast({ title: '未找到对应商品', icon: 'none' })
                }
              },
              fail: () => {},
            })
          }}>
          <View className="i-mdi-barcode-scan text-2xl text-white" />
        </Button>
      </View>
    </View>
  )
}

// ====== FeedCard —— 支持情绪匹配度展示 ======
function FeedCard({
  item, addingId, onAddCart, onShareClick,
}: {
  item: ScoredProduct<Product>
  addingId: string | null
  onAddCart: (p: Product) => void
  onShareClick: (p: Product) => void
}) {
  const { product, matchScore, matchLabel } = item
  return (
    <View className="bg-card rounded-2xl overflow-hidden border border-border relative"
      style={{ borderColor: matchScore > 0 ? 'rgba(194,65,12,0.3)' : undefined }}
      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })}>

      {/* 匹配徽标 */}
      {matchLabel && (
        <View className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-base font-bold ${MATCH_LABEL_STYLE[matchLabel] ?? 'bg-muted text-secondary'}`}>
          {matchLabel}
        </View>
      )}

      {/* 分享按钮（右上角）*/}
      <Button openType="share"
        className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center leading-none"
        style={{ border: 'none', padding: 0 }}
        onClick={(e) => { e.stopPropagation(); onShareClick(product) }}>
        <View className="i-mdi-share-variant text-white text-xl" />
      </Button>

      <Image src={product.image_url || ''} mode="aspectFill" className="w-full" style={{ height: '140px' }} />

      <View className="p-3">
        <Text className="text-xl font-bold text-foreground leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {product.name}
        </Text>
        <View className="flex items-center justify-between mt-2">
          <Text className="text-xl font-bold text-primary">¥{product.price}</Text>
          {product.original_price && (
            <Text className="text-base text-muted-foreground line-through">¥{product.original_price}</Text>
          )}
        </View>

        {/* 情绪标签 —— 匹配到的高亮显示 */}
        {product.mood_tags && product.mood_tags.length > 0 && (
          <View className="flex gap-1 mt-2 flex-wrap">
            {product.mood_tags.slice(0, 3).map(t => (
              <Text key={t}
                className={`px-2 py-0.5 rounded-full text-base ${matchScore > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-secondary'}`}>
                {t}
              </Text>
            ))}
          </View>
        )}
      </View>

      <Button type="button"
        className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-primary flex items-center justify-center"
        onClick={e => { e.stopPropagation(); onAddCart(product) }}>
        {addingId === product.id
          ? <View className="i-mdi-loading text-white text-xl animate-spin" />
          : <View className="i-mdi-plus text-white text-xl" />}
      </Button>
    </View>
  )
}
