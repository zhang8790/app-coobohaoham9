import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuthStore } from '@/state/authStore'
import { theme, spacing } from '@/theme'

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>()
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile?.nickname || '客').slice(0, 1)}</Text>
        </View>
        <Text style={styles.nickname}>{profile?.nickname || '微信用户'}</Text>
        <Text style={styles.rank}>{profile?.member_rank || '凡心'}</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{profile?.tb_balance ?? 0}</Text>
          <Text style={styles.statLabel}>金豆</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{profile?.commission_balance ?? 0}</Text>
          <Text style={styles.statLabel}>佣金(元)</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{profile?.total_consumption ?? 0}</Text>
          <Text style={styles.statLabel}>累计消费(元)</Text>
        </View>
      </View>

      <Pressable style={styles.row} onPress={() => navigation.navigate('Orders')}>
        <Text style={styles.rowText}>我的订单</Text>
        <Text style={styles.rowArrow}>›</Text>
      </Pressable>

      <Pressable style={[styles.row, styles.signOut]} onPress={() => signOut()}>
        <Text style={[styles.rowText, { color: theme.danger }]}>退出登录</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: { alignItems: 'center', padding: spacing.xl, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 30, fontWeight: '800', color: theme.primary },
  nickname: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: spacing.sm },
  rank: { fontSize: 13, color: theme.primary, marginTop: spacing.xs },
  stats: { flexDirection: 'row', backgroundColor: theme.card, marginTop: spacing.lg, paddingVertical: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: theme.text },
  statLabel: { fontSize: 12, color: theme.subText, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  rowText: { fontSize: 15, color: theme.text },
  rowArrow: { fontSize: 18, color: theme.subText },
  signOut: { marginTop: spacing.lg },
})
