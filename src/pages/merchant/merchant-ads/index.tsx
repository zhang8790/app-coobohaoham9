// @title 广告投放 / 营销活动（自营门店中心 · 与网页版一一对应）
import { useState, useEffect } from 'react'
import { View, Text, Input, Button, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getMerchantStore, getMerchantCampaigns, createCampaign, updateCampaignStatus } from '@/db/api'
import type { MarketingCampaign, CampaignStatus } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

// 复用内联样式常量（重复字面量提取，行为不变）
const S = {
  mb4: { marginBottom: '4px' },
  mr12: { marginRight: '12px' },
  pad610: { padding: '6px 10px' },
  mt6: { marginTop: '6px' },
  mt2: { marginTop: '2px' },
} as const


type FilterKey = 'all' | 'active' | 'paused' | 'ended'

const TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'paused', label: '已暂停' },
  { key: 'ended', label: '已结束' },
]

const STATUS_LABEL: Record<string, string> = { active: '进行中', paused: '已暂停', ended: '已结束' }
const TYPE_LABEL: Record<string, string> = { redpacket: '现金红包', physical: '实物礼品' }
const TYPE_OPTIONS = ['现金红包', '实物礼品']

const EMPTY_FORM = {
  campaign_name: '', campaign_type: 'redpacket' as 'redpacket' | 'physical', gift_name: '现金红包',
  gift_value: '5', total_limit: '100', daily_limit: '10', start_date: '', end_date: '', commission_rate: '10',
}

const loadCampaigns = (storeId: string) =>
  getMerchantCampaigns(storeId).catch(() => [] as MarketingCampaign[])

