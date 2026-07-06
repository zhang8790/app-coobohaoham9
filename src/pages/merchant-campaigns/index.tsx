// @title 营销活动管理（红包/实物发放）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { supabase } from '@/client/supabase'

export default function MerchantCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)

  useEffect(() => {
    loadStoreAndCampaigns()
  }, [])

  const loadStoreAndCampaigns = async () => {
    try {
      // 获取当前商家的门店
      const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', (await supabase.auth.getUser()).data.user?.id)
        .single()

      if (store) {
        setStoreId(store.id)
        // 加载该门店的活动
        const { data: campaignsData } = await supabase
          .from('marketing_campaigns')
          .select('*')
          .eq('store_id', store.id)
          .order('created_at', { ascending: false })
        
        setCampaigns(campaignsData || [])
      }
    } catch (err) {
      console.error('[Campaigns] 加载失败:', err)
    }
    setLoading(false)
  }

  const handleCreateCampaign = () => {
    Taro.navigateTo({ url: '/pages/merchant-campaigns/create/index' })
  }

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    try {
      const { error } = await supabase
        .from('marketing_campaigns')
        .update({ status: newStatus })
        .eq('id', id)
      
      if (error) {
        Taro.showToast({ title: '操作失败', icon: 'none' })
      } else {
        Taro.showToast({ title: '操作成功', icon: 'success' })
        loadStoreAndCampaigns()
      }
    } catch (err) {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <View className="i-mdi-loading text-4xl text-primary animate-spin" />
    </View>
  )

  return (
    <View className="min-h-screen bg-background pb-8">
      {/* 顶部标题 */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">营销活动管理</Text>
        <Text className="text-base text-muted-foreground mt-1">管理红包和实物奖励活动</Text>
      </View>

      {/* 创建按钮 */}
      <View className="px-4 mt-4">
        <Button className="!w-full !bg-primary !border-none !rounded-2xl"
          onClick={handleCreateCampaign}>
          <View className="py-3 flex items-center justify-center gap-2">
            <View className="i-mdi-plus text-white text-xl" />
            <Text className="text-base font-bold text-white">创建新活动</Text>
          </View>
        </Button>
      </View>

      {/* 活动列表 */}
      <View className="px-4 mt-4">
        {campaigns.length === 0 ? (
          <View className="bg-card rounded-2xl border border-border p-8 flex flex-col items-center gap-3">
            <View className="i-mdi-gift-outline text-5xl text-muted-foreground/30" />
            <Text className="text-base text-muted-foreground">暂无活动</Text>
            <Text className="text-sm text-muted-foreground/50">点击上方按钮创建第一个活动</Text>
          </View>
        ) : (
          campaigns.map(campaign => (
            <View key={campaign.id} className="bg-card rounded-2xl border border-border p-4 mb-3">
              <View className="flex items-center justify-between mb-2">
                <Text className="text-xl font-bold text-foreground">{campaign.campaign_name}</Text>
                <View className={`px-3 py-1 rounded-full text-sm ${
                  campaign.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  <Text>{campaign.status === 'active' ? '进行中' : '已结束'}</Text>
                </View>
              </View>
              
              <View className="flex items-center gap-4 mb-3">
                <View className="flex items-center gap-1">
                  <View className="i-mdi-gift text-primary" />
                  <Text className="text-base text-foreground">
                    {campaign.campaign_type === 'redpacket' ? '现金红包' : '实物礼品'}
                  </Text>
                </View>
                <View className="flex items-center gap-1">
                  <View className="i-mdi-currency-cny text-primary" />
                  <Text className="text-base text-foreground">¥{campaign.gift_value}</Text>
                </View>
                <View className="flex items-center gap-1">
                  <View className="i-mdi-account-group text-primary" />
                  <Text className="text-base text-foreground">已领{campaign.claimed_count || 0}份</Text>
                </View>
              </View>

              <View className="flex gap-2">
                <Button className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-primary !rounded-xl"
                  onClick={() => handleToggleStatus(campaign.id, campaign.status)}>
                  <View className="py-2 flex items-center justify-center">
                    <Text className="text-sm font-bold text-primary">
                      {campaign.status === 'active' ? '结束活动' : '启动活动'}
                    </Text>
                  </View>
                </Button>
                <Button className="!flex-1 !m-0 !p-0 !bg-primary !border-none !rounded-xl"
                  onClick={() => Taro.navigateTo({ url: `/pages/campaign-claim/index?campaignId=${campaign.id}` })}>
                  <View className="py-2 flex items-center justify-center">
                    <Text className="text-sm font-bold text-white">预览</Text>
                  </View>
                </Button>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  )
}
