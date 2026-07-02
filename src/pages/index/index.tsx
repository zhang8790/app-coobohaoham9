// @title 首页
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Text, ScrollView, Image, Input } from '@tarojs/components'
import { getProductsByEmotion, getProducts, getAnnouncements, addToCart, getProductByBarcode } from '@/db/api'
import type { Product, Announcement } from '@/db/types'
import {
  analyzeEmotion, rankProductsByEmotion, getEmotionPoetry,
  QUICK_MOOD_PRESETS, type ScoredProduct, type EmotionAnalysisResult
} from '@/utils/emotionEngine'
import { useAuth } from '@/contexts/AuthContext'

const SCENES = [
  { name: '治愈空间', emoji: '🌿', color: '#4CAF50' },
  { name: '用餐时光', emoji: '🍜', color: '#FF7043' },
  { name: '购物时刻', emoji: '🛍️', color: '#7B1FA2' },
  { name: '学习空间', emoji: '📖', color: '#1976D2' },
]

// 匹配标签样式
const MATCH_LABEL_MAP: Record<string, { bg: string; color: string }> = {
  '完美契合': { bg: '#C2410C', color: '#FFF' },
  '较好匹配': { bg: '#EA580C', color: '#FFF' },
  '有点匹配': { bg: '#FFF7ED', color: '#9A3412' },
}

