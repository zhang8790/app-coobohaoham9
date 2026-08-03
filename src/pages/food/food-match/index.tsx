import { useState } from 'react'
import { useLoad } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import {
  getFoodTagRules,
  callFoodMatch,
  type FoodTagRule,
} from '@/db/food-safety'
import { getProducts, type Product } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { supabase } from '@/client/supabase'

// 适配分档位 → 主题
const TIER_META: Record<string, { label: string; fg: string; bg: string; border: string }> = {
  recommend: { label: '推荐', fg: '#16a34a', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.35)' },
  caution:   { label: '可酌量', fg: '#ca8a04', bg: 'rgba(234,179,8,0.10)', border: 'rgba(234,179,8,0.35)' },
  avoid:     { label: '不推荐', fg: '#dc2626', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.35)' },
}

export default function FoodMatch() {
  const { user } = useAuth()
  const { currentStore } = useLocation()
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<FoodTagRule[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<Array<{
    product_id: string; score: number; tier: string; reasons: string[]; safe_level?: string; safe_level_code?: string
  }>>([])
  const [productMap, setProductMap] = useState<Record<string, Product>>({})
  const [generating, setGenerating] = useState(false)
  const [saved, setSaved] = useState(false)

  useLoad(async () => {
    const r = await getFoodTagRules()
    setRules(r)
    // 读取已保存的标签
    if (user?.id) {
      const { data } = await supabase
        .from('user_health_profile').select('pref_tags').eq('user_id', user.id).maybeSingle()
      if (data?.pref_tags?.length) setSelected(data.pref_tags as string[])
    }
    setLoading(false)
  })

  const toggle = (key: string) => {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))
    setSaved(false)
  }

  const saveTags = async () => {
    if (!user?.id) { Taro.showToast({ title: '请先登录', icon: 'none' }); return }
    const { error } = await supabase.from('user_health_profile').upsert({
      user_id: user.id, pref_tags: selected,
    })
    if (error) Taro.showToast({ title: '保存失败', icon: 'none' })
    else { setSaved(true); Taro.showToast({ title: '已保存我的标签', icon: 'success' }) }
  }

  const generate = async () => {
    if (!selected.length) { Taro.showToast({ title: '请至少勾选一个标签', icon: 'none' }); return }
    setGenerating(true)
    try {
      const storeId = currentStore?.id
      // 取候选商品集合
      const products = await getProducts({ storeId: storeId || undefined, limit: 200, platformFilter: 'only' })
      const map: Record<string, Product> = {}
      for (const p of products) map[p.id] = p
      setProductMap(map)
      const productIds = products.map((p) => p.id)
      if (!productIds.length) { setResult([]); return }
      const res = await callFoodMatch({ user_tags: selected, product_ids: productIds, user_id: user?.id, limit: 50 })
      if (res.success) setResult(res.items || [])
      else Taro.showToast({ title: res.error || '推荐失败', icon: 'none' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '推荐失败', icon: 'none' })
    } finally {
      setGenerating(false)
    }
  }

  // 按分组展示标签
  const groups = rules.reduce<Record<string, FoodTagRule[]>>((acc, r) => {
    const g = r.group_name || '其他'
    ;(acc[g] = acc[g] || []).push(r)
    return acc
  }, {})

  if (loading) {
    return <View style={pageStyle}><View style={card}><Text style={{ color: '#94a3b8' }}>加载中…</Text></View></View>
  }

  return (
    <ScrollView style={pageStyle} scrollY>
      <View style={{ ...card, background: 'linear-gradient(135deg,#ecfdf5,#f0f9ff)' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>🍎 个性化食疗推荐专区</Text>
        <Text style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: '20px' }}>
          勾选您的状态标签，系统基于私有配料安全库 + 人群匹配算法，自动计算每款零食的适配分（0–100）并排序推荐。仅作饮食选购参考，不含诊断。
        </Text>
      </View>

      {/* 标签自检库 */}
      <View style={card}>
        <Text style={sectionTitle}>① 选择您的状态标签（可多选）</Text>
        {Object.entries(groups).map(([g, list]) => (
          <View key={g} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600' }}>{g}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
              {list.map((r) => {
                const on = selected.includes(r.tag_key)
                return (
                  <View key={r.tag_key} onClick={() => toggle(r.tag_key)} style={{
                    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8,
                    background: on ? '#16a34a' : '#f1f5f9', borderWidth: 1, borderColor: on ? '#16a34a' : 'rgba(0,0,0,0.06)',
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? '#fff' : '#334155' }}>{r.label}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={btnPrimary} onClick={generate}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{generating ? '计算中…' : '生成推荐'}</Text>
          </View>
          <View style={btnGhost} onClick={saveTags}>
            <Text style={{ color: '#16a34a', fontSize: 14, fontWeight: '700' }}>{saved ? '✓ 已保存' : '保存我的标签'}</Text>
          </View>
        </View>
      </View>

      {/* 推荐结果 */}
      {result.length > 0 && (
        <View style={card}>
          <Text style={sectionTitle}>② 为您适配的零食（按适配分排序）</Text>
          {result.map((it, i) => {
            const p = productMap[it.product_id]
            const m = TIER_META[it.tier] || TIER_META.caution
            return (
              <View key={it.product_id} style={{ ...itemCard, borderLeftColor: m.fg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  {p?.image_url || p?.main_image ? (
                    <Image src={p.image_url || p.main_image} style={{ width: 64, height: 64, borderRadius: 10, flexShrink: 0 }} mode="aspectFill" />
                  ) : null}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b', lineHeight: '20px' }} numberOfLines={2}>
                      {i + 1}. {p?.name || '商品'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <View style={{ background: m.bg, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, marginRight: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: m.fg }}>{m.label} {it.score}分</Text>
                      </View>
                      {it.safe_level ? <Text style={{ fontSize: 11, color: '#64748b' }}>{it.safe_level}</Text> : null}
                    </View>
                    {it.reasons?.slice(0, 2).map((rs, k) => (
                      <Text key={k} style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>· {rs}</Text>
                    ))}
                  </View>
                </View>
                {p?.id ? (
                  <View style={btnMini} onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}>
                    <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '700' }}>详情</Text>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      )}

      <View style={{ height: 24 }} />
      <Text style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingBottom: 20 }}>
        以上内容基于食品国标配料信息整理，仅作饮食选购参考，不构成医疗诊断或专业建议
      </Text>
    </ScrollView>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', background: 'linear-gradient(180deg,#f0fdf4 0%,#f8fafc 40%)', padding: '16px', boxSizing: 'border-box',
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
}
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 6 }
const btnPrimary: React.CSSProperties = { background: '#16a34a', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 }
const btnGhost: React.CSSProperties = { background: '#fff', borderWidth: 1, borderColor: '#16a34a', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 }
const btnMini: React.CSSProperties = { background: 'rgba(22,163,74,0.08)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, flexShrink: 0 }
const itemCard: React.CSSProperties = {
  flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', marginTop: 6,
  borderLeftWidth: 3, borderLeftColor: '#16a34a', paddingLeft: 10,
}
