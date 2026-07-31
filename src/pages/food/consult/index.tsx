// 食疗咨询页 · 「我适合吃什么」自动推荐（纯净咨询窗口）
// ------------------------------------------------------------
// 入口：首页悬浮「食疗咨询」+ 我的菜单「食疗咨询」
// 能力：用户自由问话 → NLU 解析诉求 → 后台融合「体质 + 已购六维画像 + 节气」
//       自动排序推荐。界面只呈现咨询对话与推荐结果，不展示体质/六维/已购等分析面板。
//       零外部依赖（NLU 规则兜底）。

import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView, Image, Textarea } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { getProducts, getOrders, getProductsByIds, addToCart } from '@/db/api'
import { recommendForConsult, type ConsultResult, type ConsultRecommendation } from '@/utils/food-therapy/consult-recommend'
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

export default function ConsultPage() {
  const { user, profile } = useAuth()
  const { currentStore } = useLocation()

  const [pool, setPool] = useState<Product[]>([])
  const [bought, setBought] = useState<Product[]>([])
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
              例如：「我嗓子干痒怕冷，适合吃什么？」{'\n'}说说你的状态，我帮你挑几款合适的～
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