export default function IndexPage() {
  const { profile } = useAuth()
  const myRef = profile?.referral_code || ''
  const shareProductRef = useRef<{ id: string; name: string; imageUrl: string } | null>(null)
  const feedRef = useRef<number>(0)

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

  // 分享
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

  // 加载公告
  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await getAnnouncements()
      if (Array.isArray(data)) setAnnouncements(data)
    } catch { /* 不阻塞 */ }
  }, [])

  // 加载 Feed
  const loadFeed = useCallback(async (emotionResult?: EmotionAnalysisResult) => {
    setLoading(true)
    try {
      let raw: Product[] = []
      if (emotionResult && emotionResult.detectedTags.length > 0) {
        raw = await getProductsByEmotion(emotionResult.detectedTags, 40)
      } else {
        raw = await getProducts({ limit: 30 })
      }
      if (Array.isArray(raw)) {
        // 前端精确打分（mock 模式下 supabase 查不到，这里直接前端算）
        const { calcProductMatchScore } = await import('@/utils/emotionEngine')
        const scored = raw
          .filter((p: any) => p && p.id)
          .map((p: any) => {
            const score = emotionResult ? calcProductMatchScore(p.mood_tags || [], emotionResult.tagScores || {}) : 0
            const matchLabel =
              score >= 8 ? '完美契合' :
              score >= 4 ? '较好匹配' :
              score >= 1 ? '有点匹配' : ''
            return { product: p, matchScore: score, matchLabel, score, tagScores: {} } as ScoredProduct<Product>
          })
          .sort((a, b) => b.matchScore - a.matchScore)
        setFeedItems(scored)
      }
    } catch (e) {
      console.error('[首页] loadFeed 失败', e)
    } finally {
      setLoading(false)
    }
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

  const handleAddCart = async (product: Product, e?: any) => {
    if (e) { try { e.stopPropagation() } catch {} }
    if (!profile) { Taro.navigateTo({ url: '/pages/login/index' }); return }
    setAddingId(product.id)
    try {
      await addToCart(product.id, product.store_id)
      Taro.showToast({ title: '已加入行囊', icon: 'success' })
    } catch {
      Taro.showToast({ title: '加购失败', icon: 'error' })
    } finally {
      setAddingId(null)
    }
  }

  // 有情绪时的匹配商品数
  const matchedCount = feedItems.filter(f => f.matchScore > 0).length

  // 滚动到商品区
  const scrollToFeed = () => {
    const query = Taro.createSelectorQuery()
    query.select('#feed-section').boundingClientRect()
    query.exec((res: any) => {
      if (res && res[0]) {
        Taro.pageScrollTo({ scrollTop: res[0].top, duration: 300 })
      }
    })
  }

  return (
    <ScrollView scrollY enhanced showScrollbar={false}
      style={{ height: '100vh', background: '#FFF8F4' }}>

      {/* ══════════════════════════════════════════
          顶部导航
         ══════════════════════════════════════════ */}
      <View style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#FFF',
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: '10px',
        borderBottom: '1px solid #E7DDD0',
      }}>
        {/* Logo */}
        <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <View style={{
            width: '32px', height: '32px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #FF8A65, #FF5722)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: '14px' }}>喜</Text>
          </View>
          <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>来店有喜</Text>
        </View>
        {/* 搜索框 */}
        <View
          onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', gap: '6px',
            background: '#F5F0EB',
            borderRadius: '999px',
            padding: '8px 14px',
          }}>
          <Text style={{ fontSize: '16px' }}>🔍</Text>
          <Text style={{ fontSize: '14px', color: '#BBB' }}>搜索好物、门店...</Text>
        </View>
      </View>

      {/* ══════════════════════════════════════════
          IP伴侣气泡
         ══════════════════════════════════════════ */}
      <View style={{
        margin: '12px 14px 0',
        padding: '14px 16px',
        borderRadius: '18px',
        display: 'flex', alignItems: 'flex-start', gap: '12px',
        background: emotionActive ? '#FFEEDD' : '#FFF0E8',
        border: emotionActive ? '1.5px solid #C2410C' : '1.5px solid transparent',
        transition: 'all 0.3s',
      }}>
        {/* 头像 */}
        <View style={{
          width: '48px', height: '48px', borderRadius: '24px',
          background: 'linear-gradient(135deg, #FF8A65, #FF5722)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: emotionActive ? '0 0 0 4px rgba(194,65,12,0.15)' : 'none',
        }}>
          <Text style={{ fontSize: '24px' }}>🦊</Text>
        </View>
        {/* 文案 + 情绪强度 */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: '14px', color: '#5D4037', lineHeight: '1.6' }}>{ipBubble}</Text>
          {/* 情绪强度指示 */}
          {analysis && analysis.intensity !== 'low' && (
            <View style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
              <Text style={{ fontSize: '12px', color: '#999' }}>情绪强度</Text>
              {[1, 2, 3].map(i => (
                <View key={i} style={{
                  width: '10px', height: '10px', borderRadius: '5px',
                  background: i <= (analysis.intensity === 'high' ? 3 : 2) ? '#C2410C' : '#E7DDD0',
                }} />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* ══════════════════════════════════════════
          情绪输入区
         ══════════════════════════════════════════ */}
      <View style={{ padding: '12px 14px 0' }}>
        <View style={{
          borderRadius: '18px',
          background: '#FFF',
          border: '1px solid #F0E6D8',
          padding: '16px 14px',
        }}>
          {/* 标题行 */}
          <View style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '12px',
          }}>
            <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>此刻心情如何？</Text>
            {emotionActive && (
              <View onClick={clearEmotion} style={{
                display: 'flex', alignItems: 'center', gap: '2px',
              }}>
                <Text style={{ fontSize: '14px', color: '#C2410C' }}>❌ 清空</Text>
              </View>
            )}
          </View>

          {/* 快捷情绪词（横向滚动） */}
          <ScrollView scrollX showScrollbar={false} style={{ marginBottom: '12px', whiteSpace: 'nowrap' }}>
            <View style={{ display: 'flex', flexDirection: 'row', gap: '8px', padding: '2px 0 8px' }}>
              {QUICK_MOOD_PRESETS.map(preset => {
                const isActive = mood === preset.label
                return (
                  <View key={preset.label}
                    onClick={() => handleQuickMood(preset)}
                    style={{
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '8px 16px',
                      borderRadius: '999px',
                      border: '1.5px solid',
                      borderColor: isActive ? '#C2410C' : '#E7DDD0',
                      background: isActive ? '#FFF3EE' : '#FFF',
                    }}>
                    <Text style={{ fontSize: '16px' }}>{preset.emoji}</Text>
                    <Text style={{
                      fontSize: '13px',
                      color: isActive ? '#C2410C' : '#555',
                      fontWeight: isActive ? 'bold' : '400',
                    }}>{preset.label}</Text>
                  </View>
                )
              })}
            </View>
          </ScrollView>

          {/* 输入框 */}
          <View style={{
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <View style={{
              flex: 1,
              borderWidth: '2px',
              borderRadius: '14px',
              padding: '12px 16px',
              background: '#FFF',
              borderColor: emotionActive ? '#C2410C' : '#EDE8DD',
            }}>
              <Input
                style={{ width: '100%', fontSize: '14px', color: '#333' }}
                placeholder="直接说心情，自动为你匹配好物..."
                placeholderStyle="color:#BBB;font-size:14px"
                value={mood}
                confirmType="search"
                maxlength={50}
                onInput={(e: any) => handleMoodInput(e.detail?.value ?? '')}
                onConfirm={() => {
                  if (mood.trim()) {
                    const result = analyzeEmotion(mood)
                    setAnalysis(result)
                    setIpBubble(result.ipBubble)
                    setPoetry(getEmotionPoetry(result.detectedTags, result.intensity))
                    setEmotionActive(result.detectedTags.length > 0)
                    loadFeed(result)
                  }
                }}
              />
            </View>
            {loading && <Text style={{ fontSize: '18px' }}>⏳</Text>}
          </View>

          {/* 情绪分析结果 —— 识别到的标签 */}
          {analysis && analysis.detectedTags.length > 0 && (
            <View style={{ marginTop: '12px' }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Text style={{ fontSize: '14px' }}>🏷️</Text>
                <Text style={{ fontSize: '13px', color: '#999' }}>识别到情绪：</Text>
              </View>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {analysis.detectedTags.map(tag => (
                  <Text key={tag} style={{
                    padding: '4px 12px',
                    borderRadius: '999px',
                    fontSize: '13px',
                    background: '#FFF3EE',
                    color: '#C2410C',
                    border: '1px solid #FDD9C3',
                  }}>#{tag}</Text>
                ))}
              </View>
            </View>
          )}

          {/* 武侠诗意翻译 */}
          {poetry && (
            <View style={{
              marginTop: '12px',
              padding: '12px 14px',
              borderRadius: '14px',
              background: '#FFFDF7',
              border: '1px solid #F0E6D8',
            }}>
              <Text style={{
                fontSize: '13px', color: '#5D4037', lineHeight: '1.7', fontStyle: 'italic',
              }}>「{poetry}」</Text>
              <View style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: '8px',
              }}>
                {emotionActive && matchedCount > 0 && (
                  <Text style={{ fontSize: '13px', color: '#C2410C', fontWeight: 'bold' }}>
                    已为你筛选 {matchedCount} 件好物 ↓
                  </Text>
                )}
                <Text
                  onClick={scrollToFeed}
                  style={{
                    fontSize: '13px', color: '#C2410C', fontWeight: '500', marginLeft: 'auto',
                  }}
                >去探索 →</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ══════════════════════════════════════════
          公告栏
         ══════════════════════════════════════════ */}
      {announcements.length > 0 && (
        <View style={{ padding: '12px 14px 0' }}>
          <View style={{
            overflow: 'hidden',
            borderRadius: '12px',
            background: '#FFFBF0',
            border: '1px dashed #FFD54F',
            height: '40px', display: 'flex', alignItems: 'center',
          }}>
            {announcements.slice(0, 3).map((a, i) => (
              <View key={a.id} style={{
                position: i === annIdx ? 'relative' : 'absolute',
                opacity: i === annIdx ? 1 : 0,
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center',
                paddingHorizontal: '14px', gap: '8px',
              }}>
                <Text style={{ fontSize: '14px', flexShrink: 0 }}>📢</Text>
                <Text style={{
                  fontSize: '13px', color: '#6D4C00',
                  flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>{a.content}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ══════════════════════════════════════════
          场景卡片
         ══════════════════════════════════════════ */}
      <View style={{ padding: '16px 14px 0' }}>
        <View style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '12px',
        }}>
          <Text style={{ fontSize: '17px', fontWeight: 'bold', color: '#333' }}>🌸 选个场景</Text>
          <Text
            onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}
            style={{ fontSize: '13px', color: '#C2410C', fontWeight: '500' }}
          >全部 →</Text>
        </View>
        <ScrollView scrollX showScrollbar={false}>
          <View style={{ display: 'flex', flexDirection: 'row', gap: '10px', padding: '2px 0 8px' }}>
            {SCENES.map(scene => (
              <View key={scene.name}
                onClick={() => Taro.switchTab({ url: '/pages/explore/index' })}
                style={{
                  flexShrink: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: '8px',
                  padding: '16px 22px',
                  borderRadius: '16px',
                  background: '#FFF',
                  border: '1px solid #F0E6D8',
                  minWidth: '88px',
                }}>
                <View style={{
                  width: '44px', height: '44px', borderRadius: '22px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: scene.color + '15',
                }}>
                  <Text style={{ fontSize: '22px' }}>{scene.emoji}</Text>
                </View>
                <Text style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>{scene.name}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* ══════════════════════════════════════════
          Feed流（双列瀑布流）
         ══════════════════════════════════════════ */}
      <View id="feed-section" style={{ padding: '16px 14px 120px' }}>
        {/* 标题 */}
        <View style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '12px',
        }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Text style={{ fontSize: '17px', fontWeight: 'bold', color: '#333' }}>
              {emotionActive ? '🎯 情绪专属推荐' : '🔥 为你推荐'}
            </Text>
            {emotionActive && matchedCount > 0 && (
              <Text style={{
                padding: '2px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                background: '#C2410C', color: '#FFF', fontWeight: 'bold',
              }}>{matchedCount}件契合</Text>
            )}
          </View>
          {emotionActive && (
            <Text onClick={clearEmotion} style={{ fontSize: '13px', color: '#999' }}>全部商品</Text>
          )}
        </View>

        {/* 加载中骨架 */}
        {loading && feedItems.length === 0 && (
          <View style={{ display: 'flex', gap: '12px' }}>
            {[0, 1].map(col => (
              <View key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={{
                    background: '#FFF', borderRadius: '16px', overflow: 'hidden',
                    border: '1px solid #F0E6D8',
                  }}>
                    <View style={{ width: '100%', height: '140px', background: '#F5F0EB' }} />
                    <View style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <View style={{ height: '16px', width: '75%', background: '#F5F0EB', borderRadius: '4px' }} />
                      <View style={{ height: '14px', width: '50%', background: '#F5F0EB', borderRadius: '4px' }} />
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* 双列瀑布流 */}
        {(!loading || feedItems.length > 0) && (
          <View style={{ display: 'flex', gap: '12px' }}>
            {/* 左列 */}
            <View style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {feedItems.filter((_, i) => i % 2 === 0).map(item => (
                <FeedCard
                  key={item.product.id}
                  item={item}
                  addingId={addingId}
                  onAddCart={handleAddCart}
                  onShareClick={p => { shareProductRef.current = { id: p.id, name: p.name, imageUrl: (p as any).image_url || '' } }}
                />
              ))}
            </View>
            {/* 右列 */}
            <View style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {feedItems.filter((_, i) => i % 2 === 1).map(item => (
                <FeedCard
                  key={item.product.id}
                  item={item}
                  addingId={addingId}
                  onAddCart={handleAddCart}
                  onShareClick={p => { shareProductRef.current = { id: p.id, name: p.name, imageUrl: (p as any).image_url || '' } }}
                />
              ))}
            </View>
          </View>
        )}

        {/* 空状态 */}
        {feedItems.length === 0 && !loading && (
          <View style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '48px 0', gap: '12px',
          }}>
            <Text style={{ fontSize: '48px' }}>🏪</Text>
            <Text style={{ fontSize: '14px', color: '#999' }}>暂无匹配好物，换个心情词试试~</Text>
          </View>
        )}
      </View>

      {/* ══════════════════════════════════════════
          悬浮按钮组（固定在右下角）
         ══════════════════════════════════════════ */}
      <View style={{
        position: 'fixed',
        bottom: '96px',
        right: '16px',
        display: 'flex', flexDirection: 'column',
        gap: '12px',
        zIndex: 50,
      }}>
        {/* 创作按钮 */}
        <View
          onClick={() => Taro.navigateTo({ url: '/pages/content-center/make/index' })}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            borderRadius: '999px',
            background: '#FFF',
            border: '1px solid #F0E6D8',
            padding: '8px 16px',
            boxShadow: '0 4px 16px rgba(194,65,12,0.18)',
          }}
        >
          <Text style={{ fontSize: '16px' }}>✍️</Text>
          <Text style={{ fontSize: '13px', color: '#333', fontWeight: 'bold' }}>创作</Text>
        </View>

        {/* UGC 游记 */}
        <View
          onClick={() => Taro.navigateTo({ url: '/pages/ugc-publish/index' })}
          style={{
            width: '48px', height: '48px', borderRadius: '24px',
            background: '#FFF',
            border: '1px solid #F0E6D8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
          }}
        >
          <Text style={{ fontSize: '20px' }}>📷</Text>
        </View>

        {/* 扫码购物 */}
        <View
          onClick={() => {
            Taro.scanCode({
              scanType: ['barCode', 'qrCode'],
              success: async (res) => {
                const code = String(res.result || '').trim()
                console.log('[首页扫码] 原始结果:', JSON.stringify(res.result), '→ trim后:', code)
                if (!code) { Taro.showToast({ title: '扫码结果为空', icon: 'none' }); return }
                try {
                  console.log('[首页扫码] 开始查询条形码:', code)
                  const prod = await getProductByBarcode(code)
                  console.log('[首页扫码] 查询结果:', prod ? `${prod.name} (id=${prod.id})` : '未找到')
                  if (prod && prod.store_id) {
                    console.log('[首页扫码] 准备加入购物车:', prod.id, prod.store_id)
                    await addToCart(prod.id, prod.store_id)
                    console.log('[首页扫码] 已加入购物车')
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
                } catch (e) {
                  console.error('[首页扫码] 查询失败:', e)
                  Taro.showToast({ title: '扫码失败: ' + ((e as any)?.message || '未知错误'), icon: 'none' })
                }
              },
              fail: () => {},
            })
          }}
          style={{
            width: '48px', height: '48px', borderRadius: '24px',
            background: 'linear-gradient(135deg, #FF8A65, #FF5722)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(194,65,12,0.35)',
          }}
        >
          <Text style={{ fontSize: '20px' }}>📷</Text>
        </View>
      </View>

    </ScrollView>
  )
}

// ====== FeedCard 组件 ======
function FeedCard({
  item, addingId, onAddCart, onShareClick,
}: {
  item: ScoredProduct<Product>
  addingId: string | null
  onAddCart: (p: Product, e?: any) => void
  onShareClick: (p: Product) => void
}) {
  const { product, matchScore, matchLabel } = item
  const matchStyle = MATCH_LABEL_MAP[matchLabel || ''] || { bg: '#F5F0EB', color: '#999' }

  // 防御：image_url 可能不存在
  const imgUrl = (product as any).image_url || ''
  const productName = product.name || '未命名商品'
  const productPrice = product.price ?? 0
  const originalPrice = product.original_price ?? null

  return (
    <View
      onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${product.id}` })}
      style={{
        background: '#FFF',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid ' + (matchScore > 0 ? 'rgba(194,65,12,0.30)' : '#F0E6D8'),
        position: 'relative',
      }}
    >
      {/* 匹配徽标 */}
      {matchLabel && (
        <View style={{
          position: 'absolute', top: '8px', left: '8px', zIndex: 10,
          padding: '2px 10px',
          borderRadius: '999px',
          background: matchStyle.bg,
        }}>
          <Text style={{ fontSize: '11px', color: matchStyle.color, fontWeight: 'bold' }}>{matchLabel}</Text>
        </View>
      )}

      {/* 分享按钮（右上角）*/}
      <View
        onClick={(e: any) => { try { e.stopPropagation() } catch {}; onShareClick(product) }}
        style={{
          position: 'absolute', top: '8px', right: '8px', zIndex: 10,
          width: '32px', height: '32px', borderRadius: '16px',
          background: 'rgba(0,0,0,0.40)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: '14px', color: '#FFF' }}>↗</Text>
      </View>

      {/* 商品图片 */}
      <Image
        src={imgUrl}
        mode="aspectFill"
        style={{ width: '100%', height: '140px' }}
        fallbackSrc=""
      />

      {/* 商品信息 */}
      <View style={{ padding: '12px' }}>
        <Text style={{
          fontSize: '14px', fontWeight: 'bold', color: '#333', lineHeight: '1.4',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{productName}</Text>

        <View style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '8px',
        }}>
          <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#C2410C' }}>
            ¥{productPrice}
          </Text>
          {originalPrice && (
            <Text style={{
              fontSize: '12px', color: '#BBB', textDecorationLine: 'line-through',
            }}>¥{originalPrice}</Text>
          )}
        </View>

        {/* 情绪标签 */}
        {product.mood_tags && product.mood_tags.length > 0 && (
          <View style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
            {product.mood_tags.slice(0, 3).map((t: string) => (
              <Text key={t} style={{
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                background: matchScore > 0 ? '#FFF3EE' : '#F5F0EB',
                color: matchScore > 0 ? '#C2410C' : '#999',
              }}>{t}</Text>
            ))}
          </View>
        )}
      </View>

      {/* 加购按钮 */}
      <View
        onClick={(e: any) => { try { e.stopPropagation() } catch {}; onAddCart(product, e) }}
        style={{
          position: 'absolute', bottom: '12px', right: '12px',
          width: '32px', height: '32px', borderRadius: '16px',
          background: 'linear-gradient(135deg, #FF8A65, #FF5722)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(255,87,34,0.30)',
        }}
      >
        {addingId === product.id
          ? <Text style={{ fontSize: '14px', color: '#FFF' }}>⏳</Text>
          : <Text style={{ fontSize: '16px', color: '#FFF' }}>+</Text>
        }
      </View>
    </View>
  )
}
