// @title 领取福利（红包/实物）- 合规版
import { useState, useEffect, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import { supabase } from '@/client/supabase'

function CampaignClaimPage() {
  const [campaignId, setCampaignId] = useState('')
  const [campaign, setCampaign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [showCompliance, setShowCompliance] = useState(true)  // 合规公示弹窗
  const [agreed, setAgreed] = useState(false)
  const [referrerId, setReferrerId] = useState<string | null>(null)  // 新增：推荐人ID

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

      // 调用后端RPC函数（包含风控逻辑）
      const { data, error } = await supabase.rpc('claim_campaign', {
        p_user_id: user.id,
        p_campaign_id: parseInt(campaignId),
        p_store_id: campaign?.store_id || null,  // 确保是整数或null
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
      Taro.showToast({ title: '领取成功！已锁定门店关系', icon: 'success' })
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
          <View className="rounded-2xl p-6" style={{ background: 'linear-gradient(160deg,#FEF3C7 0%,#FDE68A 100%)' }}>
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
        <View className="mx-4 mt-6 mb-8">
          <View
            className="w-full py-4 rounded-2xl bg-primary text-white text-center text-2xl font-bold"
            onClick={handleClaim}
          >
            {claiming ? '领取中...' : `立即领取${campaign.campaign_type === 'redpacket' ? '红包' : '实物'}`}
          </View>
        </View>
      </View>
    </RouteGuard>
  )
}

export default CampaignClaimPage
