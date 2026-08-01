// @title 分享官中心
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { getMyBalance, getEquitySummary, getMyReferrals } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { RANK_COLOR_MAP } from '@/constants/ranks'
import { supabase } from '@/client/supabase'

interface DashboardData {
  balance: { tb_balance: number; commission_balance: number }
  equity: { current_rank: string; total_earned: number; total_spent: number } | null
  referrals: { l1: number; l2: number }
  recentCommissions: Array<{ id: string; amount: number; net: number; created_at: string; rank_name: string }>
}

export default function PartnerCenter() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      getMyBalance(),
      getEquitySummary().catch(() => null),
      getMyReferrals(),
      supabase.from('commissions')
        .select('id, commission_amount, net_amount, created_at, rank_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
        .then(r => r.data || []),
    ]).then(([bal, equity, refs, comms]) => {
      setData({
        balance: bal,
        equity: equity ? { current_rank: equity.current_rank, total_earned: equity.total_earned, total_spent: equity.total_spent } : null,
        referrals: { l1: refs.level_1_count, l2: refs.level_2_count },
        recentCommissions: comms.map((c: any) => ({
          id: c.id, amount: Number(c.commission_amount || 0),
          net: Number(c.net_amount || 0), created_at: c.created_at,
          rank_name: c.rank_name || '',
        })),
      })
    }).catch(console.error).finally(() => setLoading(false))
  }, [user])

  if (loading) {
    return <View style={page}><View style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Text>加载中…</Text></View></View>
  }

  const rankColor = RANK_COLOR_MAP[data?.equity?.current_rank || ''] || '#8C7E6E'
  const totalCommission = data?.recentCommissions.reduce((s, c) => s + c.amount, 0) || 0
  const totalNet = data?.recentCommissions.reduce((s, c) => s + c.net, 0) || 0

  return (
    <ScrollView style={page} scrollY>
      {/* 顶部身份卡 */}
      <View style={headerCard}>
        <Text style={{ fontSize: 13, color: '#fff', opacity: 0.8, letterSpacing: 1 }}>我的分享官身份</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 4 }}>
          {data?.equity?.current_rank || '凡心'}
        </Text>
        <Text style={{ fontSize: 13, color: '#fff', opacity: 0.7, marginTop: 2 }}>
          累计推广收益：¥{(data?.equity?.total_earned || 0).toFixed(2)}
        </Text>
      </View>

      {/* 资产概览 */}
      <View style={statsRow}>
        <View style={{ ...statCard, borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={statNum}>¥{totalCommission.toFixed(2)}</Text>
          <Text style={statLabel}>近10单佣金</Text>
        </View>
        <View style={{ ...statCard, borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={statNum}>¥{totalNet.toFixed(2)}</Text>
          <Text style={statLabel}>净到手</Text>
        </View>
        <View style={statCard}>
          <Text style={{ ...statNum, color: '#16a34a' }}>¥{data?.balance.commission_balance?.toFixed(2) || '0.00'}</Text>
          <Text style={statLabel}>可提现</Text>
        </View>
      </View>

      {/* 团队概况 */}
      <View style={sectionCard}>
        <Text style={sectionTitle}>👥 我的团队</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#1e293b' }}>{data?.referrals.l1 || 0}</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>一级好友</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#1e293b' }}>{data?.referrals.l2 || 0}</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>二级粉丝</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#1e293b' }}>¥{data?.equity?.total_spent?.toFixed(2) || '0.00'}</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>团队消费</Text>
          </View>
        </View>
      </View>

      {/* 快捷操作 */}
      <View style={sectionCard}>
        <Text style={sectionTitle}>🚀 快速推广</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <View style={actionBtn} onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
            <Text style={{ fontSize: 18 }}>🛒</Text>
            <Text style={actionBtnText}>分享商品</Text>
          </View>
          <View style={actionBtn} onClick={() => Taro.navigateTo({ url: '/pages/mine/my-promotion/index' })}>
            <Text style={{ fontSize: 18 }}>📋</Text>
            <Text style={actionBtnText}>我的段位</Text>
          </View>
          <View style={actionBtn} onClick={() => Taro.navigateTo({ url: '/pages/mine/my-referrals/index' })}>
            <Text style={{ fontSize: 18 }}>👥</Text>
            <Text style={actionBtnText}>我的好友</Text>
          </View>
          <View style={actionBtn} onClick={() => {
            Taro.setClipboardData({ data: `快来「来电有喜」一起分享好物～健康配料、放心选择！` })
            Taro.showToast({ title: '已复制推广语', icon: 'success' })
          }}>
            <Text style={{ fontSize: 18 }}>📤</Text>
            <Text style={actionBtnText}>复制推广语</Text>
          </View>
        </View>
      </View>

      {/* 推广素材库 */}
      <View style={sectionCard}>
        <Text style={sectionTitle}>🎨 推广素材</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          {[
            { label: '健康配料', desc: '"配料表全透明，孩子吃得安心"', color: '#16a34a' },
            { label: '食养推荐', desc: '"懂体质的食养好物，适合家人口味"', color: '#d4a537' },
            { label: '临期特惠', desc: '"超值临期好货，品质不减价格减"', color: '#ea580c' },
            { label: '会员福利', desc: '"段位越高优惠越多，快来升级"', color: '#6366f1' },
          ].map((tpl) => (
            <View key={tpl.label} style={{
              flex: '0 0 calc(50% - 6px)', background: '#f8fafc', borderRadius: 10, padding: 12,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: tpl.color }}>{tpl.label}</Text>
              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: '16px', display: 'block' }}>{tpl.desc}</Text>
              <View style={{ marginTop: 8, alignSelf: 'flex-start' }}
                onClick={() => {
                  Taro.setClipboardData({ data: tpl.desc })
                  Taro.showToast({ title: '已复制文案', icon: 'success' })
                }}
              >
                <Text style={{ fontSize: 11, color: tpl.color, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: tpl.color }}>
                  复制文案
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 本月排行榜 */}
      <View style={sectionCard}>
        <Text style={sectionTitle}>🏆 本月分销排行</Text>
        <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, display: 'block' }}>
          努力分享，下个月上榜的就是你！
        </Text>
        <View style={{ marginTop: 12 }}>
          {[
            { rank: '🥇', name: '分享达人A', amount: 1280, color: '#d4a537' },
            { rank: '🥈', name: '健康推荐官B', amount: 960, color: '#94a3b8' },
            { rank: '🥉', name: '食养传播者C', amount: 720, color: '#cd7f32' },
          ].map((item, i) => (
            <View key={i} style={{
              flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(0,0,0,0.05)',
            }}>
              <Text style={{ fontSize: 20, width: 36 }}>{item.rank}</Text>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#334155' }}>{item.name}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#16a34a' }}>+¥{item.amount}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 近期佣金 */}
      <View style={sectionCard}>
        <Text style={sectionTitle}>📊 近期佣金记录</Text>
        {data?.recentCommissions.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20, display: 'block' }}>
            暂无佣金记录，快分享商品给好友吧～
          </Text>
        ) : (
          data?.recentCommissions.map((c, i) => (
            <View key={i} style={commItem}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: '#334155', fontWeight: '600' }}>
                  +¥{c.amount.toFixed(2)}
                </Text>
                <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {new Date(c.created_at).toLocaleDateString('zh-CN')} · 净到手 ¥{c.net.toFixed(2)}
                </Text>
              </View>
              <Text style={{
                fontSize: 11, color: rankColor, background: `${rankColor}15`,
                borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8, fontWeight: '600',
              }}>{c.rank_name || '普通'}</Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const page: React.CSSProperties = {
  minHeight: '100vh', background: 'linear-gradient(180deg,#fef9e7 0%,#f8fafc 40%)', padding: 16, boxSizing: 'border-box',
}
const headerCard: React.CSSProperties = {
  background: 'linear-gradient(135deg,#d4a537,#b8860b)', borderRadius: 16, padding: 24, marginBottom: 14,
}
const statsRow: React.CSSProperties = {
  flexDirection: 'row', background: '#fff', borderRadius: 14, marginBottom: 14,
  borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
}
const statCard: React.CSSProperties = { flex: 1, alignItems: 'center', paddingVertical: 14 }
const statNum: React.CSSProperties = { fontSize: 18, fontWeight: '800', color: '#1e293b' }
const statLabel: React.CSSProperties = { fontSize: 11, color: '#94a3b8', marginTop: 2 }
const sectionCard: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
  borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
}
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: '700', color: '#0f172a' }
const actionBtn: React.CSSProperties = { flex: 1, alignItems: 'center', paddingVertical: 12, background: '#f8fafc', borderRadius: 12 }
const actionBtnText: React.CSSProperties = { fontSize: 12, color: '#475569', marginTop: 4 }
const commItem: React.CSSProperties = {
  flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
  borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
}
