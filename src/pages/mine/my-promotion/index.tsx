// @title 推荐中心
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Button, Image, View, Text } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'
import { generateQrcode } from '@/db/api'
import { calculateDynamicScore, getRankByDynamicScoreV5, RANK_CONFIG_TABLE_V5 } from '@/utils/commission-calculator-v5'
import { RANK_ORDER, RANK_COLOR_MAP } from '@/constants/ranks'

// 段位顺序与颜色统一引用 src/constants/ranks（RANK_ORDER / RANK_COLOR_MAP）

interface RankProgress {
  current_rank: string; next_rank: string; direct_count: number
  target_count: number; progress: number; total_gmv: number
  points: number; balance: number
}

interface CommSummary {
  total_pending: number; total_settled: number; total_count: number
  l1_count: number; l2_count: number
}

function MyPromotionPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [rankData, setRankData] = useState<RankProgress | null>(null)
  const [commSummary, setCommSummary] = useState<CommSummary | null>(null)
  const [referralCode, setReferralCode] = useState<string>('LDYX001')  // 默认推荐码，避免空白
  const [directTeam, setDirectTeam] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copySuccess, setCopySuccess] = useState(false)
  const [qrUrl, setQrUrl] = useState<string>('')
  const [qrLoading, setQrLoading] = useState(false)
  const [error, setError] = useState<string>('')  // 添加错误状态

  // 分享配置
  const shareTitle = `我在"来电有喜"找到了好东西，用我的推荐码${referralCode}注册，享首单优惠！`
  const sharePath = `/pages/index/index?ref=${referralCode}`
  useShareAppMessage(() => ({ title: shareTitle, path: sharePath }))
  useShareTimeline(() => ({ title: shareTitle }))

  // 根据用户信息计算段位（前端V5算法，基于个人累计消费）
  const userRankInfo = useMemo(() => {
    if (!profile) return null
    const totalConsumption = profile.total_consumption || 0
    const dynamicScore = calculateDynamicScore(totalConsumption)
    const rank = getRankByDynamicScoreV5(dynamicScore)
    return {
      rankName: rank.rank,
      dynamicScore,
      l1Ratio: Math.round(rank.l1CommissionRate * 100),
      l2Ratio: Math.round(rank.l2CommissionRate * 100),
    }
  }, [profile])

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      // 分别加载，避免一个失败影响其他
      const [rankRes, profileRes, commRes, teamRes] = await Promise.allSettled([
        supabase.rpc('get_rank_progress', { p_user_id: user.id }),
        supabase.from('profiles').select('invite_code,member_rank,total_consumption,tb_balance').eq('id', user.id).maybeSingle(),
        supabase.from('commissions').select('commission_amount,status,level').eq('beneficiary_id', user.id),
        supabase.from('profiles').select('id,nickname,member_rank,created_at').eq('referrer_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])

      // 处理 rank 数据（容错：如果 RPC 函数不存在，用前端计算）
      if (rankRes.status === 'fulfilled' && rankRes.value?.data) {
        const data = rankRes.value.data as any
        setRankData({
          current_rank: data.current_rank || '凡心',
          next_rank: data.next_rank || '',
          direct_count: data.direct_count || 0,
          target_count: data.target_count || 5,
          progress: data.progress || 0,
          total_gmv: data.total_gmv || 0,
          points: data.points || 0,
          balance: (profileRes.status === 'fulfilled' ? (profileRes.value?.data as any)?.tb_balance : 0) || 0,
        })
      } else {
        // 前端降级计算段位（使用V5算法，保持逻辑一致）
        const totalConsumption = profile?.total_consumption || 0
        const dynamicScore = calculateDynamicScore(totalConsumption)
        const rankConfig = getRankByDynamicScoreV5(dynamicScore)

        // 计算进度
        const currentMin = rankConfig.minDynamicScore
        const rankIndex = RANK_CONFIG_TABLE_V5.findIndex(r => r.rank === rankConfig.rank)
        const nextRankConfig = rankIndex > 0 ? RANK_CONFIG_TABLE_V5[rankIndex - 1] : null
        let progress = 100
        if (nextRankConfig && nextRankConfig.minDynamicScore > currentMin) {
          progress = Math.min(100, ((dynamicScore - currentMin) / (nextRankConfig.minDynamicScore - currentMin)) * 100)
        }

        setRankData({
          current_rank: rankConfig.rank,
          next_rank: nextRankConfig?.rank || '已是最高段位',
          direct_count: 0,
          target_count: 5,
          progress: Math.round(progress),
          total_gmv: dynamicScore,
          points: Math.floor(dynamicScore * 0.01),
          balance: profile?.tb_balance || 0,
        })
      }

      // 处理推荐码
      if (profileRes.status === 'fulfilled' && profileRes.value?.data) {
        const pd = profileRes.value.data as any
        if (pd.invite_code) setReferralCode(pd.invite_code)
        else setReferralCode('LDYX001')  // 默认推荐码
      } else {
        setReferralCode('LDYX001')  // 兜底默认值
      }

      // 处理佣金数据
      if (commRes.status === 'fulfilled' && commRes.value?.data) {
        const rows = commRes.value.data as any[]
        setCommSummary({
          total_pending: rows.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.commission_amount), 0),
          total_settled: rows.filter(r => r.status === 'settled').reduce((s, r) => s + Number(r.commission_amount), 0),
          total_count: rows.length,
          total_earned: rows.filter(r => r.status !== 'refunded').reduce((s, r) => s + Number(r.commission_amount), 0),
          l1_count: rows.filter(r => r.level === 1).length,
          l2_count: rows.filter(r => r.level === 2).length,
        })
      } else {
        // 兜底空数据
        setCommSummary({ total_pending: 0, total_settled: 0, total_count: 0, l1_count: 0, l2_count: 0 })
      }

      // 团队数据
      if (teamRes.status === 'fulfilled' && teamRes.value?.data) {
        setDirectTeam(teamRes.value.data)
      }
    } catch (e: any) {
      console.error('[MyPromotion] load error:', e)
      setError(e?.message || '加载失败')
      // 即使全部失败也显示兜底数据
      setReferralCode('LDYX001')
      if (!rankData) {
        setRankData({
          current_rank: '凡心',
          next_rank: '初心',
          direct_count: 0,
          target_count: 5,
          progress: 0,
          total_gmv: 0,
          points: 0,
          balance: 0,
        })
      }
    }
    setLoading(false)
  }, [user, profile])

  useEffect(() => { load() }, [load])

  // 加载完推荐码后自动生成二维码
  useEffect(() => {
    if (!referralCode || qrUrl || qrLoading) return
    setQrLoading(true)
    generateQrcode({ type: 'user', referral_code: referralCode }).then(url => {
      setQrLoading(false)
      if (url) setQrUrl(url)
    }).catch(() => {
      setQrLoading(false)
      // 二维码生成失败不影响页面使用
    })
  }, [referralCode, qrUrl, qrLoading])

  const handleCopyCode = () => {
    Taro.setClipboardData({ data: referralCode, success: () => {
      setCopySuccess(true)
      Taro.showToast({ title: '推荐码已复制', icon: 'success' })
      setTimeout(() => setCopySuccess(false), 2000)
    }})
  }

  const handleShareLink = () => {
    const link = `来电有喜，专属推荐码：${referralCode}，下载并使用我的推荐码注册享优惠！`
    Taro.setClipboardData({ data: link, success: () =>
      Taro.showToast({ title: '推荐链接已复制', icon: 'success' })
    })
  }

  const rankColor = userRankInfo?.rankName ? (RANK_COLOR_MAP[userRankInfo.rankName] || 'hsl(var(--primary))') : 'hsl(var(--primary))'
  const rankIdx = RANK_ORDER.indexOf(rankData?.current_rank || '凡心')

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      {/* 风险提示与升段进度已移除，界面更简洁聚焦 */}

      {/* 段位英雄卡 */}
      <View className="mx-4 mt-6 rounded-3xl overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${rankColor}dd 0%, ${rankColor}99 100%)` }}>
        <View className="px-5 py-6">
          <View className="flex items-center justify-between mb-4">
            <View>
              <View className="flex items-center gap-2 mb-1">
                <Icon name="medal" size={30} className="text-white" />
                <Text className="text-3xl font-bold text-white">{rankData?.current_rank || '凡心'}</Text>
              </View>
              <Text className="text-xl text-white/80">我的好友: {rankData?.direct_count || 0}人  |  累计消费额: ¥{Number(rankData?.total_gmv || 0).toFixed(0)}</Text>
            </View>
          </View>

          {/* 升段进度条已移除，段位信息保留在顶部卡片 */}
        </View>
      </View>

      {/* 推荐码二维码 —— 主焦点 */}
      <View className="mx-4 mt-4 p-5 bg-card rounded-3xl border-2 border-primary/20">
        <View className="flex items-center gap-2 mb-4">
          <Icon name="qrcode" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">我的推荐码</Text>
          <Text className="text-xl text-muted-foreground ml-auto tracking-widest font-mono">{referralCode}</Text>
        </View>

        {/* 二维码大图居中 */}
        <View className="flex flex-col items-center py-4">
          <View className="w-56 h-56 rounded-2xl border-2 border-primary/30 bg-background flex items-center justify-center overflow-hidden"
            style={{ boxShadow: '0 8px 24px rgba(194,65,12,0.12)' }}>
            {qrLoading ? (
              <View className="flex flex-col items-center gap-3">
                <Icon name="loading" size={48} className="text-primary animate-spin" />
                <Text className="text-xl text-muted-foreground">生成中...</Text>
              </View>
            ) : qrUrl ? (
              <Image src={qrUrl} mode="aspectFit" style={{ width: '224px', height: '224px' }} />
            ) : (
              <View className="flex flex-col items-center gap-2">
                <Icon name="qrcode-scan" size={48} className="text-muted-foreground/40" />
                <Text className="text-xl text-muted-foreground">加载中...</Text>
              </View>
            )}
          </View>
          <Text className="text-xl text-muted-foreground text-center mt-4 leading-relaxed">
            好友扫码注册，成为你的推荐好友
          </Text>
        </View>

        {/* 操作按钮：分享专属推荐码，邀请好友注册 */}
        <View className="flex gap-3">
          <Button openType="share"
            className="flex-1 flex items-center justify-center leading-none rounded-2xl"
            style={{ background: `linear-gradient(135deg, ${rankColor}, ${rankColor}99)`, border: 'none' }}>
            <View className="py-3 flex items-center gap-2">
              <Icon name="share-variant" size={24} className="text-white" />
              <Text className="text-xl font-bold text-white">分享好友</Text>
            </View>
          </Button>
        </View>
      </View>
      {/* 佣金统计 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <View className="text-primary"><Icon name="coin" size={24} /></View>
          <Text className="text-xl font-bold text-foreground">推荐奖励概览</Text>
          <View className="flex-1" />
          <View className="flex items-center gap-1 text-primary text-xl"
            onClick={() => Taro.navigateTo({ url: '/pages/trade/commission-detail/index' })}>
            <Text>明细</Text>
            <Icon name="chevron-right" size={20} />
          </View>
        </View>
        <View className="grid grid-cols-3 py-4">
          {[
            { label: '待结算', value: `¥${Number(commSummary?.total_pending || 0).toFixed(2)}`, color: 'hsl(var(--primary))' },
            { label: '已结算', value: `¥${Number(commSummary?.total_settled || 0).toFixed(2)}`, color: '#2E7D5B' },
            { label: '总笔数', value: `${commSummary?.total_count || 0}笔`, color: '#3B5B7A' },
          ].map(item => (
            <View key={item.label} className="flex flex-col items-center gap-1">
              <Text className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</Text>
              <Text className="text-base text-muted-foreground">{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

        {/* 余额与推荐奖励（推荐奖励已以健康豆发放，可在小程序内直接消费支付） */}
        <View className="mx-4 mt-4 grid grid-cols-2 gap-3">
          <View className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-2"
            onClick={() => Taro.navigateTo({ url: '/pages/trade/goldbean-ledger/index' })}>
            <Icon name="wallet" size={30} className="text-primary" />
            <Text className="text-2xl font-bold text-foreground">{Number(rankData?.balance || 0).toFixed(2)}</Text>
            <Text className="text-base text-muted-foreground">我的健康豆</Text>
          </View>
          <View className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-2"
            onClick={() => Taro.navigateTo({ url: '/pages/trade/commission-detail/index' })}>
            <View className="text-primary"><Icon name="coin" size={28} /></View>
            <Text className="text-2xl font-bold text-foreground">{Number(commSummary?.total_earned || 0).toFixed(2)}</Text>
            <Text className="text-base text-muted-foreground">累计推荐奖励(健康豆)</Text>
          </View>
        </View>

      {/* 我的推荐关系 */}
      {directTeam.length > 0 && (
        <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
          <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <View className="text-primary"><Icon name="user" size={24} /></View>
            <Text className="text-xl font-bold text-foreground">我的好友</Text>
            <Text className="text-base text-muted-foreground ml-1">({directTeam.length}人)</Text>
          </View>
          {directTeam.slice(0, 5).map((m, i) => (
            <View key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <View className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Text className="text-xl font-bold text-foreground">{(m.nickname || '喜').charAt(0)}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xl text-foreground font-bold">{m.nickname || '用户'}</Text>
                <Text className="text-base text-muted-foreground">{m.member_rank}</Text>
              </View>
              <Text className="text-base text-muted-foreground">{new Date(m.created_at).toLocaleDateString('zh-CN')}</Text>
            </View>
          ))}
          {directTeam.length > 5 && (
            <View className="flex items-center justify-center py-3">
              <Text className="text-xl text-muted-foreground">还有 {directTeam.length - 5} 位用户...</Text>
            </View>
          )}
        </View>
      )}

      {/* 相关协议入口 */}
      <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
        <View className="flex items-center gap-2 mb-2">
          <Icon name="file-document-outline" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">相关协议</Text>
        </View>
        <View className="flex flex-col gap-1">
          <View className="flex items-center justify-between py-2"
            onClick={() => Taro.navigateTo({ url: '/pages/agreement/distribution-agreement/index' })}>
            <Text className="text-base text-muted-foreground">《推荐激励说明》</Text>
            <Icon name="chevron-right" size={20} className="text-muted-foreground" />
          </View>
          <View className="flex items-center justify-between py-2"
            onClick={() => Taro.navigateTo({ url: '/pages/agreement/commission-rules/index' })}>
            <Text className="text-base text-muted-foreground">《推荐奖励规则》</Text>
            <Icon name="chevron-right" size={20} className="text-muted-foreground" />
          </View>
        </View>
      </View>

    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MyPromotionPage
