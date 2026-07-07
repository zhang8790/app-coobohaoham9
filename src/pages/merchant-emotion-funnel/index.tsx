// @title 商家情绪漏斗看板（情绪导购转化分析）
// 聚合 emotion_funnel_events，展示五屏情绪详情页的转化表现：
// 进入 → 滑到最后一屏(信任闭环) → 点击「立即拥有」。
// 同时按商品维度排名，帮商家判断哪些商品的「情绪表达」真正带动了购买意向。
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import { getMerchantStore } from '@/db/api'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import './index.scss'

type RawEvent = {
  product_id: string
  event_type: string
  screen_index: number | null
}

export default function MerchantEmotionFunnelPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [events, setEvents] = useState<RawEvent[]>([])
  const [productNames, setProductNames] = useState<Record<string, string>>({})
  const [loadingData, setLoadingData] = useState(false)

  // 进页：取门店
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await getMerchantStore()
        if (!cancelled) setStore(s)
      } catch (e) {
        console.error('[情绪漏斗] 取门店失败', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // store / 时间范围变化：拉取埋点聚合
  useEffect(() => {
    if (!store) return
    let cancelled = false
    setLoadingData(true)
    ;(async () => {
      const since = new Date(Date.now() - days * 864e5).toISOString()
      const { data, error } = await supabase
        .from('emotion_funnel_events')
        .select('product_id, event_type, screen_index')
        .eq('store_id', store.id)
        .gte('created_at', since)
      if (cancelled) return
      if (error) {
        console.error('[情绪漏斗] 查询失败', error)
        setEvents([])
        setLoadingData(false)
        return
      }
      const rows = (data || []) as RawEvent[]
      setEvents(rows)

      // 商品名映射
      const ids = [...new Set(rows.map(r => r.product_id))]
      if (ids.length) {
        const { data: prods } = await supabase.from('products').select('id, name').in('id', ids)
        if (!cancelled && prods) {
          const m: Record<string, string> = {}
          prods.forEach((p: any) => { m[p.id] = p.name })
          setProductNames(m)
        }
      }
      setLoadingData(false)
    })()
    return () => { cancelled = true }
  }, [store, days])

  // 全局漏斗（三段）
  const funnel = useMemo(() => {
    const enter = events.filter(e => e.event_type === 'enter').length
    const screen5 = events.filter(e => e.event_type === 'screen_view' && e.screen_index === 4).length
    const cta = events.filter(e => e.event_type === 'cta_click').length
    return { enter, screen5, cta }
  }, [events])

  // 商品维度榜（按购买意向 cta 排序）
  const productRank = useMemo(() => {
    const map: Record<string, { enter: number; screen5: number; cta: number }> = {}
    for (const e of events) {
      const id = e.product_id
      if (!map[id]) map[id] = { enter: 0, screen5: 0, cta: 0 }
      if (e.event_type === 'enter') map[id].enter++
      else if (e.event_type === 'screen_view' && e.screen_index === 4) map[id].screen5++
      else if (e.event_type === 'cta_click') map[id].cta++
    }
    return Object.entries(map)
      .map(([id, v]) => ({ id, name: productNames[id] || id.slice(0, 8), ...v }))
      .sort((a, b) => b.cta - a.cta)
  }, [events, productNames])

  const steps = [
    { key: 'enter', label: '进入情绪之旅', value: funnel.enter, color: '#C2410C' },
    { key: 'screen5', label: '滑到最后一屏（信任闭环）', value: funnel.screen5, color: '#EA580C' },
    { key: 'cta', label: '点击「立即拥有」', value: funnel.cta, color: '#F97316' },
  ]

  if (loading) {
    return (
      <View className="emo-funnel-loading">
        <View className="i-mdi-loading text-4xl text-primary animate-spin" />
      </View>
    )
  }

  return (
    <RouteGuard>
      <View className="min-h-screen bg-background pb-10">
        {/* 标题 */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-2xl font-bold text-foreground">情绪漏斗</Text>
          <Text className="text-sm text-muted-foreground block mt-1">五屏情绪导购的转化表现 · 衡量情绪表达是否真带动了购买</Text>
        </View>

        {/* 时间范围切换 */}
        <View className="flex gap-3 px-4 mt-2">
          {[7, 30].map(d => (
            <View key={d} className={`emo-funnel-range ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>
              <Text className={`emo-funnel-range-text ${days === d ? 'active' : ''}`}>近 {d} 天</Text>
            </View>
          ))}
        </View>

        {loadingData ? (
          <View className="flex items-center justify-center py-20">
            <View className="i-mdi-loading text-3xl text-primary animate-spin" />
          </View>
        ) : funnel.enter === 0 ? (
          <View className="emo-funnel-empty">
            <Text className="emo-funnel-empty-icon">📊</Text>
            <Text className="emo-funnel-empty-text">还没有情绪导购数据</Text>
            <Text className="emo-funnel-empty-sub">去商品详情页点「开启情绪之旅」，用户滑动五屏时这里就会累积转化数据</Text>
          </View>
        ) : (
          <View className="px-4 mt-4">
            {/* 漏斗三段 */}
            <View className="bg-card border border-border rounded-2xl p-4">
              <Text className="text-base font-bold text-foreground">转化漏斗</Text>
              {steps.map((s, i) => {
                const prev = i > 0 ? steps[i - 1].value : 0
                const stepRate = prev ? Math.round((s.value / prev) * 100) : 100
                const overall = funnel.enter ? Math.round((s.value / funnel.enter) * 100) : 0
                return (
                  <View className="emo-funnel-step" key={s.key}>
                    <View className="emo-funnel-step-head">
                      <Text className="emo-funnel-step-label">{s.label}</Text>
                      <Text className="emo-funnel-step-value" style={{ color: s.color }}>{s.value}</Text>
                    </View>
                    <View className="emo-funnel-bar-bg">
                      <View className="emo-funnel-bar" style={{ width: `${overall}%`, background: s.color }} />
                    </View>
                    <Text className="emo-funnel-step-rate">
                      {i === 0 ? '入口基数 100%' : `较上一步 ${stepRate}%`} · 占进入 {overall}%
                    </Text>
                  </View>
                )
              })}
              <View className="emo-funnel-overall">
                <Text className="emo-funnel-overall-text">整体点击率（进入 → 购买意向）{funnel.enter ? Math.round((funnel.cta / funnel.enter) * 100) : 0}%</Text>
              </View>
            </View>

            {/* 商品维度榜 */}
            <Text className="text-base font-bold text-foreground block mt-5 mb-2">商品情绪转化榜</Text>
            {productRank.map(item => {
              const er = item.enter ? Math.round((item.screen5 / item.enter) * 100) : 0
              const cr = item.enter ? Math.round((item.cta / item.enter) * 100) : 0
              return (
                <View className="emo-funnel-prod bg-card border border-border" key={item.id}>
                  <View className="emo-funnel-prod-top">
                    <Text className="emo-funnel-prod-name">{item.name}</Text>
                    <Text className="emo-funnel-prod-cta">购 {item.cta}</Text>
                  </View>
                  <View className="emo-funnel-prod-bars">
                    <View className="emo-funnel-mini">
                      <Text className="emo-funnel-mini-label">进入 {item.enter}</Text>
                      <View className="emo-funnel-mini-bg"><View className="emo-funnel-mini-bar" style={{ width: '100%', background: '#C2410C' }} /></View>
                    </View>
                    <View className="emo-funnel-mini">
                      <Text className="emo-funnel-mini-label">到尾屏 {item.screen5}</Text>
                      <View className="emo-funnel-mini-bg"><View className="emo-funnel-mini-bar" style={{ width: `${er}%`, background: '#EA580C' }} /></View>
                    </View>
                    <View className="emo-funnel-mini">
                      <Text className="emo-funnel-mini-label">购买 {item.cta}</Text>
                      <View className="emo-funnel-mini-bg"><View className="emo-funnel-mini-bar" style={{ width: `${cr}%`, background: '#F97316' }} /></View>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </RouteGuard>
  )
}
