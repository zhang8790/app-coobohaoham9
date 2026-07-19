import React from 'react'
import { Text, View, StyleSheet } from 'react-native'
import type { FitTier } from '@/lib/food-therapy'
import { Product } from '@/types/db'
import { ProductCard } from './ProductCard'
import { theme, spacing } from '@/theme'

export const TIER_META: Record<FitTier, { label: string; color: string }> = {
  recommend: { label: '五星推荐', color: theme.recommend },
  caution: { label: '谨慎食用', color: theme.caution },
  avoid: { label: '不建议点', color: theme.avoid },
}

interface Props {
  tier: FitTier
  items: Product[]
  onSelect: (p: Product) => void
}

export const TierSection: React.FC<Props> = ({ tier, items, onSelect }) => {
  if (!items.length) return null
  const meta = TIER_META[tier]
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: meta.color }]} />
        <Text style={styles.title}>{meta.label}</Text>
        <Text style={styles.count}>{items.length}</Text>
      </View>
      {items.map((p) => (
        <ProductCard key={p.id} product={p} onPress={onSelect} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
  },
  count: {
    marginLeft: spacing.xs,
    fontSize: 13,
    color: theme.subText,
  },
})
