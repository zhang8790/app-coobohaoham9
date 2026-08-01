// 食疗咨询页 · 「我适合吃什么」自动推荐（纯净咨询窗口）
// ------------------------------------------------------------
// 入口：首页悬浮「食疗咨询」+ 我的菜单「食疗咨询」
// 能力：用户自由问话 → NLU 解析诉求 → 后台融合「体质 + 已购六维画像 + 节气」
//       自动排序推荐。界面只呈现咨询对话与推荐结果，不展示体质/六维/已购等分析面板。
//       零外部依赖（NLU 规则兜底）。

import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView, Image, Textarea, Button } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { getProducts, getOrders, getProductsByIds, addToCart, createOrder, getCartItems } from '@/db/api'
import { supabase } from '@/client/supabase'
import { recommendForConsult, type ConsultResult, type ConsultRecommendation } from '@/utils/food-therapy/consult-recommend'
import { checkCartConflicts, toFoodTherapyInput, type CartConflict } from '@/utils/food-therapy'
import { resolveConstitution } from '@/utils/today-food-therapy'
import { setPendingCheckout } from '@/utils/checkoutCache'
import type { Product, CartItem } from '@/db/types'
import './index.scss'

const HISTORY_KEY = 'consult_history_v1'
const TURNS_KEY = 'consult_turns_v2'
const TURNS_MAX = 20

const QUICK_PROMPTS = [
  '最近嗓子干痒还怕冷',
  '容易上火想清火',
  '换季想润一润',
  '体寒怕冷怎么吃',
  '想消暑解腻',
  '脾胃调理吃什么',
  '刚做完手术，适合吃什么水果',
  '术后想补补，喝点什么汤',
  '熬夜后喝什么茶养胃',
  '想吃点坚果补补脑',
  '换季干燥，吃什么蔬菜好',
  '脾胃弱，喝点什么粥养胃',
  '想吃点粗粮主食替代米饭',
]

interface Turn {
  q: string
  result: ConsultResult
}

// 展示价：临期批次特惠价优先，否则目录价（与购物车/支付页实付价一致）
function computePrice(i: CartItem, effMap: Record<string, number>): number {
  if (i.batch_id != null && effMap[i.batch_id] != null) return effMap[i.batch_id]!
  return i.products?.price || 0
}

// 拉取购物车 + 临期特惠价映射（结算面板与购物车条共用）
async function fetchCartWithEff(): Promise<{ items: CartItem[]; effMap: Record<string, number>; total: number }> {
  const data = (await getCartItems()) as CartItem[]
  const effMap: Record<string, number> = {}
  const batchIds = data.map((i) => i.batch_id).filter(Boolean) as string[]
  if (batchIds.length) {
    const { data: effRows } = await supabase
      .from('v_near_expiry_products')
      .select('batch_id, effective_price')
      .in('batch_id', batchIds)
    ;(effRows || []).forEach((r: any) => { if (r.batch_id != null) effMap[r.batch_id] = r.effective_price })
  }
  const total = data.reduce((s, i) => s + computePrice(i, effMap) * i.quantity, 0)
  return { items: data, effMap, total }
}

