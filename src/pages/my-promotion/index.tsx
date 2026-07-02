// @title 侠客推广中心
import { useState, useCallback, useEffect } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Button, Image } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/client/supabase'
import { generateQrcode } from '@/db/api'
import { getRankByDynamicScore, calculateDynamicScore } from '@/utils/commission-calculator-v4'

const RANK_ORDER = ['江湖散修', '外门弟子', '内门弟子', '核心弟子', '长老', '掌门']
const RANK_COLORS: Record<string, string> = {
  '江湖散修': '#78350F', '外门弟子': '#B45309', '内门弟子': '#92400E',
  '核心弟子': '#C2410C', '长老': '#9333EA', '掌门': '#DC2626',
}
// 段位配置从V4算法动态获取（不再硬编码）

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
  const { user, profile } = useAuth()
  const [rankData, setRankData] = useState<RankProgress | null>(null)
  const [commSummary, setCommSummary] = useState<CommSummary | null>(null)
  const [referralCode, setReferralCode] = useState<string>('')
  const [directTeam, setDirectTeam] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copySuccess, setCopySuccess] = useState(false)
  const [qrUrl, setQrUrl] = useState<string>('')
  const [qrLoading, setQrLoading] = useState(false)

  // 分享配置
  const shareTitle = `我在"来店有喜"找到了好东西，用我的推广码${referralCode}注册，享首单优惠！`
  const sharePath = `/pages/index/index?ref=${referralCode}`
  useShareAppMessage(() => ({ title: shareTitle, path: sharePath }))
  useShareTimeline(() => ({ title: shareTitle }))

  // 根据用户信息计算段位（前端V4算法）
  const userRankInfo = useMemo(() => {
    if (!profile) return null
    const totalConsumption = profile.total_consumption || 0
    const teamPerformance = profile.team_performance || 0
    const dynamicScore = calculateDynamicScore(totalConsumption, teamPerformance)
    const rank = getRankByDynamicScore(dynamicScore)
    return {
      rankName: rank.rankName,
      dynamicScore,
      l1Ratio: Math.round(rank.l1Ratio * 100),
      l2Ratio: Math.round(rank.l2Ratio * 100),
      pointsRatio: Math.round(rank.pointsRatio * 100),
    }
  }, [profile])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [rankRes, profileRes, commRes, teamRes] = await Promise.all([
      supabase.rpc('get_rank_progress', { p_user_id: user.id }),
      supabase.from('profiles').select('referral_code').eq('id', user.id).maybeSingle(),
      supabase.from('commissions').select('commission_amount,status,level')
        .eq('beneficiary_id', user.id),
      supabase.from('profiles').select('id,nickname,member_rank,created_at')
        .eq('referrer_id', user.id).order('created_at', { ascending: false }).limit(20),
    ])

    if (rankRes.data) setRankData(rankRes.data as RankProgress)
    if (profileRes.data?.referral_code) setReferralCode(profileRes.data.referral_code)

    if (commRes.data) {
      const rows = commRes.data as any[]
      setCommSummary({
        total_pending: rows.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.commission_amount), 0),
        total_settled: rows.filter(r => r.status === 'settled').reduce((s, r) => s + Number(r.commission_amount), 0),
        total_count: rows.length,
        l1_count: rows.filter(r => r.level === 1).length,
        l2_count: rows.filter(r => r.level === 2).length,
      })
    }
    if (teamRes.data) setDirectTeam(teamRes.data)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // 加载完推广码后自动生成二维码
  useEffect(() => {
    if (!referralCode || qrUrl || qrLoading) return
    setQrLoading(true)
    generateQrcode({ type: 'user', referral_code: referralCode }).then(url => {
      setQrLoading(false)
      if (url) setQrUrl(url)
      else Taro.showToast({ title: '二维码生成失败，请稍后重试', icon: 'none' })
    })
  }, [referralCode, qrUrl, qrLoading])

  const handleCopyCode = () => {
    Taro.setClipboardData({ data: referralCode, success: () => {
      setCopySuccess(true)
      Taro.showToast({ title: '推广码已复制', icon: 'success' })
      setTimeout(() => setCopySuccess(false), 2000)
    }})
  }

  const handleShareLink = () => {
    const link = `来店有喜 - 武侠生活平台，专属推广码：${referralCode}，下载并使用我的推广码注册享优惠！`
    Taro.setClipboardData({ data: link, success: () =>
      Taro.showToast({ title: '推广链接已复制', icon: 'success' })
    })
  }

  const handleShowQr = async () => {
    if (qrUrl) return  // 已生成
    if (!referralCode) { Taro.showToast({ title: '推广码加载中', icon: 'none' }); return }
    setQrLoading(true)
    const url = await generateQrcode({ type: 'user', referral_code: referralCode })
    setQrLoading(false)
    if (url) setQrUrl(url)
    else Taro.showToast({ title: '二维码生成失败，请稍后重试', icon: 'none' })
  }

  const handleSaveQr = () => {
    if (!qrUrl) return
    const isWeapp = Taro.getEnv() === 'WEAPP'
    if (!isWeapp) { Taro.showToast({ title: '保存功能仅在微信小程序中可用', icon: 'none' }); return }
    Taro.downloadFile({ url: qrUrl, success: (res) => {
      Taro.saveImageToPhotosAlbum({ filePath: res.tempFilePath,
        success: () => Taro.showToast({ title: '二维码已保存到相册', icon: 'success' }),
        fail: () => Taro.showToast({ title: '保存失败，请授权相册权限', icon: 'none' }),
      })
    }, fail: () => Taro.showToast({ title: '下载失败', icon: 'none' }) })
  }

  const rankColor = profile?.member_rank ? (RANK_COLORS[profile.member_rank] || '#C2410C') : '#C2410C'
  const rankIdx = RANK_ORDER.indexOf(rankData?.current_rank || '江湖散修')

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="i-mdi-loading text-4xl text-primary animate-spin" />
    </div>
  )

  return (<RouteGuard>
    <div className="min-h-screen bg-background pb-8">
      {/* 段位英雄卡 */}
      <div className="mx-4 mt-6 rounded-3xl overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${rankColor}dd 0%, ${rankColor}99 100%)` }}>
        <div className="px-5 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="i-mdi-medal text-3xl text-white" />
                <span className="text-3xl font-bold text-white">{rankData?.current_rank || '江湖散修'}</span>
              </div>
              <p className="text-xl text-white/80">直推: {rankData?.direct_count || 0}人  |  累计GMV: ¥{Number(rankData?.total_gmv || 0).toFixed(0)}</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-4xl font-bold text-white">{rankData?.l1_ratio || 15}%</div>
              <div className="text-base text-white/70">L1佣金比</div>
            </div>
          </div>

          {/* 段位进度条 */}
          {rankData?.next_rank !== '已是最高段位' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl text-white/80">升段进度</span>
                <span className="text-xl text-white font-bold">{rankData?.direct_count}/{rankData?.target_count}人</span>
              </div>
              <div className="w-full h-3 bg-white/25 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition"
                  style={{ width: `${Math.round((rankData?.progress || 0) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between mt-2">
                {RANK_ORDER.map((r, i) => (
                  <div key={r} className={`flex flex-col items-center gap-1 ${i <= rankIdx ? 'opacity-100' : 'opacity-40'}`}>
                    <div className={`w-3 h-3 rounded-full ${i <= rankIdx ? 'bg-white' : 'bg-white/40'}`} />
                    <span className="text-xs text-white">{r.replace('弟子', '').replace('湖散修', '修')}</span>
                  </div>
                ))}
              </div>
                <p className="text-base text-white/80 mt-2 text-center">
                  再邀请 {(rankData?.target_count || 0) - (rankData?.direct_count || 0)} 人可晋升 {rankData?.next_rank}
                  ，L1佣金提升至 {rankData?.next_l1_ratio || 18}%
                </p>
            </div>
          )}
          {rankData?.next_rank === '已是最高段位' && (
            <div className="text-center py-2">
              <span className="text-2xl text-white font-bold">🎉 江湖至尊，掌门传人</span>
            </div>
          )}
        </div>
      </div>

      {/* 推广码二维码 —— 主焦点 */}
      <div className="mx-4 mt-4 p-5 bg-card rounded-3xl border-2 border-primary/20">
        <div className="flex items-center gap-2 mb-4">
          <div className="i-mdi-qrcode text-2xl text-primary" />
          <span className="text-xl font-bold text-foreground">我的推广码</span>
          <span className="text-xl text-muted-foreground ml-auto tracking-widest font-mono">{referralCode}</span>
        </div>

        {/* 二维码大图居中 */}
        <div className="flex flex-col items-center py-4">
          <div className="w-56 h-56 rounded-2xl border-2 border-primary/30 bg-background flex items-center justify-center overflow-hidden"
            style={{ boxShadow: '0 8px 24px rgba(194,65,12,0.12)' }}>
            {qrLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="i-mdi-loading text-5xl text-primary animate-spin" />
                <span className="text-xl text-muted-foreground">生成中...</span>
              </div>
            ) : qrUrl ? (
              <Image src={qrUrl} mode="aspectFit" style={{ width: '224px', height: '224px' }} />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="i-mdi-qrcode-scan text-5xl text-muted-foreground/40" />
                <span className="text-xl text-muted-foreground">加载中...</span>
              </div>
            )}
          </div>
          <p className="text-xl text-muted-foreground text-center mt-4 leading-relaxed">
            好友扫码注册，永久锁定为你的一级下线
          </p>
        </div>

        {/* 操作按钮：保存二维码 + 分享给好友 */}
        <div className="flex gap-3">
          <button type="button"
            className="flex-1 flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-muted"
            onClick={handleSaveQr}>
            <div className="py-3 flex items-center gap-2">
              <div className="i-mdi-download text-2xl text-muted-foreground" />
              <span className="text-xl text-muted-foreground">保存图片</span>
            </div>
          </button>
          <Button openType="share"
            className="flex-1 flex items-center justify-center leading-none rounded-2xl"
            style={{ background: `linear-gradient(135deg, ${rankColor}, ${rankColor}99)`, border: 'none' }}>
            <div className="py-3 flex items-center gap-2">
              <div className="i-mdi-share-variant text-white text-2xl" />
              <span className="text-xl font-bold text-white">分享好友</span>
            </div>
          </Button>
        </div>
      </div>
      {/* 佣金统计 */}
      <div className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <div className="i-mdi-cash-multiple text-2xl text-primary" />
          <span className="text-xl font-bold text-foreground">佣金概览</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1 text-primary text-xl"
            onClick={() => Taro.navigateTo({ url: '/pages/commission-detail/index' })}>
            <span>明细</span>
            <div className="i-mdi-chevron-right text-xl" />
          </div>
        </div>
        <div className="grid grid-cols-3 py-4">
          {[
            { label: '待结算', value: `¥${Number(commSummary?.total_pending || 0).toFixed(2)}`, color: '#C2410C' },
            { label: '已结算', value: `¥${Number(commSummary?.total_settled || 0).toFixed(2)}`, color: '#4CAF50' },
            { label: '总笔数', value: `${commSummary?.total_count || 0}笔`, color: '#1976D2' },
          ].map(item => (
            <div key={item.label} className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</span>
              <span className="text-base text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4 pb-4">
          <div className="flex-1 p-3 bg-muted rounded-xl flex flex-col items-center gap-1">
            <span className="text-xl font-bold text-foreground">{commSummary?.l1_count || 0}</span>
            <span className="text-base text-muted-foreground">L1佣金 ({userRankInfo?.l1Ratio || 15}%)</span>
          </div>
          <div className="flex-1 p-3 bg-muted rounded-xl flex flex-col items-center gap-1">
            <span className="text-xl font-bold text-foreground">{commSummary?.l2_count || 0}</span>
            <span className="text-base text-muted-foreground">L2佣金 ({userRankInfo?.l2Ratio || 6}%)</span>
          </div>
        </div>
      </div>

      {/* 积分余额 */}
      <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-2">
          <div className="i-mdi-star-circle text-3xl text-primary" />
          <span className="text-2xl font-bold text-foreground">{rankData?.points || 0}</span>
          <span className="text-base text-muted-foreground">我的积分</span>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-2">
          <div className="i-mdi-wallet text-3xl text-primary" />
          <span className="text-2xl font-bold text-foreground">¥{Number(rankData?.balance || 0).toFixed(2)}</span>
          <span className="text-base text-muted-foreground">金豆余额</span>
        </div>
      </div>

      {/* 二级锁客说明 */}
      <div className="mx-4 mt-4 p-4 bg-muted rounded-2xl">
        <div className="flex items-start gap-2 mb-3">
          <div className="i-mdi-link-variant text-2xl text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xl font-bold text-foreground">二级锁客机制</p>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { icon: 'i-mdi-account-plus', text: `L1：好友用你的推广码注册，你获得其消费 ${userRankInfo?.l1Ratio || 15}% 佣金` },
            { icon: 'i-mdi-account-group', text: `L2：L1下线再邀请好友，你获得新好友消费 ${userRankInfo?.l2Ratio || 6}% 佣金` },
            { icon: 'i-mdi-trending-up', text: '段位越高，佣金比例越大，升段永久生效' },
            { icon: 'i-mdi-lock', text: '推广链条永久绑定，分享文章也可锁定下线' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className={`${item.icon} text-xl text-primary flex-shrink-0 mt-0.5`} />
              <span className="text-base text-muted-foreground leading-relaxed">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 直推团队 */}
      {directTeam.length > 0 && (
        <div className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <div className="i-mdi-account-group text-2xl text-primary" />
            <span className="text-xl font-bold text-foreground">我的直推团队</span>
            <span className="text-base text-muted-foreground ml-1">({directTeam.length}人)</span>
          </div>
          {directTeam.slice(0, 5).map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-foreground">{(m.nickname || '侠').charAt(0)}</span>
              </div>
              <div className="flex-1">
                <p className="text-xl text-foreground font-bold">{m.nickname || '江湖侠客'}</p>
                <p className="text-base text-muted-foreground">{m.member_rank}</p>
              </div>
              <span className="text-base text-muted-foreground">{new Date(m.created_at).toLocaleDateString('zh-CN')}</span>
            </div>
          ))}
          {directTeam.length > 5 && (
            <div className="flex items-center justify-center py-3">
              <span className="text-xl text-muted-foreground">还有 {directTeam.length - 5} 位侠客...</span>
            </div>
          )}
        </div>
      )}
    </div>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MyPromotionPage
