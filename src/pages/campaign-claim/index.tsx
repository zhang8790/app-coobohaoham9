// @title 领取福利（红包/实物）- 合规版
import { useState, useEffect, useCallback } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Text, Input, Button } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import { supabase } from '@/client/supabase'
import './index.scss'

function CampaignClaimPage() {
  const [campaignId, setCampaignId] = useState('')
  const [campaign, setCampaign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [showCompliance, setShowCompliance] = useState(true)  // 合规公示弹窗
  const [agreed, setAgreed] = useState(false)
  const [referrerId, setReferrerId] = useState<string | null>(null)  // 新增：推荐人ID
  const [myCode, setMyCode] = useState('')  // 我的推广码（转发时携带，用于溯源锁客）
  const [payoutMsg, setPayoutMsg] = useState('')  // 红包现金发放结果提示
  const [payoutDone, setPayoutDone] = useState(false)  // 是否已尝试发放

  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params || {}
    if (params.campaignId) {
      setCampaignId(params.campaignId)
      loadCampaign(params.campaignId)
    }
    
    // 新增：从 URL 参数读取推荐人代码
    const refCode = params.ref || params.inviter
    if (refCode) {
      fetchReferrerId(refCode)
    }
  }, [])

  // 新增：根据推荐人代码查询用户ID
  const fetchReferrerId = useCallback(async (refCode: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('invite_code', refCode)
        .maybeSingle()
      
      if (data?.id) {
        setReferrerId(data.id)
        // 暂存到本地，登录后使用
        Taro.setStorageSync('pendingReferralCode', refCode)
      }
    } catch (err) {
      console.error('[Campaign] 查询推荐人失败', err)
    }
  }, [])

  // 获取我自己的推广码，转发红包时携带，好友领取可溯源到推荐人
  useEffect(() => {
    const fetchMine = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('profiles')
          .select('invite_code')
          .eq('id', user.id)
          .maybeSingle()
        if (data?.invite_code) setMyCode(data.invite_code)
      } catch (err) {
        console.error('[Campaign] 获取我的推广码失败', err)
      }
    }
    fetchMine()
  }, [])

  // 确保 openid 存在（真发钱依赖）：profiles.openid 为空时，用 wx.login 获取并写入。
  // 邮箱/手机号登录的用户 openid 为 NULL，不补齐会导致发钱失败。
  useEffect(() => {
    const ensureOpenid = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: prof } = await supabase
          .from('profiles')
          .select('openid')
          .eq('id', user.id)
          .maybeSingle()
        if (prof?.openid) return
        const { code } = await Taro.login()
        if (!code) return
        await supabase.functions.invoke('get-wechat-openid', { body: { code } })
      } catch (err) {
        console.error('[Campaign] 确保 openid 失败', err)
      }
    }
    ensureOpenid()
  }, [])

  // 转发给好友 / 朋友圈：携带 campaignId + 我的推广码
  useShareAppMessage(() => {
    const path = `/pages/campaign-claim/index?campaignId=${campaignId}${myCode ? `&ref=${myCode}` : ''}`
    const title = campaign?.campaign_type === 'redpacket'
      ? `🧧 ${campaign.gift_value}元现金红包，限时免费领！`
      : `🎁 ${campaign?.gift_name || '实物好礼'}，限时免费领！`
    return { title, path, imageUrl: '' }
  })
  useShareTimeline(() => ({
    title: '来店有喜 · 限时福利，速来领取',
    query: `campaignId=${campaignId}${myCode ? `&ref=${myCode}` : ''}`,
  }))

  const loadCampaign = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        Taro.showToast({ title: '活动不存在', icon: 'none' })
        Taro.navigateBack()
        return
      }

      setCampaign(data)
    } catch (err) {
      console.error('[Campaign] 加载活动失败', err)
    }
    setLoading(false)
  }, [])

  // 领取福利
  const handleClaim = useCallback(async () => {
    if (!agreed) {
      Taro.showToast({ title: '请先阅读并同意活动规则', icon: 'none' })
      return
    }

    setClaiming(true)
    try {
      // 使用 supabase.auth.getUser() 获取用户信息（正确方法）
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        Taro.showToast({ title: '请先登录', icon: 'none' })
        setClaiming(false)
        return
      }

      // 安全提取并校验 store_id：必须是合法 UUID 格式，否则传 null（跳过锁客）
      // 防止旧数据（整数ID、空字符串等）传入导致 RPC 的 ::UUID CAST 失败报"门店信息异常"
      const rawStoreId = campaign?.store_id
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const safeStoreId = (typeof rawStoreId === 'string' && uuidRegex.test(rawStoreId))
        ? rawStoreId
        : null

      if (!safeStoreId && rawStoreId != null) {
        console.warn('[Campaign] store_id 格式异常，已跳过锁客:', rawStoreId)
      }

      // 调用后端RPC函数（包含风控逻辑）
      const { data, error } = await supabase.rpc('claim_campaign', {
        p_user_id: user.id,
        p_campaign_id: parseInt(campaignId),
        p_store_id: safeStoreId,  // 只传合法 UUID 或 null
        p_device_id: Taro.getSystemInfoSync().deviceId || null,
        p_referrer_id: referrerId || null,  // 使用查询到的推荐人ID
      })

      if (error) {
        console.error('[Campaign] 领取失败:', error)
        Taro.showToast({ title: '领取失败：' + error.message, icon: 'none' })
        setClaiming(false)
        return
      }

      if (!data?.success) {
        Taro.showToast({ title: data?.error || '领取失败', icon: 'none' })
        setClaiming(false)
        return
      }

      setClaimed(true)

      // 红包类：领取成功后，将真实现金发放至微信零钱
      if (campaign?.campaign_type === 'red_packet') {
        setPayoutDone(true)
        try {
          // 取用户 openid（profiles.openid，登录时由 get-wechat-openid 写入）
          const { data: prof } = await supabase
            .from('profiles')
            .select('openid')
            .eq('id', user.id)
            .maybeSingle()
          const openid = prof?.openid ?? null
          const amountFen = Math.round((Number(campaign.gift_value) || 0) * 100)

          const { data: pay, error: payErr } = await supabase.functions.invoke('send-redpacket', {
            body: {
              campaign_id: parseInt(campaignId),
              openid,
              amount_fen: amountFen,
              claim_id: data?.claim_id ?? null,
            },
          })

          if (payErr) {
            setPayoutMsg('红包已领取，现金发放待处理')
          } else if (pay?.mode === 'live' && pay?.success) {
            setPayoutMsg('🧧 现金红包已发放至您的微信零钱！')
            Taro.showToast({ title: '现金已到账微信零钱', icon: 'success' })
          } else if (pay?.mode === 'manual') {
            setPayoutMsg('🧧 红包已记录，现金将发放至您的微信零钱')
          } else {
            setPayoutMsg(pay?.message || '红包已领取，现金发放待处理')
          }
        } catch (pErr: any) {
          console.error('[Campaign] 发放红包失败', pErr)
          setPayoutMsg('红包已领取，现金发放待处理')
        }
      } else {
        Taro.showToast({ title: '领取成功！已锁定门店关系', icon: 'success' })
      }
    } catch (err: any) {
      console.error('[Campaign] 领取异常:', err)
      Taro.showToast({ title: '领取失败：' + (err.message || '未知错误'), icon: 'none' })
    }
    setClaiming(false)
  }, [agreed, campaignId, campaign, referrerId])

  if (loading) return (
    <RouteGuard>
      <View className="flex items-center justify-center min-h-screen bg-background">
        <View className="i-mdi-loading text-4xl text-primary animate-spin" />
      </View>
    </RouteGuard>
  )

  if (!campaign) return null

  // 已领取成功
  if (claimed) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex flex-col items-center justify-center px-8 gap-6">
        <View className="i-mdi-check-circle text-10xl text-primary" />
        <Text className="text-3xl font-black text-foreground text-center">
          领取成功！
        </Text>
        <Text className="text-xl text-muted-foreground text-center">
          到店核销消费后，推荐人可获得两级推广佣金
        </Text>
        {payoutDone && payoutMsg ? (
          <View className="w-full py-3 rounded-2xl bg-primary/10 border border-primary/30 text-primary text-center text-lg font-semibold">
            {payoutMsg}
          </View>
        ) : null}
        <View
          className="w-full py-4 rounded-2xl bg-primary text-white text-center text-xl font-bold"
          onClick={() => Taro.navigateBack()}
        >
          返回
        </View>
      </View>
    </RouteGuard>
  )

  return (
    <RouteGuard>
      <View className="min-h-screen bg-background">
        {/* 合规公示弹窗 */}
        {showCompliance && (
          <View className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <View className="w-10/12 max-h-3/4 bg-card rounded-3xl p-6 overflow-y-auto">
              <Text className="text-2xl font-bold text-foreground text-center block mb-4">
                活动规则公示
              </Text>
              <View className="gap-3 mb-6">
                <Text className="text-base text-foreground">
                  📌 {campaign.campaign_type === 'redpacket' ? '现金红包' : '实物礼品'}仅门店注册引流福利，注册、成为推广员完全免费，不领取福利也可自主注册。
                </Text>
                <Text className="text-base text-foreground">
                  📌 领取仅记录推荐溯源轨迹，单纯注册、领取福利无任何推广佣金、下线收益。
                </Text>
                <Text className="text-base text-foreground">
                  📌 仅线下本店真实到店核销消费（抵扣后实付满10元），才会产生两级推广佣金。
                </Text>
                <Text className="text-base text-foreground">
                  📌 分销仅两级，无多层返利，禁止以拉人头、注册数量获利。
                </Text>
                <Text className="text-base text-foreground mt-2 pt-2" style={{ borderTop: '1px solid #E7DDD0' }}>
                  ⚠️ 本店员工、亲属、关联账号禁止领取付费红包/实物。
                </Text>
              </View>
              <View className="flex items-center gap-3 mb-4">
                <View
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center ${agreed ? 'bg-primary border-primary' : 'border-border'}`}
                  onClick={() => setAgreed(!agreed)}
                >
                  {agreed && <View className="i-mdi-check text-white text-sm" />}
                </View>
                <Text className="text-base text-foreground">我已阅读并同意活动规则</Text>
              </View>
              <View
                className={`w-full py-3 rounded-2xl text-center text-xl font-bold ${agreed ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
                onClick={() => agreed && setShowCompliance(false)}
              >
                确认领取
              </View>
            </View>
          </View>
        )}

        {/* 活动 banner */}
        <View className="px-4 pt-4 pb-2">
          <View className="claim-gradient-bg rounded-2xl p-6">
            <Text className="text-3xl font-black text-orange-900 block mb-2">
              {campaign.campaign_type === 'redpacket' ? '🧧 领取现金红包' : '🎁 抢实物礼品'}
            </Text>
            <Text className="text-xl text-orange-700">
              {campaign.campaign_type === 'redpacket'
                ? `¥${campaign.gift_value} 现金红包`
                : campaign.gift_name}
            </Text>
          </View>
        </View>

        {/* 活动规则 */}
        <View className="mx-4 mt-4 p-5 rounded-2xl bg-card border border-border">
          <Text className="text-xl font-bold text-foreground mb-3 block">活动规则</Text>
          <View className="gap-2">
            <Text className="text-base text-muted-foreground">• 领取后72小时内到店核销，否则红包失效</Text>
            <Text className="text-base text-muted-foreground">• 单用户单店每日限领1份</Text>
            <Text className="text-base text-muted-foreground">• 仅记录推荐轨迹，核销消费后才激活分佣</Text>
            <Text className="text-base text-muted-foreground">• 分销仅两级，无多层返利</Text>
          </View>
        </View>

        {/* 领取按钮 */}
        <View className="mx-4 mt-6 mb-3">
          <View
            className="w-full py-4 rounded-2xl bg-primary text-white text-center text-2xl font-bold"
            onClick={handleClaim}
          >
            {claiming ? '领取中...' : `立即领取${campaign.campaign_type === 'redpacket' ? '红包' : '实物'}`}
          </View>
        </View>

        {/* 转发按钮：分享给好友一起领，好友领取可溯源到你的推荐关系 */}
        <View className="mx-4 mb-8">
          <Button
            openType="share"
            className="w-full py-4 rounded-2xl bg-card border border-border text-primary text-center text-xl font-bold leading-none"
            style={{ border: '1px solid', padding: 0 }}
          >
            分享给好友一起领 🧧
          </Button>
        </View>
      </View>
    </RouteGuard>
  )
}

export default CampaignClaimPage
