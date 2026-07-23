// @title 商品详情
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Image, Button, Swiper, SwiperItem, Video, View, Text } from '@tarojs/components'
import { getProductById, addToCart, isFavorited, toggleFavorite, recordFootprint, trackFoodTherapyEvent, bindStoreReferrer } from '@/db/api'
import { getProductFoodAdditives } from '@/db/food-api'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import { setPendingCheckout } from '@/utils/checkoutCache'
import { buildProductShare } from '@/utils/share'
import Icon from '@/components/Icon'
import type { Product, FoodAdditive } from '@/db/types'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'
import { MOOD_TAGS_ALL, SCENE_TAGS_ALL } from '@/utils/mood-tags'
import { generateEmotionDescription, generateEmotionHeadline } from '@/utils/emotion-description'
import { loadCategoryEmotionProfilesFromDb } from '@/utils/category-emotion'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { toFoodTherapyInput, TIER_LABEL } from '@/utils/food-therapy'
import { resolveIngredientEntries } from '@/utils/ingredient-analysis'
import FoodSafetyPanel from '@/components/FoodSafetyPanel'

export default function ProductPage() {
  const { user } = useAuth()
  const { selectedCrowds, selectedScene, classifyProduct } = useFoodTherapy()
  const id = useMemo(() => {
    const params = Taro.getCurrentInstance().router?.params
    return params?.id ? decodeURIComponent(params.id) : ''
  }, [])
  const [product, setProduct] = useState<Product | null>(null)
  const [foodAdditives, setFoodAdditives] = useState<FoodAdditive[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const cartCount = useCartCount()
  const [myCode, setMyCode] = useState('')
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const totalPrice = useMemo(() => {
    const price = Number(product?.price || 0)
    return Math.round(price * quantity * 100) / 100
  }, [product?.price, quantity])
  // 门店推荐套餐：根据 combo_product_ids 拉取关联商品
  const [comboProducts, setComboProducts] = useState<Product[]>([])
  // 云端类目策略加载标记：拉取完成后 +1，驱动情绪翻译用最新策略重算
  const [profilesTick, setProfilesTick] = useState(0)

  // 构建媒体列表：主图 + 副图 + 视频（视频放最后）
  const mediaList = useMemo(() => {
    if (!product) return []
    const list: { type: 'image'; url: string }[] = []
    const main = product.main_image || product.image_url
    if (main) list.push({ type: 'image', url: main })
    ;(product.sub_images || []).forEach(url => {
      if (url && !list.some(m => m.url === url)) list.push({ type: 'image', url })
    })
    return list
  }, [product])

  const videoUrl = useMemo(() => product?.video_url || '', [product])

  // 情绪翻译：优先读 product_emotion 缓存（emotion-compile Edge Function 编译，可能由 LLM 生成），
  // 无缓存且无标签时回退本地规则计算
  const hasEmotion = !!(product?.mood_tags?.length || product?.scene_tags?.length)
  const emotionData = useMemo<{ title: string; detail: string; headline: string; by: 'rule' | 'llm' } | null>(() => {
    if (!product) return null
    const category = (product as any).stores?.category
    // v3.1 情绪卖点标题引擎：emoji + 情绪修饰短句，给商品一句「货架感」卖点小标题
    const headline = generateEmotionHeadline(product, product.mood_tags || [], product.scene_tags || [], category)
    const cached = product.product_emotion
    if (cached?.emotion_detail) {
      return { title: cached.emotion_title || '情绪翻译', detail: cached.emotion_detail, headline, by: cached.compiled_by }
    }
    if (!hasEmotion) return null
    return {
      title: '情绪翻译',
      detail: generateEmotionDescription(product, product.mood_tags || [], product.scene_tags || [], category),
      headline,
      by: 'rule',
    }
  }, [product, hasEmotion, profilesTick])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const data = await getProductById(id)
    setProduct(data)
    // 强引导门店自推码：进商品详情即绑所属门店 owner 推广码（让利佣金回流门店）
    if (data?.store_id) bindStoreReferrer(data.store_id).catch(() => {})
    setLoading(false)
    // 记录浏览足迹
    if (data) recordFootprint(data.id).catch(() => {})
    // 导购反馈回流：记录浏览事件（个性化权重学习）
    if (data) trackFoodTherapyEvent({ productId: data.id, eventType: 'view', healthTag: (data as any).health_tag ?? [], emotionTag: (data as any).emotion_tag ?? [] }).catch(() => {})
    // 拉取云端类目情绪策略（运营后台改词库即时生效）；加载完驱动情绪翻译重算
    loadCategoryEmotionProfilesFromDb()
      .then(() => setProfilesTick(t => t + 1))
      .catch(() => {})
  }, [id])

  const refreshCart = useCallback(async () => {
    if (!user) return
    await refreshCartCount()
    const [favStatus, { data }] = await Promise.all([
      isFavorited(id),
      supabase.from('profiles').select('referral_code').maybeSingle(),
    ])
    setIsFav(favStatus)
    if (data?.referral_code) setMyCode(data.referral_code)
  }, [user, id])

  useEffect(() => { load(); refreshCart() }, [load, refreshCart])
  useDidShow(() => { refreshCart() })

  // 拉取「门店推荐套餐」关联商品（combo_product_ids），失败静默降级
  useEffect(() => {
    const ids = (product as any)?.combo_product_ids as string[] | undefined
    if (!ids || ids.length === 0) { setComboProducts([]); return }
    let alive = true
    supabase
      .from('products')
      .select('id, name, price, image_url')
      .in('id', ids)
      .then(({ data, error }: any) => {
        if (!alive) return
        if (!error && Array.isArray(data)) setComboProducts(data as Product[])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [product])

  // 拉取本商品挂载的配料安全条目（product_food_additives → food_additives）
  useEffect(() => {
    if (!id) return
    let alive = true
    getProductFoodAdditives(id)
      .then((links) => {
        if (!alive) return
        if (!links.length) { setFoodAdditives([]); return }
        const ids = links.map((l) => l.additive_id)
        supabase
          .from('food_additives')
          .select('*')
          .in('id', ids)
          .then(({ data }) => { if (alive) setFoodAdditives((data as FoodAdditive[]) || []) })
          .catch(() => { if (alive) setFoodAdditives([]) })
      })
      .catch(() => { if (alive) setFoodAdditives([]) })
    return () => { alive = false }
  }, [id])

  // 食养成分分析：优先用持久化 ingredients，回退商品名匹配
  const shiyangEntries = useMemo(
    () => (product ? resolveIngredientEntries(product) : []),
    [product],
  )

  // 商品卡分享：一定是产品（商品主图 + 商品详情路径），并注入食疗分档
  useShareAppMessage(() => {
    if (!product) return { title: '来电有喜', path: '/pages/product/index' }
    const s = buildProductShare(product, myCode)
    const tier = classifyProduct(product)
    if (tier) {
      return {
        title: `${product.name}｜${TIER_LABEL[tier]}`,
        path: s.path,
        imageUrl: s.imageUrl,
      }
    }
    return { title: s.title, path: s.path, imageUrl: s.imageUrl }
  })
  useShareTimeline(() => {
    if (!product) return { title: '来电有喜', query: '', imageUrl: '' }
    const s = buildProductShare(product, myCode)
    return { title: s.timelineTitle, query: s.query, imageUrl: s.imageUrl }
  })

  const requireLogin = () => {
    if (!user) { Taro.navigateTo({ url: '/pages/login/index' }); return false }
    return true
  }

  const handleToggleFav = async () => {
    if (!requireLogin() || !product) return
    setFavLoading(true)
    const { isFav: newFav } = await toggleFavorite(product.id)
    setIsFav(newFav)
    setFavLoading(false)
    // 导购反馈回流：收藏=点赞偏好，取消=点踩
    trackFoodTherapyEvent({ productId: product.id, eventType: newFav ? 'like' : 'dislike', healthTag: product.health_tag ?? [], emotionTag: product.emotion_tag ?? [] }).catch(() => {})
    Taro.showToast({ title: newFav ? '已收藏' : '已取消收藏', icon: 'none' })
  }

  const handleAddCart = async () => {
    if (!requireLogin() || !product) return
    setAdding(true)
    await addToCart(product.id, product.store_id, quantity)
    setAdding(false)
    // 导购反馈回流：加购=强偏好
    trackFoodTherapyEvent({ productId: product.id, eventType: 'add_cart', healthTag: product.health_tag ?? [], emotionTag: product.emotion_tag ?? [] }).catch(() => {})
    Taro.showToast({ title: '已加入行囊', icon: 'success' })
  }

  const handleBuyNow = async () => {
    if (!requireLogin() || !product) return
    setAdding(true)
    await addToCart(product.id, product.store_id, quantity)
    setAdding(false)
    // 写入待结算缓存：覆盖冷启动/热重载停在支付页时 router.params 为空的情况
    setPendingCheckout({ productId: product.id, total: totalPrice, quantity })
    Taro.navigateTo({ url: `/pages/payment/index?productId=${encodeURIComponent(product.id)}&total=${totalPrice}&quantity=${quantity}` })
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )
  if (!product) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Text className="text-xl text-muted-foreground">商品不存在</Text>
    </View>
  )

  return (
    <View className="min-h-screen bg-background pb-28">
      {/* 商品媒体轮播 + 顶部返回 + 购物车角标 */}
      <View className="relative">
        {/* 主图 + 副图轮播 */}
        {mediaList.length > 0 && (
          <Swiper
            current={currentMediaIndex}
            onChange={e => setCurrentMediaIndex(e.detail.current)}
            className="w-full"
            style={{ height: '280px' }}
            indicatorDots={mediaList.length > 1}
            indicatorColor="rgba(255,255,255,0.4)"
            indicatorActiveColor="#ffffff"
            circular={mediaList.length > 1}
            autoplay={mediaList.length > 1}
          >
            {mediaList.map((m, i) => (
              <SwiperItem key={i}>
                <Image src={m.url} mode="aspectFill" className="w-full h-full" style={{ display: 'block' }} />
              </SwiperItem>
            ))}
          </Swiper>
        )}

        {/* 媒体计数指示 */}
        {mediaList.length > 1 && (
          <View className="absolute bottom-3 right-4 px-2 py-0.5 rounded-full bg-black/50 text-white text-xs">
            {currentMediaIndex + 1}/{mediaList.length}
          </View>
        )}

        {/* 有视频标识 */}
        {videoUrl && (
          <View className="absolute bottom-3 left-4 px-2 py-0.5 rounded-full bg-red-500/80 text-white text-xs flex items-center gap-1">
            <Icon name="video" size={14} />
            <Text>含视频</Text>
          </View>
        )}
      </View>

      {/* 视频播放区域 */}
      {videoUrl && (
        <View className="mx-4 mt-3 rounded-2xl overflow-hidden bg-black">
          <Video
            src={videoUrl}
            className="w-full"
            style={{ height: '200px' }}
            controls
            showCenterPlayBtn
            enableProgressGesture
            objectFit="contain" />
        </View>
      )}

      {/* 价格信息卡 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
        {/* 分享赚佣提示 */}
        {myCode && (
          <View className="mb-3 py-2 px-3 rounded-xl bg-primary/10 flex items-center gap-2">
            <Icon name="share-variant" size={20} className="text-primary" />
            <Text className="text-xl text-primary font-bold">分享此商品，好友购买你可获佣金</Text>
          </View>
        )}
        <View className="flex items-center gap-3">
          <Text className="text-3xl font-bold text-primary">¥{product.price}</Text>
          {product.original_price && (
            <Text className="text-xl text-muted-foreground line-through">¥{product.original_price}</Text>
          )}
          {product.original_price && (
            <Text className="px-2 py-0.5 rounded-full bg-primary/10 text-xl font-bold text-primary">
              省¥{(product.original_price - product.price).toFixed(2)}
            </Text>
          )}
          {/* 让利标签 */}
          {product.discount_rate != null && product.discount_rate > 0 && (
            <Text className="px-2 py-0.5 rounded-full bg-primary/10 text-base font-bold text-primary">
              立减{product.discount_rate}%
            </Text>
          )}
        </View>
        <View className="text-2xl font-bold text-foreground mt-3 leading-tight">{product.name}</View>
        {/* 情绪翻译：商品详情的主叙事（非电商带货腔，优先读编译缓存） */}
        {emotionData && (
          <View
            className="mt-3 px-3 py-3 rounded-2xl bg-primary/5 border border-primary/15"
            onClick={() => product && Taro.navigateTo({ url: `/pages/emotion-detail/index?productId=${encodeURIComponent(product.id)}` })}
          >
            {/* v3.1 智能卖点标题：作为情绪卡的主视觉锚点，引导用户一眼抓住商品情绪角度 */}
            <View className="flex items-center gap-1.5 mb-2">
              <Text className="text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded" style={{ display: 'inline-block' }}>卖点</Text>
              <Text className="text-lg font-bold text-foreground leading-snug" style={{ display: 'inline-block' }}>{emotionData.headline}</Text>
            </View>
            <View className="flex items-center justify-between">
              <Text className="text-base font-bold text-primary" style={{ display: 'block' }}>
                ✨ {emotionData.title}{emotionData.by === 'llm' ? ' · 智能生成' : ''}
              </Text>
              <Text className="text-xs text-primary/70" style={{ flexShrink: 0, marginLeft: 8 }}>开启情绪之旅 ›</Text>
            </View>
            <Text className="text-xl text-foreground leading-relaxed mt-1" style={{ lineHeight: '1.7', display: 'block' }}>{emotionData.detail}</Text>
          </View>
        )}
        {/* 配料安全：挂载的添加剂安全分级 + 食养成分分析 */}
        <FoodSafetyPanel foodAdditives={foodAdditives} shiyangEntries={shiyangEntries} />
        {/* 商家原话（功能信息） */}
        {product.description && (
          <Text className="text-base text-muted-foreground mt-2 leading-relaxed" style={{ display: 'block' }}>商家原话：{product.description}</Text>
        )}
        {/* 情绪标签 - 情绪化展示 */}
        {product.mood_tags && product.mood_tags.length > 0 && (
          <View className="mt-3">
            <Text className="text-base font-bold text-foreground mb-2" style={{ display: 'block' }}>😊 商品氛围</Text>
            <View className="flex gap-2 flex-wrap">
              {product.mood_tags.map((tag: string) => {
                // 从情绪词库中查找标签信息
                const tagInfo = MOOD_TAGS_ALL.find(t => t.zh === tag)
                return (
                  <View 
                    key={tag}
                    className="px-3 py-2 rounded-2xl flex items-center gap-1"
                    style={{ 
                      background: tagInfo?.color ? `${tagInfo.color}20` : '#F5F5F5',
                      border: `1.5px solid ${tagInfo?.color || '#EEE'}`,
                    }}
                  >
                    <Text style={{ fontSize: '16px' }}>{tagInfo?.icon || '😊'}</Text>
                    <Text 
                      style={{ 
                        fontSize: '13px', 
                        fontWeight: '600',
                        color: tagInfo?.color || '#666',
                      }}
                    >{tag}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}
        {/* 场景标签 */}
        {product.scene_tags && product.scene_tags.length > 0 && (
          <View className="mt-3">
            <Text className="text-base font-bold text-foreground mb-2" style={{ display: 'block' }}>🏷️ 适用场景</Text>
            <View className="flex gap-2 flex-wrap">
              {product.scene_tags.map((tag: string) => {
                const tagInfo = SCENE_TAGS_ALL.find(t => t.zh === tag)
                return (
                  <View 
                    key={tag}
                    className="px-3 py-1 rounded-full flex items-center gap-1"
                    style={{ 
                      background: tagInfo?.color ? `${tagInfo.color}15` : '#F9F9F9',
                      border: `1px solid ${tagInfo?.color || '#EEE'}`,
                    }}
                  >
                    <Text style={{ fontSize: '14px' }}>{tagInfo?.icon || '🏷️'}</Text>
                    <Text 
                      style={{ 
                        fontSize: '12px', 
                        color: tagInfo?.color || '#666',
                      }}
                    >{tag}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}
        {/* 食材食疗智能导购 · 六模块纯展示（读取商家预存成品内容） */}
        {product && (() => {
          const input = toFoodTherapyInput(product)
          const tier = classifyProduct(product)
          const tierLabel = tier ? TIER_LABEL[tier] : ''
          const tierColor = tier === 'recommend' ? '#16A34A' : tier === 'caution' ? '#A8552E' : tier === 'avoid' ? '#DC2626' : '#6B7280'
          return (
            <View className="mt-3" style={{ padding: '12px 14px', borderRadius: '16px', background: '#F6FBF7', border: '1px solid #D6EFD8' }}>
              <Text className="text-base font-bold text-foreground mb-2" style={{ display: 'block' }}>🍵 食材食疗导购</Text>

              {/* 模块1：基础原材料 */}
              {input.ingredients && input.ingredients.length > 0 && (
                <View className="mb-3">
                  <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>① 基础原材料</Text>
                  <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>{input.ingredients.join('、')}</Text>
                  {input.food_category && (
                    <Text style={{ fontSize: '12px', color: '#16A34A', display: 'block', marginTop: 2 }}>分类：{input.food_category}{input.overall_nature ? ` · 整体性味 ${input.overall_nature}` : ''}</Text>
                  )}
                </View>
              )}

              {/* 模块2：食疗滋养效果（正面 + 风险） */}
              <View className="mb-3">
                <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>② 食疗滋养效果</Text>
                {input.positive_effect ? (
                  <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>✅ {input.positive_effect}</Text>
                ) : <Text style={{ fontSize: '12px', color: '#9CA3AF', display: 'block' }}>暂无说明</Text>}
                {input.risk_warning && (
                  <Text style={{ fontSize: '13px', color: '#A8552E', display: 'block', lineHeight: '1.6', marginTop: 4 }}>⚠️ 风险提示：{input.risk_warning}</Text>
                )}
              </View>

              {/* 模块3：情绪价值 */}
              {input.emotion_copy && (
                <View className="mb-3">
                  <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>③ 情绪价值</Text>
                  <Text style={{ fontSize: '13px', color: '#7C3AED', display: 'block', lineHeight: '1.6' }}>{input.emotion_copy}</Text>
                </View>
              )}

              {/* 模块4：适配 & 慎食 & 禁食人群 */}
              <View className="mb-3">
                <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>④ 人群适配提示</Text>
                {input.rec_crowds && input.rec_crowds.length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#16A34A', display: 'block', lineHeight: '1.6' }}>🌟 适配人群：{input.rec_crowds.join('、')}{input.guide_sentence ? `（${input.guide_sentence}）` : ''}</Text>
                )}
                {input.cautious_crowds && input.cautious_crowds.length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#A8552E', display: 'block', lineHeight: '1.6', marginTop: 2 }}>🟡 慎食人群：{input.cautious_crowds.join('、')}{input.cautious_notes ? `（${input.cautious_notes}）` : ''}</Text>
                )}
                {input.forbidden_crowds && input.forbidden_crowds.length > 0 && (
                  <Text style={{ fontSize: '13px', color: '#DC2626', display: 'block', lineHeight: '1.6', marginTop: 2 }}>🔴 不建议人群：{input.forbidden_crowds.join('、')}{input.forbidden_reasons ? `（${input.forbidden_reasons}）` : ''}</Text>
                )}
                {(!input.rec_crowds?.length && !input.cautious_crowds?.length && !input.forbidden_crowds?.length) && (
                  <Text style={{ fontSize: '12px', color: '#9CA3AF', display: 'block' }}>暂无特定人群标注</Text>
                )}
              </View>

              {/* 模块5：门店推荐搭配套餐 */}
              <View className="mb-3">
                <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>⑤ 门店推荐搭配</Text>
                {comboProducts.length > 0 ? (
                  <View className="flex gap-2 flex-wrap">
                    {comboProducts.map((c) => (
                      <View key={c.id}
                        className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-base"
                        onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${c.id}` })}>
                        <Text>{c.name} ¥{c.price}</Text>
                      </View>
                    ))}
                  </View>
                ) : input.match_goods && input.match_goods.length > 0 ? (
                  <Text style={{ fontSize: '13px', color: '#4B5563', display: 'block', lineHeight: '1.6' }}>推荐搭配：{input.match_goods.join('、')}</Text>
                ) : (
                  <Text style={{ fontSize: '12px', color: '#9CA3AF', display: 'block' }}>暂无搭配推荐</Text>
                )}
                {input.moments_copy && (
                  <Text style={{ fontSize: '12px', color: '#6B7280', display: 'block', lineHeight: '1.6', marginTop: 4 }}>📣 门店分享：{input.moments_copy}</Text>
                )}
              </View>

              {/* 当前勾选状态的分档提示（可选，基于首页筛选器） */}
              {tier && (
                <View className="mb-2 px-2 py-1.5 rounded-xl" style={{ background: tier === 'avoid' ? '#FEE2E2' : tier === 'caution' ? '#FEF3C7' : '#DCFCE7' }}>
                  <Text className="text-base font-bold" style={{ color: tierColor, display: 'block' }}>本单判定：{tierLabel}</Text>
                  {selectedCrowds.length > 0 && (
                    <Text style={{ fontSize: '12px', color: '#4B5563', display: 'block', marginTop: 2, lineHeight: '1.5' }}>
                      依据你勾选的「{selectedCrowds.join('、')}」{selectedScene ? ` · ${selectedScene}` : ''}
                    </Text>
                  )}
                </View>
              )}

              {/* 模块6：底部忌口警示 */}
              {input.taboo_warning && (
                <View className="mt-1 px-2 py-2 rounded-xl" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
                  <Text className="text-base font-bold" style={{ color: '#B91C1C', display: 'block' }}>⚠️ 忌口警示</Text>
                  <Text style={{ fontSize: '12px', color: '#7F1D1D', display: 'block', marginTop: 2, lineHeight: '1.5' }}>{input.taboo_warning}</Text>
                </View>
              )}

              <Text style={{ fontSize: '10px', color: '#9CA3AF', display: 'block', lineHeight: '1.5', marginTop: 6 }}>
                食养建议不替代医嘱，适量为佳；身体不适请及时就医。
              </Text>
            </View>
          )
        })()}

        {/* 进入门店 */}
        {product.stores && (
          <View className="mt-4 flex items-center gap-3 py-3 border-t border-border"
            onClick={() => Taro.navigateTo({ url: `/pages/store-home/index?id=${product.store_id}` })}>
            <Icon name="store" size={24} className="text-primary flex-shrink-0" />
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{(product.stores as any)?.name}</Text>
              <Text className="text-base text-muted-foreground">点击进入门店</Text>
            </View>
            <Icon name="chevron-right" size={20} className="text-muted-foreground" />
          </View>
        )}
      </View>

      {/* 数量选择器 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border flex items-center justify-between">
        <Text className="text-xl font-bold text-foreground">购买数量</Text>
        <View className="flex items-center gap-4">
          <View
            className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 ${quantity <= 1 ? 'border-muted bg-muted/50' : 'border-border bg-card'}`}
            hoverClass="none"
            onClick={() => { if (quantity > 1) setQuantity(q => q - 1) }}
          >
            <Text className={`text-2xl font-bold ${quantity <= 1 ? 'text-muted-foreground' : 'text-foreground'}`}>−</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground min-w-8 text-center">{quantity}</Text>
          <View
            className="w-10 h-10 rounded-xl flex items-center justify-center border-2 border-border bg-card"
            hoverClass="none"
            onClick={() => {
              const maxStock = (product as any)?.stock || 99
              if (quantity < maxStock) setQuantity(q => q + 1)
            }}
          >
            <Text className="text-2xl font-bold text-foreground">+</Text>
          </View>
        </View>
      </View>

      {/* 详情图片展示 */}
      {product.detail_images && product.detail_images.length > 0 && (
        <View className="mx-4 mt-3">
          <Text className="text-xl font-bold text-foreground mb-2">商品详情</Text>
          <View className="flex flex-col gap-3">
            {product.detail_images.map((img, i) => (
              <Image
                key={i}
                src={img}
                mode="widthFix"
                className="w-full rounded-2xl"
                style={{ display: 'block' }} />
            ))}
          </View>
        </View>
      )}

      {/* 底部操作栏 */}
      <View className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3 flex gap-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {/* 左侧：工具 + 合计 */}
        <View className="flex items-center gap-2">
          {/* 购物车图标入口 */}
          <View className="relative flex-shrink-0" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
            <View className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center border-2 border-border">
              <View className="text-foreground"><Icon name="bag" size={24} /></View>
            </View>
            {cartCount > 0 && (
              <View className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-primary flex items-center justify-center px-1">
                <Text className="text-white text-xs font-bold">{cartCount > 99 ? '99+' : cartCount}</Text>
              </View>
            )}
          </View>
          {/* 收藏按钮 */}
          <View className="w-14 h-14 rounded-2xl bg-muted flex-shrink-0 flex items-center justify-center border-2 border-border"
            onClick={handleToggleFav}>
            {favLoading
              ? <Icon name="loading" size={24} className="text-primary animate-spin" />
              : <Icon name="heart" size={24} className={isFav ? 'text-red-400' : 'text-foreground'} />}
          </View>
          {/* 分享按钮 */}
          <Button openType="share"
            className="w-14 h-14 rounded-2xl bg-muted flex-shrink-0 flex items-center justify-center border-2 border-border"
            style={{ background: '#f5f5f5', border: '2px solid #e5e5e5', padding: 0 }}>
            <Icon name="share-variant" size={24} className="text-foreground" />
          </Button>
          {/* 合计金额 */}
          <View className="flex flex-col items-end justify-center ml-1">
            <Text className="text-xs text-muted-foreground">合计</Text>
            <Text className="text-lg font-bold text-primary">¥{totalPrice.toFixed(2)}</Text>
          </View>
        </View>
        <Button type="default"
          className="flex-1 flex items-center justify-center leading-none rounded-2xl border-2 border-primary bg-card"
          onClick={handleAddCart}>
          <View className="py-4 text-xl font-bold text-primary">
            {adding ? '加入中...' : '加入行囊'}
          </View>
        </Button>
        <Button type="default"
          className="flex-1 flex items-center justify-center leading-none rounded-2xl bg-primary"
          onClick={handleBuyNow}>
          <View className="py-4 text-xl font-bold text-white">立即购买</View>
        </Button>
      </View>
    </View>
  )
}
