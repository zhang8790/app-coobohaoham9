// @title 五屏情绪详情页（C 端沉浸式情绪导购）
// 方案 §5：场景共鸣 → 状态确认 → 情绪结果 → 身份确认 → 信任闭环
// 数据优先读 product_emotion 编译结果，无则降级用本地规则生成，保证每个商品都可进入
import { useState, useEffect, useMemo } from 'react'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { View, Text, Image, Swiper, SwiperItem, Video } from '@tarojs/components'
import './index.scss'
import { getProductById } from '@/db/api'
import type { Product, ProductEmotion } from '@/db/types'
import {
  EMOTION_DIMENSION_LABELS, recommendDimensions, getDimensionTag} from '@/utils/emotion-dimensions'
import { generateEmotionStages, generateEmotionHeadline } from '@/utils/emotion-description'
import { initEmotionTracker, trackEmotionEvent } from '@/utils/emotion-analytics'

type DimKey = 'function' | 'scene' | 'emotion' | 'identity' | 'sensory'

const SCREEN_COUNT = 5

export default function EmotionDetailPage() {
  const router = getCurrentInstance().router
  const productId = router?.params?.productId

  const [product, setProduct] = useState<Product | null>(null)
  const [emo, setEmo] = useState<ProductEmotion | null>(null)
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!productId) { setLoading(false); return }
    ;(async () => {
      setLoading(true)
      try {
        const p = await getProductById(productId)
        setProduct(p)
        if (p?.product_emotion) setEmo(p.product_emotion)
        // 埋点：进入五屏情绪详情页
        initEmotionTracker()
        trackEmotionEvent('enter', { productId, storeId: p?.store_id })
      } catch (e) {
        console.error('[五屏情绪详情] 加载失败', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [productId])

  // 解析三阶段文案 + 五维标签（优先云端编译，否则本地降级）
  const parsed = useMemo(() => {
    const empty: Record<DimKey, string[]> = { function: [], scene: [], emotion: [], identity: [], sensory: [] }
    if (!product) return { stage1: '', stage2: '', stage3: '', title: '', headline: '', dims: empty, hasCompiled: false, source: '' }

    // v3.1 智能卖点标题：屏3 商品揭晓时作为「一句话卖点」呈现（emoji + 情绪修饰短句）
    const headline = generateEmotionHeadline(
      product,
      product.mood_tags || [],
      product.scene_tags || [],
      product.stores?.category || undefined,
    )

    // 有云端编译结果
    if (emo && (emo.emotion_detail || (emo.dimension_tags && Object.keys(emo.dimension_tags).length))) {
      const dt = (emo.dimension_tags || {}) as Record<DimKey, string[]>
      const dims: Record<DimKey, string[]> = {
        function: dt.function || [], scene: dt.scene || [],
        emotion: dt.emotion || [], identity: dt.identity || [], sensory: dt.sensory || []}
      const parts = (emo.emotion_detail || '').split(' ').filter(Boolean)
      let stage1 = '', stage2 = '', stage3 = ''
      if (parts.length >= 3) { stage1 = parts[0]; stage2 = parts[1]; stage3 = parts.slice(2).join(' ') }
      else if (parts.length === 2) { stage1 = parts[0]; stage2 = parts[1] }
      else if (parts.length === 1) { stage2 = parts[0] }
      return { stage1, stage2, stage3, title: emo.emotion_title || '', headline, dims, hasCompiled: true, source: emo.compiled_by || 'rule' }
    }

    // 降级：用商品身份前置引擎生成差异化三阶段文案（保证每个商品内容不同）
    const stages = generateEmotionStages(
      product,
      product.mood_tags || [],
      product.scene_tags || [],
      product.stores?.category || undefined,
    )
    const rec = recommendDimensions(`${product.name} ${product.description ?? ''}`)
    const dims: Record<DimKey, string[]> = {
      function: rec.function || [],
      scene: (product.scene_tags?.length ? product.scene_tags.slice(0, 3) : (rec.scene || [])),
      emotion: (product.mood_tags?.length ? product.mood_tags.slice(0, 3) : (rec.emotion || [])),
      identity: rec.identity || [],
      sensory: rec.sensory || []}
    return {
      stage1: stages.stage1,
      stage2: stages.stage2,
      stage3: stages.stage3,
      title: stages.title,
      headline,
      dims,
      hasCompiled: false,
      source: 'stages'}
  }, [product, emo])

  const handleBack = () => {
    Taro.navigateBack().catch(() => Taro.redirectTo({ url: '/pages/index/index' }))
  }
  const goNext = () => setCurrent(c => Math.min(SCREEN_COUNT - 1, c + 1))
  const handleBuy = () => {
    if (!product) return
    trackEmotionEvent('cta_click', { productId: product.id, storeId: product.store_id })
    Taro.navigateTo({ url: `/pages/payment/index?productId=${encodeURIComponent(product.id)}&total=${product.price}&quantity=1` })
  }

  // 标签 chips 渲染
  const TagChips = ({ dim, label }: { dim: DimKey; label?: string }) => {
    const tags = parsed.dims[dim] || []
    if (!tags.length) return null
    return (
      <View className="emo-chips">
        {label && <Text className="emo-chips-label">{label}</Text>}
        <View className="emo-chips-row">
          {tags.map(zh => {
            const meta = getDimensionTag(dim, zh) || { icon: '·', color: '#999', zh }
            return (
              <View key={zh} className="emo-chip" style={{ background: `${meta.color}22`, borderColor: meta.color }}>
                <Text className="emo-chip-icon">{meta.icon}</Text>
                <Text className="emo-chip-text" style={{ color: meta.color }}>{zh}</Text>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View className="emo-page">
        <View className="emo-loading">
          <Text className="emo-loading-spin">🎭</Text>
          <Text className="emo-loading-text">正在唤起你的情绪之旅…</Text>
        </View>
      </View>
    )
  }

  if (!productId || !product) {
    return (
      <View className="emo-page">
        <View className="emo-empty">
          <Text className="emo-empty-icon">🫥</Text>
          <Text className="emo-empty-text">没有找到这个商品</Text>
          <View className="emo-empty-btn" onClick={handleBack}>
            <Text className="emo-empty-btn-text">返回</Text>
          </View>
        </View>
      </View>
    )
  }

  const mainImg = product.main_image || product.image_url || ''
  const score = emo?.quality_score

  return (
    <View className="emo-page">
      {/* 顶部进度 + 计数 */}
      <View className="emo-topbar">
        <View className="emo-back" onClick={handleBack}>
          <Text className="emo-back-text">‹ 返回</Text>
        </View>
        <View className="emo-progress">
          <View className="emo-progress-bar" style={{ width: `${((current + 1) / SCREEN_COUNT) * 100}%` }} />
        </View>
        <Text className="emo-counter">{String(current + 1).padStart(2, '0')} / 05</Text>
      </View>

      <Swiper
        className="emo-swiper"
        vertical
        current={current}
        onChange={(e: any) => {
          const idx = e.detail.current
          setCurrent(idx)
          if (product) trackEmotionEvent('screen_view', { productId, storeId: product.store_id, screenIndex: idx })
        }}
        duration={420}
      >
        {/* ── 屏1 场景共鸣 ── */}
        <SwiperItem className="emo-screen screen-1">
          {mainImg && <Image className="emo-bg-img" src={mainImg} mode="aspectFill" />}
          <View className="emo-bg-mask" />
          <View className="emo-content">
            <Text className="emo-kicker">此刻的你，也许正需要</Text>
            <Text className="emo-headline">{parsed.stage1 || '想给自己一点温柔？'}</Text>
            <TagChips dim="scene" label={EMOTION_DIMENSION_LABELS.scene} />
          </View>
          <View className="emo-swipe-hint" onClick={goNext}>
            <Text className="emo-swipe-arrow">↑</Text>
            <Text className="emo-swipe-text">上滑，遇见此刻的你</Text>
          </View>
        </SwiperItem>

        {/* ── 屏2 状态确认 ── */}
        <SwiperItem className="emo-screen screen-2">
          <View className="emo-content emo-center">
            <Text className="emo-kicker">{parsed.title || '情绪之旅'}</Text>
            <Text className="emo-headline emo-headline-mid">{parsed.stage2 || '明明很累了，又不想随便对付自己？'}</Text>
            <TagChips dim="emotion" label={EMOTION_DIMENSION_LABELS.emotion} />
          </View>
          <View className="emo-swipe-hint" onClick={goNext}>
            <Text className="emo-swipe-arrow">↑</Text>
            <Text className="emo-swipe-text">上滑，看看被接住的感觉</Text>
          </View>
        </SwiperItem>

        {/* ── 屏3 情绪结果 ── */}
        <SwiperItem className="emo-screen screen-3">
          <View className="emo-visual">
            {product.video_url
              ? <Video className="emo-visual-media" src={product.video_url} controls loop muted showCenterPlayBtn={false} />
              : (mainImg
                  ? <Image className="emo-visual-media" src={mainImg} mode="aspectFill" />
                  : <View className="emo-visual-ph" ><Text className="emo-visual-ph-icon">🎁</Text></View>)}
          </View>
          <View className="emo-content emo-center">
            <Text className="emo-headline emo-headline-mid">它，正好接住了此刻的你</Text>
            {/* v3.1 智能卖点标题：情绪钩子之后的「一句话卖点」，落到具体商品角度 */}
            {parsed.headline && <Text className="emo-sellpoint">{parsed.headline}</Text>}
            <Text className="emo-subline">{product.name}</Text>
          </View>
          <View className="emo-swipe-hint" onClick={goNext}>
            <Text className="emo-swipe-arrow">↑</Text>
            <Text className="emo-swipe-text">上滑，确认你的身份</Text>
          </View>
        </SwiperItem>

        {/* ── 屏4 身份确认 ── */}
        <SwiperItem className="emo-screen screen-4">
          <View className="emo-content emo-center">
            <Text className="emo-kicker">所以，你是</Text>
            <Text className="emo-headline emo-headline-lg">{parsed.stage3 || '懂得好好照顾自己的人'}</Text>
            <TagChips dim="identity" label={EMOTION_DIMENSION_LABELS.identity} />
          </View>
          <View className="emo-swipe-hint" onClick={goNext}>
            <Text className="emo-swipe-arrow">↑</Text>
            <Text className="emo-swipe-text">最后一步，放心带它回家</Text>
          </View>
        </SwiperItem>

        {/* ── 屏5 信任闭环 ── */}
        <SwiperItem className="emo-screen screen-5">
          <View className="emo-content">
            <Text className="emo-kicker">为什么可以放心拥有</Text>
            <View className="emo-trust-row">
              <TagChips dim="sensory" label={EMOTION_DIMENSION_LABELS.sensory} />
              {typeof score === 'number' && (
                <View className="emo-score-badge">
                  <Text className="emo-score-num">{score}</Text>
                  <Text className="emo-score-label">编译分</Text>
                </View>
              )}
            </View>

            <View className="emo-fact-card">
              <Text className="emo-fact-name">{product.name}</Text>
              {/* v3.1 智能卖点标题：信任闭环里再落一次情绪角度，临门一脚 */}
              {parsed.headline && <Text className="emo-fact-tagline">{parsed.headline}</Text>}
              {product.description && <Text className="emo-fact-desc">商家原话：{product.description}</Text>}
              <View className="emo-fact-bottom">
                <View className="emo-price">
                  <Text className="emo-price-symbol">¥</Text>
                  <Text className="emo-price-num">{product.price}</Text>
                </View>
                {score != null && (
                  <Text className="emo-fact-tag">{parsed.hasCompiled ? '已编译上架' : '情绪推荐'}</Text>
                )}
              </View>
            </View>

            <View className="emo-cta" onClick={handleBuy}>
              <Text className="emo-cta-text">立即拥有 →</Text>
            </View>
            <View className="emo-cta-sub" onClick={() => Taro.navigateBack()}>
              <Text className="emo-cta-sub-text">返回商品详情</Text>
            </View>
          </View>
        </SwiperItem>
      </Swiper>
    </View>
  )
}
