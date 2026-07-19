import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '@/lib/supabase'
import {
  toFoodTherapyInput,
  classifyProducts,
  QUICK_BODY_PRESETS,
  type Crowd,
  type Scene,
  type FitTier,
} from '@/lib/food-therapy'
import type { Product } from '@/types/db'
import { ProductCard } from '@/components/ProductCard'
import { TierSection } from '@/components/TierSection'
import { useAuthStore } from '@/state/authStore'
import { theme, spacing } from '@/theme'

const TIER_ORDER: FitTier[] = ['recommend', 'caution', 'avoid']

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>()
  const profile = useAuthStore((s) => s.profile)

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCrowds, setSelectedCrowds] = useState<Crowd[]>([])
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, stores(id,name,is_platform)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(60)
      if (!active) return
      if (!error && data) setProducts(data as unknown as Product[])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const tiers = useMemo(() => {
    const inputs = products.map(toFoodTherapyInput)
    return classifyProducts(inputs, selectedCrowds, selectedScene)
  }, [products, selectedCrowds, selectedScene])

  const tierProducts = useMemo(() => {
    const out: Record<FitTier, Product[]> = { recommend: [], caution: [], avoid: [] }
    for (const tier of TIER_ORDER) {
      out[tier] = tiers[tier]
        .map((it) => productMap.get(it.id))
        .filter((p): p is Product => Boolean(p))
    }
    return out
  }, [tiers, productMap])

  const toggleCrowd = (crowds: Crowd[]) => {
    const set = new Set(selectedCrowds)
    const allSelected = crowds.every((c) => set.has(c))
    if (allSelected) crowds.forEach((c) => set.delete(c))
    else crowds.forEach((c) => set.add(c))
    setSelectedCrowds(Array.from(set))
  }

  const goDetail = (p: Product) => navigation.navigate('ProductDetail', { productId: p.id })

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
      <Text style={styles.greeting}>
        {profile ? `${profile.nickname || '你好'}，今天想吃点什么？` : '今天想吃点什么？'}
      </Text>

      <Text style={styles.sectionTitle}>身体状态 · 一键匹配</Text>
      <View style={styles.presets}>
        {QUICK_BODY_PRESETS.map((preset) => {
          const active = preset.crowds.every((c) => selectedCrowds.includes(c))
          return (
            <Pressable
              key={preset.label}
              style={[styles.preset, active && styles.presetActive]}
              onPress={() => toggleCrowd(preset.crowds)}
            >
              <Text style={styles.presetEmoji}>{preset.emoji}</Text>
              <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>{preset.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {selectedCrowds.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          {TIER_ORDER.map((tier) => (
            <TierSection key={tier} tier={tier} items={tierProducts[tier]} onSelect={goDetail} />
          ))}
          <Text style={styles.disclaimer}>
            以上为传统食养文化参考，个体差异较大，不能替代专业医疗建议。如身体不适应及时休息，症状持续或加重请及时就医。
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.sectionTitle}>大家都在点</Text>
          {loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.primary} />
          ) : (
            <FlatList
              data={products}
              numColumns={2}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ProductCard product={item} onPress={goDetail} />}
              columnWrapperStyle={styles.gridRow}
            />
          )}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  greeting: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: spacing.sm },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetActive: { backgroundColor: theme.primaryLight, borderColor: theme.primary },
  presetEmoji: { fontSize: 16, marginRight: 4 },
  presetLabel: { fontSize: 13, color: theme.text },
  presetLabelActive: { color: theme.primary, fontWeight: '700' },
  gridRow: { justifyContent: 'space-between' },
  disclaimer: {
    fontSize: 12,
    color: theme.subText,
    lineHeight: 18,
    marginTop: spacing.md,
    backgroundColor: theme.card,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
})
