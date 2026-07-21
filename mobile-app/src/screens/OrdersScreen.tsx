import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/state/authStore'
import type { Order } from '@/types/db'
import { theme, spacing } from '@/theme'

const STATUS_LABEL: Record<string, string> = {
  pending_pay: '待支付',
  pending_ship: '待发货',
  pending_receive: '待收货',
  pending_pickup: '待自提',
  pending_review: '待评价',
  completed: '已完成',
  after_sale: '售后中',
  cancelled: '已取消',
}

export const OrdersScreen: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!user) {
      setLoading(false)
      return
    }
    ;(async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (active) {
        if (!error && data) setOrders(data as unknown as Order[])
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [user])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>还没有订单</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.orderNo}>订单 {item.order_no}</Text>
              <Text style={styles.status}>{STATUS_LABEL[item.status] ?? item.status}</Text>
            </View>
            <Text style={styles.amount}>
              ¥{item.total_amount.toFixed(2)}
              {item.tb_used ? ` · 金豆 ${item.tb_used}` : ''}
            </Text>
            {(item.order_items ?? []).map((oi) => (
              <Text key={oi.id} style={styles.item}>
                {oi.product_name} × {oi.quantity}
              </Text>
            ))}
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNo: { fontSize: 14, fontWeight: '600', color: theme.text },
  status: { fontSize: 13, color: theme.primary },
  amount: { fontSize: 15, fontWeight: '700', color: theme.text, marginTop: spacing.xs },
  item: { fontSize: 13, color: theme.subText, marginTop: 2 },
  empty: { textAlign: 'center', color: theme.subText, marginTop: 60 },
})
