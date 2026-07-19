import React, { useEffect, useState, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types/db'
import { ProductCard } from '@/components/ProductCard'
import { theme, spacing } from '@/theme'

export const ProductsScreen: React.FC = () => {
  const navigation = useNavigation<any>()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, stores(id,name,is_platform)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(200)
      if (active && !error && data) setProducts(data as unknown as Product[])
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return products
    return products.filter((p) => p.name.includes(q))
  }, [products, query])

  const goDetail = (p: Product) => navigation.navigate('ProductDetail', { productId: p.id })

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="搜索好物"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProductCard product={item} onPress={goDetail} />}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.row}
          ListEmptyComponent={<Text style={styles.empty}>没有找到相关好物</Text>}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  searchWrap: { padding: spacing.lg, paddingBottom: spacing.sm },
  search: {
    backgroundColor: theme.card,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.border,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: { justifyContent: 'space-between' },
  empty: { textAlign: 'center', color: theme.subText, marginTop: 60 },
})
