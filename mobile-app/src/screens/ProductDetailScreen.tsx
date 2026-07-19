import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { useRoute } from '@react-navigation/native'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types/db'
import { useCartStore } from '@/state/cartStore'
import { theme, spacing } from '@/theme'

// 性味 → 颜色（凉寒偏青、平性中性、温热偏橙红）
function natureColor(nature?: string | null): string {
  if (!nature) return theme.subText
  if (nature.includes('寒') || nature.includes('凉')) return '#2E8B8B'
  if (nature.includes('热') || nature.includes('温')) return theme.primary
  return theme.warn
}

export const ProductDetailScreen: React.FC = () => {
  const route = useRoute<any>()
  const productId = route.params?.productId as string
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const add = useCartStore((s) => s.add)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, stores(id,name,is_platform)')
        .eq('id', productId)
        .single()
      if (active) {
        if (!error && data) setProduct(data as unknown as Product)
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [productId])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </View>
    )
  }

  if (!product) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.subText }}>商品不存在或已下架</Text>
      </View>
    )
  }

  const handleAdd = () => {
    add(product)
    Alert.alert('已加入购物车', product.name)
  }

  return (
    <ScrollView style={styles.container}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>食</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>¥{product.price.toFixed(2)}</Text>
        {product.stores ? (
          <Text style={styles.store}>{product.stores.name}{product.stores.is_platform ? '（自营）' : ''}</Text>
        ) : null}

        {/* 食疗导购信息 */}
        <View style={styles.block}>
          <Text style={styles.blockTitle}>食养参考</Text>
          <View style={styles.tags}>
            {product.overall_nature ? (
              <View style={[styles.natureBadge, { backgroundColor: natureColor(product.overall_nature) }]}>
                <Text style={styles.natureText}>{product.overall_nature}</Text>
              </View>
            ) : null}
            {(product.health_tag ?? []).map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
            {(product.emotion_tag ?? []).map((t) => (
              <View key={t} style={[styles.tag, styles.tagEmotion]}>
                <Text style={[styles.tagText, styles.tagEmotionText]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        {product.guide_sentence ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>导购建议</Text>
            <Text style={styles.text}>{product.guide_sentence}</Text>
          </View>
        ) : null}

        {product.aux_remind ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>辅料提醒</Text>
            <Text style={styles.text}>{product.aux_remind}</Text>
          </View>
        ) : null}

        {product.description ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>商品详情</Text>
            <Text style={styles.text}>{product.description}</Text>
          </View>
        ) : null}

        <Text style={styles.disclaimer}>
          以上为传统食养文化参考，不能替代专业医疗建议。
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>加入购物车</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  cover: { width: '100%', height: 240 },
  coverPlaceholder: { backgroundColor: theme.primaryLight, alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderText: { fontSize: 60, color: theme.primary },
  body: { padding: spacing.lg },
  name: { fontSize: 20, fontWeight: '800', color: theme.text },
  price: { fontSize: 22, fontWeight: '800', color: theme.primary, marginTop: spacing.xs },
  store: { fontSize: 13, color: theme.subText, marginTop: spacing.xs },
  block: { marginTop: spacing.lg },
  blockTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: spacing.sm },
  text: { fontSize: 14, color: theme.text, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  natureBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  natureText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tag: { backgroundColor: theme.primaryLight, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { color: theme.primary, fontSize: 13 },
  tagEmotion: { backgroundColor: '#FDEEF6' },
  tagEmotionText: { color: '#C2417A' },
  disclaimer: { fontSize: 12, color: theme.subText, marginTop: spacing.lg, lineHeight: 18 },
  footer: { padding: spacing.lg, backgroundColor: theme.card, borderTopWidth: 1, borderTopColor: theme.border },
  addButton: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
