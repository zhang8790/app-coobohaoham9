import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
// @title 段位 · 身份与权益

import { getMyProfile } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import './index.scss'

// 六阶高端段位（颜色与 commission-calculator-v5 RANK_CONFIG_TABLE_V5 保持一致）
// 段位由个人【近 6 个月滚动消费】决定基础门槛，高段位叠加「徽章收集度」软门槛；团队 / 邀请新用户仅作推广佣金系数，不进入段位。
const RANK_TIERS = [
  {
    rank: '无心境', score: '≥ 20,000', color: '#D4AF37',
    identity: '荣誉身份',
    benefits: ['荣誉身份铭牌', '年度成长盛典邀约', '无心境专属客服'],
    gate: '徽章 ≥ 8 且含史诗/传说'},
  {
    rank: '悟心', score: '≥ 6,000', color: '#9CA3AF',
    identity: '高阶 · 共创',
    benefits: ['食养·情绪 共创权（命名 / 配方投票）', '私享品鉴'],
    gate: '徽章收集度 ≥ 4'},
  {
    rank: '静心', score: '≥ 2,000', color: '#CD7F32',
    identity: '中坚 · 专属',
    benefits: ['1v1 情绪管家（季度）× 1', '线下主题沙龙邀约'],
    gate: '累计确权 ≥ N'},
  {
    rank: '明心', score: '≥ 800', color: '#4A90D9',
    identity: '进阶 · 优先',
    benefits: ['新品优先体验', '专属食养配方卡'],
    gate: '—'},
  {
    rank: '初心', score: '≥ 200', color: '#50C878',
    identity: '入门 + · 关怀',
    benefits: ['月度「情绪顾问」轻咨询 × 1', '生日情绪礼'],
    gate: '—'},
  {
    rank: '凡心', score: '≥ 0', color: '#90EE90',
    identity: '入门',
    benefits: ['情绪确权基础礼包'],
    gate: '—'},
]

function RankRules() {
  const { user } = useAuth()
  const [currentRank, setCurrentRank] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let alive = true
    getMyProfile()
      .then(p => { if (alive) setCurrentRank((p as any)?.member_rank || null) })
      .catch(() => {})
    return () => { alive = false }
  }, [user])

  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4">
        <Text className="block text-foreground text-xl font-bold mb-1" style={{ display: 'block' }}>段位 · 身份与权益</Text>
        <Text className="block text-muted-foreground text-xs" style={{ display: 'block' }}>
          段位由个人【近 6 个月滚动消费】决定基础门槛（窗口外消费自动过期）；高段位（悟心 / 无心境）叠加徽章收集度软门槛，达到即晋升。停止消费即自动降级，杜绝长期不消费仍享高段位。
        </Text>
        <Text className="block text-muted-foreground text-xs mt-1" style={{ display: 'block' }}>
          权益为专属服务 / 体验 / 共创权，不承诺现金回报或保本，不含分红 / 股权表述。
        </Text>
      </View>

      {/* 六阶高端权益卡（高 → 低） */}
      <View className="mx-4 mt-4">
        {RANK_TIERS.map((t, i) => {
          const isCurrent = currentRank === t.rank
          return (
          <View key={t.rank}
            className={`mb-3 rounded-2xl border border-border overflow-hidden rank-row-in ${isCurrent ? 'rank-current' : ''}`}
            style={{ background: '#fff', borderLeftWidth: '6px', borderLeftColor: t.color, ['--rc']: t.color, animationDelay: `${i * 0.06}s` } as any}>
            <View className="px-4 py-3" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
              <View className="flex items-center justify-between">
                <View className="flex items-center gap-2">
                  <View className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                  <Text className="text-foreground text-xl font-bold">{t.rank}</Text>
                  <Text className="text-muted-foreground text-xs">{t.identity}</Text>
                  {isCurrent && <Text className="rank-current-pill">★ 当前段位</Text>}
                </View>
                <Text className="text-muted-foreground text-xs">{t.score}</Text>
              </View>
            </View>
            <View className="px-4 py-3">
              {t.benefits.map(b => (
                <View key={b} className="flex items-center gap-2 mb-1">
                  <Text className="text-primary text-sm">✓</Text>
                  <Text className="text-foreground text-sm">{b}</Text>
                </View>
              ))}
              {t.gate !== '—' && (
                <View className="mt-2 flex items-center gap-2">
                  <Text className="text-xs px-2 py-0.5 rounded-full" style={{ color: t.color, borderWidth: '1px', borderColor: t.color }}>
                    晋升软参考：{t.gate}
                  </Text>
                </View>
              )}
            </View>
          </View>
          )
        })}
      </View>

      {/* 合规与机制说明 */}
      <View className="mx-4 mt-2 bg-card rounded-2xl border border-border p-4">
        <Text className="block text-foreground text-base font-bold mb-2" style={{ display: 'block' }}>机制与合规</Text>
        <Text className="block text-muted-foreground text-xs leading-loose" style={{ display: 'block' }}>
          1. 团队 / 邀请新用户仅作推广佣金（真实服务费）的系数，不进入段位，避免「等级靠拉人」观感；推广佣金以金豆发放，不可提现。
        </Text>
        <Text className="block text-muted-foreground text-xs leading-loose" style={{ display: 'block' }}>
          2. 高段位（悟心 / 无心境）晋升参考「徽章收集度」作为软门槛（悟心 ≥ 4 枚，无心境 ≥ 8 枚且含史诗 / 传说），不硬卡升级。
        </Text>
        <Text className="block text-muted-foreground text-xs leading-loose" style={{ display: 'block' }}>
          3. 徽章来自每次情绪确权，按稀有度（普通→稀有→史诗→传说）收藏，详见「徽章图鉴」。
        </Text>
        <Text className="block text-muted-foreground text-xs leading-loose mt-1" style={{ display: 'block' }}>
          金豆为平台唯一内部资产，由人民币充值获得，仅限平台内消费，不可提现、不可兑现金、不可二级转让；推广佣金已以金豆发放，与之同源。
        </Text>
      </View>
    </View>
  )
}

export default RankRules
