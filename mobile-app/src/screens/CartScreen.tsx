import React from 'react'
import { View, Text, Pressable, Alert, FlatList, StyleSheet } from 'react-native'
import { useCartStore } from '@/state/cartStore'
import { theme, spacing } from '@/theme'

export const CartScreen: React.FC = () => {
  const lines = useCartStore((s) => s.lines)
  const setQty = useCartStore((s) => s.setQty)
  const remove = useCartStore((s) => s.remove)
  const totalPrice = useCartStore((s) => s.totalPrice())
  const totalCount = useCartStore((s) => s.totalCount())

  const checkout = () => {
    Alert.alert('支付待接入', '原生支付（微信 App 支付 / 支付宝）将在 Phase 2 接入，详见 README 待办清单。')
  }

  if (lines.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.subText }}>购物车还是空的，去挑点好物吧 🍵</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={lines}
        keyExtractor={(item) => item.product.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.product.name}</Text>
              <Text style={styles.price}>¥{item.product.price.toFixed(2)}</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable style={styles.stepBtn} onPress={() => setQty(item.product.id, item.quantity - 1)}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.qty}>{item.quantity}</Text>
              <Pressable style={styles.stepBtn} onPress={() => setQty(item.product.id, item.quantity + 1)}>
                <Text style={styles.stepText}>＋</Text>
              </Pressable>
              <Pressable style={styles.remove} onPress={() => remove(item.product.id)}>
                <Text style={styles.removeText}>删除</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View>
          <Text style={styles.totalLabel}>合计</Text>
          <Text style={styles.totalPrice}>¥{totalPrice.toFixed(2)}</Text>
        </View>
        <Pressable style={styles.checkout} onPress={checkout}>
          <Text style={styles.checkoutText}>去结算（{totalCount}）</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  name: { fontSize: 15, fontWeight: '600', color: theme.text },
  price: { fontSize: 14, color: theme.primary, marginTop: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  stepText: { fontSize: 18, color: theme.text },
  qty: { marginHorizontal: spacing.md, fontSize: 15, fontWeight: '600' },
  remove: { marginLeft: spacing.md },
  removeText: { color: theme.danger, fontSize: 13 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: theme.card,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  totalLabel: { fontSize: 12, color: theme.subText },
  totalPrice: { fontSize: 20, fontWeight: '800', color: theme.primary },
  checkout: { backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  checkoutText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
