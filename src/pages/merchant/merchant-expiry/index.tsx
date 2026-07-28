// @title 商家临期预警管理（手机端）
// 复用 getNearExpiryProducts 读 v_near_expiry_products（按本店 store.id 过滤）
// 写 stock_batches.auto_discount_rate（与管理后台 admin-web/Expiry.tsx 同一条写路径，数据自动同步）
import { useState, useCallback } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button, Image, Input } from '@tarojs/components'
import { getNearExpiryProducts, getMerchantStore } from '@/db/api'
import { supabase } from '@/client/supabase'
import type { StoreNearExpiry } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

const STAGE_LABEL: Record<string, string> = {
  red: '紧急',
  orange: '紧迫',
  amber: '临期',
  normal: '正常',
  expired: '已过期',
}
const STAGE_COLOR: Record<string, string> = {
  red: '#DC2626',
  orange: '#EA580C',
  amber: '#D97706',
  normal: '#16A34A',
  expired: '#6B7280',
}

function MerchantExpiryPage() {
  const [list, setList] = useState<StoreNearExpiry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'red' | 'orange' | 'amber'>('all')
  // 编辑中的折扣：{ [batch_id]: number }
  const [editRates, setEditRates] = useState<Record<string, number>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const store = await getMerchantStore().catch(() => null)
      if (!store) {
        Taro.showToast({ title: '请先开通门店', icon: 'none' })
        setLoading(false)
        return
      }
      const data = await getNearExpiryProducts({ storeId: store.id, limit: 200 })
      setList(data || [])
      // 初始化编辑值为当前折扣
      const init: Record<string, number> = {}
      ;(data || []).forEach(e => { init[e.batch_id] = e.auto_discount_rate ?? 0 })
      setEditRates(init)
    } catch (err) {
      console.error('[MerchantExpiry] 加载失败:', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(() => { loadData() })

  const filtered = filter === 'all' ? list : list.filter(e => e.discount_stage === filter)

  const handleSave = async (batchId: string) => {
    const rate = editRates[batchId]
    if (rate === undefined) return
    if (rate < 0 || rate > 90) {
      Taro.showToast({ title: '折扣需在 0-90 之间', icon: 'none' })
      return
    }
    setSavingId(batchId)
    try {
      const { error } = await supabase
        .from('stock_batches')
        .update({ auto_discount_rate: rate, decided_by: 'merchant_manual' })
        .eq('id', batchId)
      if (error) throw error
      Taro.showToast({ title: '已保存', icon: 'success' })
      // 本地同步
      setList(prev => prev.map(e => e.batch_id === batchId ? { ...e, auto_discount_rate: rate, decided_by: 'merchant_manual' } : e))
    } catch (err) {
      console.error('[MerchantExpiry] 保存失败:', err)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <RouteGuard>
      <View className="min-h-screen bg-background pb-8">
        {/* 顶部标题栏 */}
        <View className="flex items-center justify-between px-4 pt-3 pb-2">
          <View className="flex items-center gap-2">
            <Icon name="bell-outline" size={24} className="text-destructive" />
            <Text className="text-xl font-bold text-foreground">临期预警管理</Text>
          </View>
          <Button className="!p-0 !bg-transparent !border-none" onClick={() => { setLoading(true); loadData() }}>
            <Text className="text-base text-primary">刷新</Text>
          </Button>
        </View>

        {/* 分级筛选 Tab */}
        <View className="flex gap-2 px-4 pb-2">
          {([
            { k: 'all', label: `全部 ${list.length}` },
            { k: 'red', label: `紧急 ${list.filter(e => e.discount_stage === 'red').length}` },
            { k: 'orange', label: `紧迫 ${list.filter(e => e.discount_stage === 'orange').length}` },
            { k: 'amber', label: `临期 ${list.filter(e => e.discount_stage === 'amber').length}` },
          ] as const).map(t => (
            <Button
              key={t.k}
              className={`!flex-1 !m-0 !p-0 !rounded-xl !border-none !leading-none ${filter === t.k ? '!bg-destructive' : '!bg-card'}`}
              onClick={() => setFilter(t.k)}>
              <View className="py-2">
                <Text className={`text-base font-bold ${filter === t.k ? 'text-white' : 'text-muted-foreground'}`}>{t.label}</Text>
              </View>
            </Button>
          ))}
        </View>

        {/* 列表 */}
        <View className="px-4 mt-2">
          {loading ? (
            <View className="flex flex-col items-center gap-3 py-16">
              <Icon name="loading" size={36} className="text-primary animate-spin" />
              <Text className="text-base text-muted-foreground">加载中…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View className="flex flex-col items-center gap-3 py-16">
              <Icon name="check-circle-outline" size={48} className="text-success" />
              <Text className="text-base text-muted-foreground">暂无临期商品，库存健康</Text>
            </View>
          ) : (
            <View className="flex flex-col gap-3">
              {filtered.map(e => {
                const eff = e.effective_price ?? (e.price ? e.price * (1 - (e.auto_discount_rate ?? 0) / 100) : 0)
                const stageColor = STAGE_COLOR[e.discount_stage] || '#6B7280'
                const isSaving = savingId === e.batch_id
                return (
                  <View key={e.batch_id} className="bg-card rounded-2xl border border-border p-3">
                    {/* 上半：商品信息 */}
                    <View className="flex gap-3">
                      <View className="w-20 h-20 rounded-xl overflow-hidden bg-background flex-shrink-0">
                        {e.image_url ? (
                          <Image src={e.image_url} mode="aspectFill" style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <View className="w-full h-full flex items-center justify-center">
                            <Icon name="package-variant" size={32} className="text-muted-foreground/30" />
                          </View>
                        )}
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-base font-bold text-foreground line-clamp-2">{e.name}</Text>
                        <View className="flex items-center gap-2 mt-1">
                          <Text className="text-sm text-muted-foreground line-through">¥{e.price?.toFixed(2)}</Text>
                          <Text className="text-lg font-bold" style={{ color: stageColor }}>¥{eff.toFixed(2)}</Text>
                        </View>
                        <View className="flex items-center gap-2 mt-1">
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, background: stageColor }}>
                            <Text className="text-xs text-white font-bold">{STAGE_LABEL[e.discount_stage] || e.discount_stage}</Text>
                          </View>
                          <Text className="text-sm text-muted-foreground">剩 {e.days_left} 天</Text>
                          <Text className="text-sm text-muted-foreground">库存 {e.qty ?? '-'}</Text>
                        </View>
                      </View>
                    </View>

                    {/* 下半：折扣调整 */}
                    <View className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(148,163,184,0.15)' }}>
                      <View className="flex items-center justify-between">
                        <Text className="text-sm text-muted-foreground">当前折扣</Text>
                        <View className="flex items-center gap-2">
                          <Input
                            type="digit"
                            value={String(editRates[e.batch_id] ?? 0)}
                            onInput={(ev) => {
                              const v = Number(ev.detail.value)
                              if (!isNaN(v)) setEditRates(prev => ({ ...prev, [e.batch_id]: v }))
                            }}
                            style={{
                              width: '60px', textAlign: 'center',
                              padding: '4px 8px', borderRadius: 8,
                              border: '1px solid rgba(148,163,184,0.3)',
                              fontSize: '14px', color: 'var(--foreground, #1e293b)',
                            }}
                          />
                          <Text className="text-sm text-muted-foreground">%</Text>
                        </View>
                      </View>
                      {/* 折扣滑块快捷按钮 */}
                      <View className="flex gap-2 mt-2">
                        {[0, 10, 20, 30, 50, 70].map(r => (
                          <Button
                            key={r}
                            className="!flex-1 !m-0 !p-0 !bg-background !border !border-border !rounded-lg !leading-none"
                            onClick={() => setEditRates(prev => ({ ...prev, [e.batch_id]: r }))}>
                            <View className="py-1.5">
                              <Text className="text-xs text-muted-foreground">{r}%</Text>
                            </View>
                          </Button>
                        ))}
                      </View>
                      {/* 保存按钮 + 决策来源 */}
                      <View className="flex items-center justify-between mt-2">
                        <Text className="text-xs text-muted-foreground">
                          {e.decided_by === 'merchant_manual' ? '商家手动' : e.decided_by === 'ai' ? 'AI 决策' : e.ai_reason ? '引擎规则' : '未决策'}
                        </Text>
                        <Button
                          className="!m-0 !p-0 !bg-primary !border-none !rounded-xl !leading-none"
                          onClick={() => handleSave(e.batch_id)}
                          disabled={isSaving}>
                          <View className="px-4 py-1.5">
                            <Text className="text-sm font-bold text-white">{isSaving ? '保存中…' : '保存'}</Text>
                          </View>
                        </Button>
                      </View>
                      {e.ai_reason && (
                        <Text className="text-xs text-muted-foreground mt-1.5 block">{e.ai_reason}</Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* 底部说明 */}
        <View className="px-4 mt-4">
          <Text className="text-xs text-muted-foreground text-center block">
            数据与网页后台实时同步 · 引擎每日自动扫描写入折扣 · 手动调整覆盖引擎决策
          </Text>
        </View>
      </View>
    </RouteGuard>
  )
}

export default MerchantExpiryPage