export default function ConsultPage() {
  const { user, profile } = useAuth()
  const { currentStore } = useLocation()

  const [pool, setPool] = useState<Product[]>([])
  const [bought, setBought] = useState<Product[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [boostTags, setBoostTags] = useState<string[]>([])
  const [cartIds, setCartIds] = useState<Set<string>>(new Set())
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [cartEff, setCartEff] = useState<Record<string, number>>({})
  const [cartCount, setCartCount] = useState(0)
  const [cartTotal, setCartTotal] = useState(0)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutConflict, setCheckoutConflict] = useState<CartConflict[] | null>(null)
  const scrollRef = useRef<any>(null)

  // 读取本地查询历史（自适应加权，自动优化）
  const readHistory = (): string[] => {
    try {
      return (Taro.getStorageSync(HISTORY_KEY) || []) as string[]
    } catch {
      return []
    }
  }
  const pushHistory = (tags: string[]) => {
    if (!tags.length) return
    const next = [...tags, ...readHistory()].slice(0, 12)
    try {
      Taro.setStorageSync(HISTORY_KEY, next)
    } catch {
      /* ignore */
    }
    setBoostTags(Array.from(new Set(next)))
  }

  // 对话记忆：存/取上次咨询历史（同门店持续、换门店清空）
  const restoreTurns = (storeId?: string): Turn[] => {
    try {
      const raw = Taro.getStorageSync(TURNS_KEY)
      if (!raw?.length || !Array.isArray(raw)) return []
      // 门店变了就清掉旧记录（不同店的商品池不一样）
      if (storeId && raw[0]?.storeId && raw[0]?.storeId !== storeId) return []
      return raw as Turn[]
    } catch {
      return []
    }
  }
  const saveTurns = (t: Turn[]) => {
    const trimmed = t.slice(-TURNS_MAX)
    // 精简存储：去掉六维明细等冗余字段，缩小体积
    const slimmed = trimmed.map(({ q, result }) => ({
      q,
      storeId: currentStore?.id || '',
      result: {
        summary: result.summary,
        recommendations: result.recommendations.map((r) => ({
          product: { id: r.product.id, name: r.product.name, price: r.product.price, main_image: r.product.main_image, image_url: r.product.image_url, store_id: r.product.store_id, store_name: r.product.store_name },
          nature: r.nature,
          healthTags: r.healthTags,
          reasons: r.reasons,
        })),
        nlu: result.nlu ? { food_type: result.nlu.food_type } : null,
      },
    }))
    try { Taro.setStorageSync(TURNS_KEY, slimmed) } catch { /* ignore */ }
  }

  // 基础数据：商品池 + 已购 → 用户六维画像（无问询，快）
  const loadBase = async () => {
    setLoading(true)
    try {
      const [poolRes, ordersRes] = await Promise.all([
        getProducts({ storeId: currentStore?.id, limit: 40, platformFilter: 'only' }).catch(() => [] as Product[]),
        user?.id ? getOrders().catch(() => [] as any[]) : Promise.resolve([] as any[]),
      ])
      setPool(poolRes)
      // 购物车：用户登录后拉取商品/合计，供底部结算条与页内结算面板使用
      if (user?.id) {
        const { items, effMap, total } = await fetchCartWithEff()
        const cids = new Set(items.map((c) => c.product_id).filter(Boolean))
        setCartIds(cids)
        setCartItems(items)
        setCartEff(effMap)
        setCartCount(items.length)
        setCartTotal(total)
      }
      const ids: string[] = []
      for (const o of ordersRes || []) {
        for (const it of (o as any).order_items || []) if (it?.product_id) ids.push(it.product_id)
      }
      const boughtRes = ids.length ? await getProductsByIds(ids).catch(() => [] as Product[]) : []
      setBought(boughtRes)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBase()
    // 恢复上次对话历史（门店不一致时 restoreTurns 自动清空）
    const prev = restoreTurns(currentStore?.id)
    if (prev.length) setTurns(prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.id, user?.id])

  useDidShow(() => {
    // 跨页（如去测体质）回来后刷新画像
    if (user?.id) loadBase()
  })

  const submit = async (q: string) => {
    const text = (q || query).trim()
    if (!text || loading) return
    setQuery('')
    setLoading(true)
    try {
      // 构建上一轮上下文摘要：让 Qwen 知道"刚才在聊什么"，延续对话语境
      const last = turns[turns.length - 1]
      const prevCtx = last
        ? `上一轮：用户问「${last.q}」→ 推荐方向：${last.result.recommendations.slice(0, 3).map((r) => r.healthTags?.join('/') || r.nature).filter(Boolean).join('、') || '无'}`
        : ''
      const res = await recommendForConsult({
        products: pool,
        boughtProducts: bought,
        profile,
        queryText: text,
        boostTags,
        previousContext: prevCtx || undefined,
        cartIds: [...cartIds],
      })
      if (res.nlu?.health_tags?.length) pushHistory(res.nlu.health_tags)
      const next = [...turns, { q: text, result: res }]
      setTurns(next)
      saveTurns(next)
      setTimeout(() => scrollRef.current?.scrollTo?.({ top: 99999, behavior: 'smooth' } as any), 120)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = (p: Product) => {
    // addToCart 内部已处理登录校验、错误 toast、bumpCartCount，这里只补成功提示
    addToCart(p.id, p.store_id, 1, null)
      .then((ok) => {
        if (ok) Taro.showToast({ title: '已加入购物车', icon: 'success' })
      })
      .catch((e) => {
        console.warn('[consult] 加购失败', p.id, p.store_id, e)
        Taro.showToast({ title: '加入失败，请重试', icon: 'none' })
      })
  }

  // 立即购买：直创建订单 → 跳到支付页，绕过购物车（咨询场景核心转化闭环）
  const handleBuyNow = async (p: Product) => {
    if (!user?.id) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    Taro.showLoading({ title: '正在创建订单…' })
    try {
      const order = await createOrder(
        [
          {
            product_id: p.id,
            store_id: p.store_id || '',
            store_name: p.store_name || (currentStore?.name ?? ''),
            product_name: p.name,
            product_image: p.main_image || p.image_url || null,
            price: p.price ?? 0,
            quantity: 1,
          },
        ],
        p.price ?? 0,
        'wxpay',
      )
      Taro.hideLoading()
      if (order?.id) {
        Taro.navigateTo({ url: `/pages/payment/index?orderId=${order.id}` })
      } else {
        Taro.showToast({ title: '创建订单失败，请重试', icon: 'none' })
      }
    } catch (e) {
      Taro.hideLoading()
      console.warn('[consult] 立即购买失败', p.id, p.store_id, e)
      Taro.showToast({ title: '创建订单失败，请重试', icon: 'none' })
    }
  }

  // 打开页内结算面板：先刷新最新购物车（含临期特惠价），确保面板数据与实付一致
  const openCheckout = async () => {
    if (!user?.id) { Taro.showToast({ title: '请先登录', icon: 'none' }); return }
    Taro.showLoading({ title: '加载中…' })
    try {
      const { items, effMap, total } = await fetchCartWithEff()
      setCartItems(items)
      setCartEff(effMap)
      setCartCount(items.length)
      setCartTotal(total)
      if (items.length === 0) { Taro.showToast({ title: '购物车为空', icon: 'none' }); return }
      setShowCheckout(true)
    } catch (e) {
      console.warn('[consult] 拉取购物车失败', e)
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }

  // 结算面板「去支付」：食疗冲突校验 → 写入待结算缓存 → 跳支付页（与购物车页结算一致）
  const confirmPay = () => {
    const valid = cartItems.filter((i) => i.products) as CartItem[]
    if (valid.length === 0) { Taro.showToast({ title: '购物车为空', icon: 'none' }); return }
    const conflicts = checkCartConflicts(valid.map((i) => toFoodTherapyInput(i.products as Product)))
    if (conflicts.length > 0) { setShowCheckout(false); setCheckoutConflict(conflicts); return }
    proceedToPayment()
  }

  const proceedToPayment = () => {
    const ids = cartItems.map((i) => i.id)
    setPendingCheckout({ cartIds: ids, total: cartTotal })
    setShowCheckout(false)
    Taro.navigateTo({ url: `/pages/payment/index?cartIds=${encodeURIComponent(ids.join(','))}&total=${cartTotal.toFixed(2)}` })
  }

  return (
    <View className="consult-page">
      {/* 顶部渐变标题 */}
      <View className="consult-hero">
        <View className="consult-hero-top">
          <View className="consult-hero-left">
            <Text className="consult-hero-emoji">🥣</Text>
            <Text className="consult-hero-title">食疗咨询</Text>
          </View>
          <Button openType="contact" className="consult-kefu wx-contact-btn" hoverClass="none">
            <Text className="consult-kefu-text">🎧 客服</Text>
          </Button>
        </View>
        <Text className="consult-hero-sub">告诉我你想调养什么，我帮你挑</Text>
      </View>

      <ScrollView
        scrollY
        className="consult-scroll"
        ref={scrollRef}
        scrollWithAnimation>
        {/* 快捷问法 */}
        <View className="consult-chips">
          {QUICK_PROMPTS.map((p) => (
            <View key={p} className="consult-chip" hoverClass="none" onClick={() => submit(p)}>
              <Text className="consult-chip-text">{p}</Text>
            </View>
          ))}
        </View>

        {/* 清空对话记录 */}
        {turns.length > 0 && (
          <View className="consult-clear" onClick={() => { setTurns([]); try { Taro.removeStorageSync(TURNS_KEY) } catch { /* */ } }}>
            <Text className="consult-clear-text">清空对话</Text>
          </View>
        )}

        {/* 空态：基于体质给出开机推荐（本地打分，不调 Qwen，毫秒出） */}
        {turns.length === 0 && (
          <View className="consult-empty">
            {profile?.constitution_tags?.length ? (
              (() => {
                // 体质 → 规避性味/推荐性味 → pool 内打分取 Top 3
                const con = resolveConstitution(profile)
                const avoidSet = new Set(con?.avoidNature || [])
                const recSet = new Set(con?.recommendNature || [])
                const scored = pool
                  .filter((p) => !avoidSet.has(p.overall_nature || '平性'))
                  .map((p) => {
                    let score = 50
                    if (recSet.has(p.overall_nature || '平性')) score += 30
                    const tags = (p.health_tag || []).filter(Boolean)
                    if (tags.length) score += 10
                    return { product: p, score }
                  })
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                if (!scored.length) return null
                const top = scored.map(({ product, score }) => ({
                  product,
                  sixDim: [] as any[],
                  constitutionFit: 1,
                  queryFit: 0,
                  total: score,
                  tier: 'recommend' as const,
                  reasons: [`适合${con?.name || '你'}的体质`],
                  nature: product.overall_nature || '平性',
                  healthTags: (product.health_tag || []).filter(Boolean),
                }))
                return (
                  <View>
                    <Text className="consult-greet-title">基于你的{con?.name || ''}体质，试试这些～</Text>
                    {top.map((rec) => (
                      <RecCard key={rec.product.id} rec={rec} inCart={cartIds.has(rec.product.id)} onAdd={() => handleAdd(rec.product)} onBuyNow={() => handleBuyNow(rec.product)} />
                    ))}
                    <Text className="consult-empty-text" style={{ marginTop: 10 }}>
                      也可以直接说说你的状态，我帮你挑更合适的～
                    </Text>
                  </View>
                )
              })()
            ) : (
              <Text className="consult-empty-text">
                例如：「我嗓子干痒怕冷，适合吃什么？」{'\n'}说说你的状态，我帮你挑几款合适的～
              </Text>
            )}
          </View>
        )}

        {turns.map((t, i) => (
          <View key={i} className="consult-turn">
            <View className="consult-bubble-user">
              <Text className="consult-bubble-user-text">{t.q}</Text>
            </View>
            <View className="consult-bubble-bot">
              <Text className="consult-bubble-bot-text">{t.result.summary}</Text>
            </View>
            {t.result.recommendations.map((rec) => (
              <RecCard key={rec.product.id} rec={rec} inCart={cartIds.has(rec.product.id)} onAdd={() => handleAdd(rec.product)} onBuyNow={() => handleBuyNow(rec.product)} />
            ))}
            {/* 追问引导：仅最后一轮 */}
            {i === turns.length - 1 && (() => {
              const ft = t.result.nlu?.food_type
              const ADJACENT: Record<string, string[]> = {
                水果: ['那煲什么汤？', '有合适的水果茶吗？', '还有什么蔬菜推荐？'],
                汤羹: ['配什么主食好？', '有合适的茶吗？', '还想看坚果类？'],
                茶: ['有什么汤也合适？', '搭配什么零食好？', '坚果类推荐一下？'],
                坚果: ['煲什么汤搭配好？', '还想看蔬菜？', '有合适的茶吗？'],
                蔬菜: ['配什么主食好？', '煲什么汤搭配？', '水果类也推荐下？'],
                主食: ['喝什么汤搭配？', '有什么蔬菜推荐？', '想看看坚果？'],
                零食: ['想看看茶饮？', '主食有什么推荐？', '还有什么汤？'],
                饮: ['有什么零食搭配？', '还想看看水果？', '坚果类也有吗？'],
              }
              const prompts = ft ? (ADJACENT[ft] || ['还想再看看？', '换种类型试试？']) : ['还有什么想调养的？', '换个食类看看？']
              return (
                <View className="consult-chips consult-chips--follow" style={{ marginTop: 6 }}>
                  {prompts.map((p) => (
                    <View key={p} className="consult-chip" hoverClass="none" onClick={() => submit(p)}>
                      <Text className="consult-chip-text">{p}</Text>
                    </View>
                  ))}
                </View>
              )
            })()}
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* 购物车状态条（有商品时显示，点击展开页内结算面板） */}
      {cartCount > 0 && (
        <View className="consult-cart-bar" onClick={openCheckout}>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>🛒</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155' }}>购物车 {cartCount} 件 · ¥{cartTotal.toFixed(2)}</Text>
          </View>
          <View style={{ background: '#16a34a', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>去结算</Text>
          </View>
        </View>
      )}

      {/* 页内结算面板（把结算页嵌入咨询页，不跳出） */}
      {showCheckout && (
        <View className="checkout-mask" onClick={() => setShowCheckout(false)}>
          <View className="checkout-sheet" onClick={(e: any) => e.stopPropagation()}>
            <View className="checkout-sheet-head">
              <Text className="checkout-sheet-title">确认订单</Text>
              <View className="checkout-sheet-close" hoverClass="none" onClick={() => setShowCheckout(false)}>
                <Text className="checkout-sheet-close-text">✕</Text>
              </View>
            </View>
            <ScrollView scrollY className="checkout-sheet-body">
              {cartItems.map((i) => (
                <View key={i.id} className="checkout-item">
                  <Image src={i.products?.main_image || i.products?.image_url || ''} mode="aspectFill" className="checkout-item-img" />
                  <View className="checkout-item-info">
                    <Text className="checkout-item-name" numberOfLines={1}>{i.products?.name}</Text>
                    <Text className="checkout-item-meta">¥{computePrice(i, cartEff).toFixed(2)} × {i.quantity}</Text>
                  </View>
                  <Text className="checkout-item-sub">¥{(computePrice(i, cartEff) * i.quantity).toFixed(2)}</Text>
                </View>
              ))}
            </ScrollView>
            <View className="checkout-sheet-foot">
              <View className="checkout-total">
                <Text className="checkout-total-label">合计</Text>
                <Text className="checkout-total-val">¥{cartTotal.toFixed(2)}</Text>
              </View>
              <View className="checkout-pay-btn" hoverClass="none" onClick={confirmPay}>
                <Text className="checkout-pay-text">去支付</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 食疗冲突校验弹窗（结算前拦截，与购物车页一致） */}
      {checkoutConflict && (
        <View className="conflict-mask">
          <View className="conflict-modal">
            <Text className="conflict-title">🍲 搭配小贴士</Text>
            <Text className="conflict-sub">结算前为你做了食疗冲突检测</Text>
            <ScrollView scrollY className="conflict-list">
              {checkoutConflict.map((c, idx) => (
                <View key={idx} className="conflict-card" style={{ background: c.level === 'danger' ? '#FEE2E2' : '#FEF3C7' }}>
                  <View className="conflict-card-head">
                    <Text className="conflict-card-icon">{c.level === 'danger' ? '⚠️' : '🟡'}</Text>
                    <Text className="conflict-card-type" style={{ color: c.level === 'danger' ? '#B91C1C' : '#9A8070' }}>
                      {c.type === 'warm_overlap' ? '温补叠加' : c.type === 'cold_hot_clash' ? '寒热对冲' : c.type === 'same_attr_overload' ? '同属性过量' : '相克慎搭'}
                    </Text>
                  </View>
                  <Text className="conflict-card-msg">{c.message}</Text>
                </View>
              ))}
            </ScrollView>
            <View className="conflict-actions">
              <View className="conflict-btn conflict-btn--adjust" hoverClass="none" onClick={() => { setCheckoutConflict(null); setShowCheckout(true) }}>
                <Text className="conflict-btn-text">去调整</Text>
              </View>
              <View className="conflict-btn conflict-btn--pay" hoverClass="none" onClick={() => { setCheckoutConflict(null); proceedToPayment() }}>
                <Text className="conflict-btn-text">仍要结算</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 底部输入区 */}
      <View className="consult-input-bar">
        <Textarea
          className="consult-input"
          value={query}
          onInput={(e: any) => setQuery(e.detail.value)}
          placeholder="说说你想调养的状态，如：嗓子干痒怕冷"
          placeholderClass="consult-input-ph"
          maxlength={200}
          showConfirmBar={false}
          adjustPosition
        />
        <View className={`consult-send ${loading ? 'is-loading' : ''}`} hoverClass="none" onClick={() => submit(query)}>
          {loading ? <Text className="consult-send-loading">…</Text> : <Text className="consult-send-text">问问</Text>}
        </View>
      </View>
    </View>
  )
}

function RecCard({ rec, onAdd, onBuyNow, inCart }: { rec: ConsultRecommendation; onAdd: () => void; onBuyNow: () => void; inCart?: boolean }) {
  const p = rec.product
  const price = (p.price ?? 0).toFixed(2)
  return (
    <View className="consult-rec-card">
      <Image src={p.main_image || p.image_url || ''} className="rec-img" mode="aspectFill" />
      <View className="rec-body">
        <View className="rec-title-row">
          <Text className="rec-name" numberOfLines={1}>
            {p.name}
          </Text>
        </View>

        <View className="rec-meta">
          <Text className="rec-price">¥{price}</Text>
          <Text className="rec-nature">{rec.nature}</Text>
          {rec.healthTags.slice(0, 3).map((t) => (
            <Text key={t} className="rec-tag">
              {t}
            </Text>
          ))}
        </View>

        <View className="rec-reasons">
          {rec.reasons.map((r, idx) => (
            <Text key={idx} className="rec-reason">
              · {r}
            </Text>
          ))}
        </View>

        <View className="rec-actions">
          <View className="rec-btn-buy" hoverClass="none" onClick={onBuyNow}>
            <Text className="rec-btn-buy-text">{inCart ? '去结算' : '立即购买'}</Text>
          </View>
          <View className="rec-actions-row">
            <View className="rec-btn-cart" hoverClass="none" onClick={inCart ? () => Taro.switchTab({ url: '/pages/cart/index' }) : onAdd}>
              <Text className="rec-btn-cart-text">{inCart ? '购物车' : '加购'}</Text>
            </View>
            <View
              className="rec-btn-detail"
              hoverClass="none"
              onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}>
              <Text className="rec-btn-detail-text">查看</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
