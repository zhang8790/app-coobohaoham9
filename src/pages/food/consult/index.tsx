// 食疗咨询页 · 「我适合吃什么」自动推荐
// ------------------------------------------------------------
// 入口：首页悬浮「食疗咨询」+ 我的菜单「食疗咨询」
// 能力：用户自由问话 → NLU 解析诉求 → 融合「体质 + 已购六维画像 + 节气」
//       自动排序推荐，呈现六维契合明细与理由。零外部依赖（NLU 规则兜底）。

import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView, Image, Textarea } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { getProducts, getOrders, getProductsByIds, addToCart } from '@/db/api'
import { recommendForConsult, type ConsultResult, type ConsultRecommendation } from '@/utils/food-therapy/consult-recommend'
import RadarChart from '@/components/food/RadarChart'
import { bumpCartCount } from '@/utils/cartStore'
import type { Product } from '@/db/types'
import './index.scss'

const HISTORY_KEY = 'consult_history_v1'

const QUICK_PROMPTS = [
  '最近嗓子干痒还怕冷',
  '容易上火想清火',
  '换季想润一润',
  '体寒怕冷怎么吃',
  '想消暑解腻',
  '脾胃调理吃什么',
]

const TIER_COLOR: Record<string, string> = {
  recommend: 'linear-gradient(135deg,#16A34A,#22C55E)',
  caution: 'linear-gradient(135deg,#D97706,#F59E0B)',
  avoid: 'linear-gradient(135deg,#B91C1C,#EF4444)',
}
const TIER_LABEL: Record<string, string> = { recommend: '很适合', caution: '可尝试', avoid: '少点' }

interface Turn {
  q: string
  result: ConsultResult
}

export default function ConsultPage() {
  const { user, profile } = useAuth()
  const { currentStore } = useLocation()

  const [pool, setPool] = useState<Product[]>([])
  const [bought, setBought] = useState<Product[]>([])
  const [base, setBase] = useState<ConsultResult | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [boostTags, setBoostTags] = useState<string[]>([])
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

  // 基础数据：商品池 + 已购 → 用户六维画像（无问询，快）
  const loadBase = async () => {
    setLoading(true)
    try {
      const [poolRes, ordersRes] = await Promise.all([
        getProducts({ storeId: currentStore?.id, limit: 40, platformFilter: 'only' }).catch(() => [] as Product[]),
        user?.id ? getOrders().catch(() => [] as any[]) : Promise.resolve([] as any[]),
      ])
      setPool(poolRes)
      const ids: string[] = []
      for (const o of ordersRes || []) {
        for (const it of (o as any).order_items || []) if (it?.product_id) ids.push(it.product_id)
      }
      const boughtRes = ids.length ? await getProductsByIds(ids).catch(() => [] as Product[]) : []
      setBought(boughtRes)
      const baseRes = await recommendForConsult({
        products: poolRes,
        boughtProducts: boughtRes,
        profile,
        queryText: '',
        boostTags,
      })
      setBase(baseRes)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBase()
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
      const res = await recommendForConsult({
        products: pool,
        boughtProducts: bought,
        profile,
        queryText: text,
        boostTags,
      })
      if (res.nlu?.health_tags?.length) pushHistory(res.nlu.health_tags)
      setTurns((prev) => [...prev, { q: text, result: res }])
      setTimeout(() => scrollRef.current?.scrollTo?.({ top: 99999, behavior: 'smooth' } as any), 120)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = (p: Product) => {
    addToCart(p.id, p.store_id, 1, null)
      .then((ok) => {
        if (ok) {
          bumpCartCount(1)
          Taro.showToast({ title: '已加入购物车', icon: 'success' })
        } else {
          Taro.showToast({ title: '加入失败，请重试', icon: 'none' })
        }
      })
      .catch(() => Taro.showToast({ title: '加入失败，请重试', icon: 'none' }))
  }

  return (
    <View className="consult-page">
      {/* 顶部渐变标题 */}
      <View className="consult-hero">
        <Text className="consult-hero-emoji">🥣</Text>
        <Text className="consult-hero-title">食疗咨询</Text>
        <Text className="consult-hero-sub">告诉我你想调养什么，我帮你挑</Text>
      </View>

      <ScrollView
        scrollY
        className="consult-scroll"
        ref={scrollRef}
        scrollWithAnimation>
        {/* 用户画像卡：体质 + 六维雷达 */}
        <View className="consult-profile-card">
          <View className="consult-profile-head">
            {base?.constitution ? (
              <View className="consult-constitution" style={{ background: base.constitution.colorLight }}>
                <Text className="consult-constitution-emoji">{base.constitution.emoji}</Text>
                <View>
                  <Text className="consult-constitution-name">{base.constitution.name}</Text>
                  <Text className="consult-constitution-desc">{base.constitution.description}</Text>
                </View>
              </View>
            ) : (
              <View
                className="consult-constitution consult-constitution-empty"
                onClick={() => Taro.navigateTo({ url: '/pages/food/constitution-test/index' })}>
                <Text className="consult-constitution-emoji">🧪</Text>
                <View>
                  <Text className="consult-constitution-name">还没测体质</Text>
                  <Text className="consult-constitution-desc">测一测，推荐更精准 →</Text>
                </View>
              </View>
            )}
          </View>

          {base && (
            <View className="consult-radar-wrap">
              <RadarChart dims={base.radar.dims} size={240} />
              <Text className="consult-radar-summary">{base.radar.summary}</Text>
            </View>
          )}
        </View>

        {/* 快捷问法 */}
        <View className="consult-chips">
          {QUICK_PROMPTS.map((p) => (
            <View key={p} className="consult-chip" hoverClass="none" onClick={() => submit(p)}>
              <Text className="consult-chip-text">{p}</Text>
            </View>
          ))}
        </View>

        {/* 对话流 */}
        {turns.length === 0 && (
          <View className="consult-empty">
            <Text className="consult-empty-text">
              例如：「我嗓子干痒怕冷，适合吃什么？」{'\n'}我会结合你的体质与购买喜好，挑出最合拍的几款。
            </Text>
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
              <RecCard key={rec.product.id} rec={rec} onAdd={() => handleAdd(rec.product)} />
            ))}
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>

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

function RecCard({ rec, onAdd }: { rec: ConsultRecommendation; onAdd: () => void }) {
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
          <View className="rec-score" style={{ background: TIER_COLOR[rec.tier] }}>
            <Text className="rec-score-num">{rec.total}</Text>
            <Text className="rec-score-label">{TIER_LABEL[rec.tier]}</Text>
          </View>
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

        {/* 六维契合明细 */}
        <View className="rec-sixdim">
          {rec.sixDim.map((d) => (
            <View className="sixdim-row" key={d.key}>
              <Text className="sixdim-label">{d.label}</Text>
              <View className="sixdim-track">
                <View className="sixdim-fill" style={{ width: `${Math.round(d.value * 100)}%` }} />
              </View>
            </View>
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
          <View className="rec-btn-cart" hoverClass="none" onClick={onAdd}>
            <Text className="rec-btn-cart-text">加入购物车</Text>
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
  )
}
