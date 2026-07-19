import React from 'react'
import { Pressable, Text, View, Image, StyleSheet } from 'react-native'
import { Product } from '@/types/db'
import { theme, spacing } from '@/theme'

interface Props {
  product: Product
  onPress: (p: Product) => void
}

export const ProductCard: React.FC<Props> = ({ product, onPress }) => {
  return (
    <Pressable style={styles.card} onPress={() => onPress(product)}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>食</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.price}>¥{product.price.toFixed(2)}</Text>
          {product.stores?.is_platform ? (
            <Text style={styles.platformTag}>自营</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: theme.primaryLight,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 40,
    color: theme.primary,
  },
  body: {
    padding: spacing.md,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  footer: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.primary,
  },
  platformTag: {
    fontSize: 11,
    color: theme.primary,
    backgroundColor: theme.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
})