function MerchantAdsPage() {
  const [ads, setAds] = useState<MarketingCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const updateForm = (patch: Partial<typeof EMPTY_FORM>) => setForm(f => ({ ...f, ...patch }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const st = await getMerchantStore()
        if (cancelled) return
        if (!st) { setLoading(false); return }
        setStoreId(st.id)
        const list = await loadCampaigns(st.id)
        if (!cancelled) setAds(list)
      } catch (e) {
        console.error('[MerchantAds] 加载失败', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = filter === 'all' ? ads : ads.filter(a => a.status === filter)
  const runningCount = ads.filter(a => a.status === 'active').length
  const totalClaimed = ads.reduce((s, a) => s + (a.claimed_count || 0), 0)

  const reload = async () => { if (storeId) setAds(await loadCampaigns(storeId)) }

  const handleCreate = async () => {
    if (!storeId) return
    if (!form.campaign_name.trim()) return Taro.showToast({ title: '请输入活动名称', icon: 'none' })
    if (!form.start_date || !form.end_date) return Taro.showToast({ title: '请选择活动日期', icon: 'none' })
    setSubmitting(true)
    try {
      await createCampaign(storeId, {
        campaign_name: form.campaign_name.trim(),
        campaign_type: form.campaign_type,
        gift_name: form.gift_name.trim() || '现金红包',
        gift_value: Number(form.gift_value) || 0,
        total_limit: Number(form.total_limit) || 0,
        daily_limit: Number(form.daily_limit) || 0,
        start_date: form.start_date,
        end_date: form.end_date,
        commission_rate: (Number(form.commission_rate) || 0) / 100,
      })
      await reload()
      setShowCreate(false)
      setForm({ ...EMPTY_FORM })
      Taro.showToast({ title: '创建成功', icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '创建失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const setStatus = async (a: MarketingCampaign, status: CampaignStatus) => {
    try {
      await updateCampaignStatus(a.id, status)
      setAds(prev => prev.map(x => x.id === a.id ? { ...x, status } : x))
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '操作失败', icon: 'none' })
    }
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      {/* 头部：标题 + 新建活动 */}
      <View className="px-4 mt-4 flex flex-row items-center justify-between">
        <Text className="text-lg font-bold text-foreground">营销活动</Text>
        <Button
          className={`!m-0 !p-0 !border-none !rounded-xl ${storeId ? '!bg-primary' : '!bg-muted'}`}
          disabled={!storeId}
          onClick={() => setShowCreate(true)}>
          <View className="flex flex-row items-center" style={{ padding: '8px 14px' }}>
            <Icon name="plus" size={16} className="text-white" />
            <Text className="text-sm font-bold text-white" style={{ marginLeft: '4px' }}>新建活动</Text>
          </View>
        </Button>
      </View>

      {!storeId ? (
        <View className="px-4 mt-4">
          <View className="bg-card rounded-2xl border border-border p-8 flex items-center justify-center">
            <Text className="text-base text-muted-foreground">未找到关联门店</Text>
          </View>
        </View>
      ) : (
        <>
          {/* KPI 三宫格 */}
          <View className="px-4 mt-4 flex flex-row">
            {[
              { label: '进行中活动', value: runningCount, color: 'text-primary' },
              { label: '累计已领取', value: totalClaimed, color: 'text-primary' },
              { label: '活动总数', value: ads.length, color: 'text-foreground' },
            ].map((k, i) => (
              <View key={k.label} className="flex-1 bg-card rounded-2xl border border-border" style={{ padding: '16px', marginRight: i < 2 ? '10px' : '0' }}>
                <Text className="text-xs text-muted-foreground">{k.label}</Text>
                <Text className={`text-2xl font-bold ${k.color}`} style={S.mt6}>{k.value}</Text>
              </View>
            ))}
          </View>

          {/* 筛选标签 */}
          <View className="px-4 mt-4 flex flex-row">
            {TABS.map(t => (
              <View key={t.key}
                className={`rounded-xl ${filter === t.key ? 'bg-primary' : 'bg-card border border-border'}`}
                style={{ padding: '6px 14px', marginRight: '8px' }}
                onClick={() => setFilter(t.key)}>
                <Text className={`text-sm ${filter === t.key ? 'text-white' : 'text-muted-foreground'}`}>{t.label}</Text>
              </View>
            ))}
          </View>

          {/* 活动列表 */}
          <View className="px-4 mt-3">
            {filtered.length === 0 ? (
              <View className="bg-card rounded-2xl border border-border p-8 flex items-center justify-center">
                <Text className="text-base text-muted-foreground">暂无营销活动，点击右上角新建</Text>
              </View>
            ) : filtered.map(ad => (
              <View key={ad.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
                <View className="flex flex-row items-start justify-between">
                  <View className="flex-1">
                    <View className="flex flex-row items-center">
                      <View className={`rounded-full ${ad.status === 'active' ? 'bg-primary/10' : 'bg-muted'}`} style={{ padding: '2px 8px' }}>
                        <Text className={`text-xs ${ad.status === 'active' ? 'text-primary' : 'text-muted-foreground'}`}>{STATUS_LABEL[ad.status] || ad.status}</Text>
                      </View>
                      <Text className="text-xs text-muted-foreground" style={{ marginLeft: '8px' }}>{TYPE_LABEL[ad.campaign_type] || ad.campaign_type}</Text>
                    </View>
                    <Text className="text-base font-bold text-foreground" style={S.mt6}>{ad.campaign_name}</Text>
                    <Text className="text-xs text-muted-foreground" style={S.mt2}>{ad.start_date} ~ {ad.end_date}</Text>
                  </View>
                  <View className="flex flex-row">
                    {ad.status === 'active' && (
                      <Button className="!m-0 !p-0 !bg-transparent !border !border-border !rounded-xl" onClick={() => setStatus(ad, 'paused')}>
                        <Text className="text-xs text-muted-foreground" style={S.pad610}>暂停</Text>
                      </Button>
                    )}
                    {ad.status === 'paused' && (
                      <Button className="!m-0 !p-0 !bg-transparent !border !border-primary !rounded-xl" onClick={() => setStatus(ad, 'active')}>
                        <Text className="text-xs text-primary" style={S.pad610}>重启</Text>
                      </Button>
                    )}
                    {ad.status !== 'ended' && (
                      <Button className="!m-0 !p-0 !bg-transparent !border !border-red-500 !rounded-xl" style={{ marginLeft: '6px' }} onClick={() => setStatus(ad, 'ended')}>
                        <Text className="text-xs text-red-500" style={S.pad610}>结束</Text>
                      </Button>
                    )}
                  </View>
                </View>

                {/* 关键指标 */}
                <View className="flex flex-row" style={{ marginTop: '12px' }}>
                  {[
                    { label: '礼品价值', value: `¥${ad.gift_value}` },
                    { label: '发放总量', value: String(ad.total_limit) },
                    { label: '已领取', value: String(ad.claimed_count) },
                    { label: '佣金比例', value: `${Math.round((ad.commission_rate || 0) * 100)}%` },
                  ].map((d, i) => (
                    <View key={d.label} className="flex-1 bg-background rounded-xl" style={{ padding: '8px', marginRight: i < 3 ? '8px' : '0' }}>
                      <Text className="text-xs text-muted-foreground">{d.label}</Text>
                      <Text className="text-sm font-bold text-foreground" style={S.mt2}>{d.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* 新建活动弹窗 */}
      {showCreate && (
        <View className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowCreate(false)} catchMove>
          <View className="w-full bg-card rounded-t-3xl px-4 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <View className="flex flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-foreground">新建营销活动</Text>
              <Button className="!p-0 !bg-transparent !border-none" onClick={() => setShowCreate(false)}>
                <Icon name="close" size={24} className="text-muted-foreground" />
              </Button>
            </View>

            <View className="mb-3">
              <Text className="text-base text-foreground" style={S.mb4}>活动名称 *</Text>
              <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" value={form.campaign_name}
                onInput={e => updateForm({ campaign_name: e.detail.value })} placeholder="如：进店有喜红包" />
            </View>

            <View className="flex flex-row mb-3">
              <View className="flex-1" style={S.mr12}>
                <Text className="text-base text-foreground" style={S.mb4}>活动类型</Text>
                <Picker mode="selector" range={TYPE_OPTIONS}
                  onChange={e => {
                    const t = Number(e.detail.value) === 1 ? 'physical' : 'redpacket'
                    updateForm({ campaign_type: t, gift_name: t === 'redpacket' ? '现金红包' : '' })
                  }}>
                  <View className="border-2 border-input rounded-xl px-3 py-2 text-base">{TYPE_LABEL[form.campaign_type]}</View>
                </Picker>
              </View>
              <View className="flex-1">
                <Text className="text-base text-foreground" style={S.mb4}>礼品名称</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" value={form.gift_name}
                  onInput={e => updateForm({ gift_name: e.detail.value })} placeholder="如：现金红包 / 定制帆布袋" />
              </View>
            </View>

            <View className="flex flex-row mb-3">
              <View className="flex-1" style={S.mr12}>
                <Text className="text-base text-foreground" style={S.mb4}>礼品价值（元）</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" type="digit" value={form.gift_value}
                  onInput={e => updateForm({ gift_value: e.detail.value })} placeholder="5" />
              </View>
              <View className="flex-1">
                <Text className="text-base text-foreground" style={S.mb4}>佣金比例（%）</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" type="digit" value={form.commission_rate}
                  onInput={e => updateForm({ commission_rate: e.detail.value })} placeholder="10" />
              </View>
            </View>

            <View className="flex flex-row mb-3">
              <View className="flex-1" style={S.mr12}>
                <Text className="text-base text-foreground" style={S.mb4}>发放总数</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" type="digit" value={form.total_limit}
                  onInput={e => updateForm({ total_limit: e.detail.value })} placeholder="100" />
              </View>
              <View className="flex-1">
                <Text className="text-base text-foreground" style={S.mb4}>每日限领</Text>
                <Input className="border-2 border-input rounded-xl px-3 py-2 text-base w-full" type="digit" value={form.daily_limit}
                  onInput={e => updateForm({ daily_limit: e.detail.value })} placeholder="10" />
              </View>
            </View>

            <View className="flex flex-row mb-4">
              <View className="flex-1" style={S.mr12}>
                <Text className="text-base text-foreground" style={S.mb4}>开始日期</Text>
                <Picker mode="date" onChange={e => updateForm({ start_date: e.detail.value })}>
                  <View className="border-2 border-input rounded-xl px-3 py-2 text-base">{form.start_date || <Text className="text-muted-foreground">选择日期</Text>}</View>
                </Picker>
              </View>
              <View className="flex-1">
                <Text className="text-base text-foreground" style={S.mb4}>结束日期</Text>
                <Picker mode="date" onChange={e => updateForm({ end_date: e.detail.value })}>
                  <View className="border-2 border-input rounded-xl px-3 py-2 text-base">{form.end_date || <Text className="text-muted-foreground">选择日期</Text>}</View>
                </Picker>
              </View>
            </View>

            <Button className="!w-full !m-0 !p-0 !bg-primary !border-none !rounded-2xl !leading-none" disabled={submitting} onClick={handleCreate}>
              <View className="py-4 text-base font-bold text-white">{submitting ? '提交中…' : '创建'}</View>
            </Button>
          </View>
        </View>
      )}
    </View>
  </RouteGuard>)
}

export default MerchantAdsPage
