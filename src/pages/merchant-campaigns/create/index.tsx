// @title 创建营销活动（发放红包/实物）
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Button } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import { MOOD_CATEGORIES, MOOD_TAGS, MOOD_TAGS_ALL } from '@/utils/mood-tags'
import Icon from '@/components/Icon'

export default function CreateCampaignPage() {
  const [formData, setFormData] = useState({
    campaign_name: '',
    campaign_type: 'red_packet', // redpacket 或 physical
    gift_name: '',
    gift_value: '',
    total_limit: '',
    daily_limit: '',
    start_date: '',
    end_date: '',
    commission_rate: '',
    mood_tags: [] as string[],
  })
  const [loading, setLoading] = useState(false)
  const [activeMoodCategory, setActiveMoodCategory] = useState<string>('positive')

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!formData.campaign_name || !formData.gift_value || !formData.total_limit) {
      Taro.showToast({ title: '请填写必填项', icon: 'none' })
      return
    }

    // 红包金额上限校验：微信「商家转账到零钱」单笔最高 200 元，超限必失败
    if (formData.campaign_type === 'red_packet') {
      const v = parseFloat(formData.gift_value)
      if (isNaN(v) || v <= 0) {
        Taro.showToast({ title: '请输入有效红包金额', icon: 'none' })
        return
      }
      if (v > 200) {
        Taro.showToast({ title: '单笔红包最高 200 元', icon: 'none' })
        return
      }
    }

    setLoading(true)
    try {
      // 获取当前商家的门店ID
      const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', (await supabase.auth.getUser()).data.user?.id)
        .single()

      if (!store) {
        Taro.showToast({ title: '未找到门店', icon: 'none' })
        setLoading(false)
        return
      }

      // 创建营销活动
      const { error } = await supabase
        .from('marketing_campaigns')
        .insert({
          store_id: store.id,
          campaign_name: formData.campaign_name,
          campaign_type: formData.campaign_type,
          gift_name: formData.campaign_type === 'red_packet' ? '现金红包' : formData.gift_name,
          gift_value: parseFloat(formData.gift_value),
          total_limit: parseInt(formData.total_limit),
          daily_limit: parseInt(formData.daily_limit) || 10,
          start_date: formData.start_date || new Date().toISOString().split('T')[0],
          end_date: formData.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          commission_rate: parseFloat(formData.commission_rate) || 0.1,
          mood_tags: formData.mood_tags.length > 0 ? formData.mood_tags : null,
          status: 'active',
          claimed_count: 0,
        })

      if (error) {
        console.error('[CreateCampaign] 创建失败:', error)
        Taro.showToast({ title: '创建失败：' + error.message, icon: 'none' })
      } else {
        Taro.showToast({ title: '创建成功', icon: 'success' })
        setTimeout(() => {
          Taro.navigateBack()
        }, 800)
      }
    } catch (err: any) {
      Taro.showToast({ title: '创建失败：' + err.message, icon: 'none' })
    }
    setLoading(false)
  }

  return (
    <View className="min-h-screen bg-background pb-8">
      {/* 顶部标题 */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">创建营销活动</Text>
        <Text className="text-base text-muted-foreground mt-1">设置红包或实物奖励活动</Text>
      </View>

      {/* 表单 */}
      <View className="px-4 mt-4">
        {/* 活动名称 */}
        <View className="mb-4">
          <Text className="text-base font-bold text-foreground mb-2">活动名称 <Text className="text-destructive">*</Text></Text>
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
            <Input
              className="w-full text-xl text-foreground bg-transparent"
              placeholder="例如：新店开业红包"
              value={formData.campaign_name}
              onInput={(e: any) => handleInputChange('campaign_name', e.detail?.value || '')} />
          </View>
        </View>

        {/* 活动类型 */}
        <View className="mb-4">
          <Text className="text-base font-bold text-foreground mb-2">活动类型</Text>
          <View className="flex gap-3">
            <View className={`flex-1 p-3 rounded-xl border-2 text-center ${
              formData.campaign_type === 'red_packet' ? 'border-primary bg-primary/10' : 'border-border'
            }`}
              onClick={() => handleInputChange('campaign_type', 'red_packet')}>
              <Text className={`text-base font-bold ${formData.campaign_type === 'red_packet' ? 'text-primary' : 'text-foreground'}`}>
                🧧 现金红包
              </Text>
            </View>
            <View className={`flex-1 p-3 rounded-xl border-2 text-center ${
              formData.campaign_type === 'physical' ? 'border-primary bg-primary/10' : 'border-border'
            }`}
              onClick={() => handleInputChange('campaign_type', 'physical')}>
              <Text className={`text-base font-bold ${formData.campaign_type === 'physical' ? 'text-primary' : 'text-foreground'}`}>
                🎁 实物礼品
              </Text>
            </View>
          </View>
        </View>

        {/* 红包金额/礼品名称 */}
        <View className="mb-4">
          <Text className="text-base font-bold text-foreground mb-2">
            {formData.campaign_type === 'red_packet' ? '红包金额(元)' : '礼品名称'} <Text className="text-destructive">*</Text>
          </Text>
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
            <Input
              className="w-full text-xl text-foreground bg-transparent"
              placeholder={formData.campaign_type === 'red_packet' ? '例如：5.00' : '例如：精美茶杯'}
              value={formData.campaign_type === 'red_packet' ? formData.gift_value : formData.gift_name}
              onInput={(e: any) => {
                const value = e.detail?.value || ''
                if (formData.campaign_type === 'red_packet') {
                  handleInputChange('gift_value', value)
                } else {
                  handleInputChange('gift_name', value)
                }
              }} />
          </View>
        </View>

        {/* 发放总数 */}
        <View className="mb-4">
          <Text className="text-base font-bold text-foreground mb-2">发放总数 <Text className="text-destructive">*</Text></Text>
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
            <Input
              className="w-full text-xl text-foreground bg-transparent"
              placeholder="例如：100"
              value={formData.total_limit}
              onInput={(e: any) => handleInputChange('total_limit', e.detail?.value || '')}
              type="number" />
          </View>
        </View>

        {/* 每日限领 */}
        <View className="mb-4">
          <Text className="text-base font-bold text-foreground mb-2">每日限领（份）</Text>
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
            <Input
              className="w-full text-xl text-foreground bg-transparent"
              placeholder="默认10份"
              value={formData.daily_limit}
              onInput={(e: any) => handleInputChange('daily_limit', e.detail?.value || '')}
              type="number" />
          </View>
        </View>

        {/* 佣金比例 */}
        <View className="mb-4">
          <Text className="text-base font-bold text-foreground mb-2">推广佣金比例</Text>
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
            <Input
              className="w-full text-xl text-foreground bg-transparent"
              placeholder="例如：0.1（表示10%）"
              value={formData.commission_rate}
              onInput={(e: any) => handleInputChange('commission_rate', e.detail?.value || '')}
              type="digit" />
          </View>
          <Text className="text-sm text-muted-foreground mt-1">用户核销消费后，推荐人可获得佣金比例</Text>
        </View>

        {/* 情绪标签 */}
        <View className="mb-4">
          <Text className="text-base font-bold text-foreground mb-2">情绪标签（可选）</Text>
          <Text className="text-sm text-muted-foreground mb-3">选择活动传达的情绪，帮助用户更好理解活动氛围</Text>
          
          {/* 情绪分类切换（MOOD_CATEGORIES 的值是中文显示名字符串） */}
          <View className="flex gap-2 mb-3 flex-wrap">
            {Object.keys(MOOD_CATEGORIES).map(cat => (
              <View key={cat}
                className={`px-3 py-2 rounded-xl border-2 transition ${
                  activeMoodCategory === cat ? 'border-primary bg-primary/10' : 'border-border'
                }`}
                onClick={() => setActiveMoodCategory(cat)}>
                <Text className={`text-sm ${activeMoodCategory === cat ? 'text-primary font-bold' : 'text-foreground'}`}>
                  {MOOD_CATEGORIES[cat as keyof typeof MOOD_CATEGORIES]}
                </Text>
              </View>
            ))}
          </View>

          {/* 情绪标签选择（标签来自 MOOD_TAGS[分类]，结构为 MoodTag[]） */}
          <View className="flex gap-2 flex-wrap">
            {(MOOD_TAGS[activeMoodCategory] || []).map(tag => {
              const selected = formData.mood_tags.includes(tag.zh)
              return (
                <View key={tag.zh}
                  className={`px-3 py-2 rounded-full border-2 transition ${
                    selected ? 'border-primary bg-primary/10' : 'border-border'
                  }`}
                  onClick={() => {
                    const tags = selected
                      ? formData.mood_tags.filter(t => t !== tag.zh)
                      : [...formData.mood_tags, tag.zh]
                    setFormData(prev => ({ ...prev, mood_tags: tags }))
                  }}>
                  <Text className={`text-sm ${selected ? 'text-primary font-bold' : 'text-foreground'}`}>
                    {tag.icon} {tag.zh}
                  </Text>
                </View>
              )
            })}
          </View>

          {/* 已选中的情绪标签 */}
          {formData.mood_tags.length > 0 && (
            <View className="mt-3 p-3 bg-primary/5 rounded-xl border-2 border-primary/20">
              <Text className="text-sm font-bold text-primary mb-2">已选中 {formData.mood_tags.length} 个情绪标签：</Text>
              <View className="flex gap-2 flex-wrap">
                {formData.mood_tags.map(tagZh => {
                  const tag = MOOD_TAGS_ALL.find(t => t.zh === tagZh)
                  return (
                    <View key={tagZh} className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: tag?.color + '20', border: `1px solid ${tag?.color}` }}>
                      <Text className="text-sm" style={{ color: tag?.color }}>{tag?.icon} {tagZh}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )}
        </View>

        {/* 提交按钮 */}
        <Button className="!w-full !bg-primary !border-none !rounded-2xl !mt-6"
          onClick={handleSubmit}
          disabled={loading}>
          <View className="py-4 flex items-center justify-center gap-2">
            {loading && <Icon name="loading" size={20} className="text-white animate-spin" />}
            <Text className="text-xl text-white font-bold">{loading ? '创建中...' : '创建活动'}</Text>
          </View>
        </Button>
      </View>
    </View>
  )
}
