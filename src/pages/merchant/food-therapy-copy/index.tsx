// 食疗短视频文案助手（方案⑨）：复用商品食疗引擎，一键生成口播脚本 + AI 视频提示词 + 分镜
import { useState, useEffect, useMemo } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getMerchantStore, getMerchantProducts } from '@/db/api'
import { getFoodIngredients, type FoodIngredientRow } from '@/db/food-safety'
import {
  buildTherapyReport,
  THERAPY_DISCLAIMER,
  type ProductIngredientInput,
  type FoodIngredient,
} from '@/utils/food-therapy/product-therapy'
import { buildVideoCopy } from '@/utils/food-therapy/video-copy'
import type { Product, Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'

export default function FoodTherapyCopyPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [dict, setDict] = useState<FoodIngredientRow[]>([])
  const [copied, setCopied] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      try {
        const s = await getMerchantStore()
        setStore(s)
        const [prods, ing] = await Promise.all([
          s ? getMerchantProducts(s.id) : Promise.resolve([]),
          getFoodIngredients(),
        ])
        setProducts(Array.isArray(prods) ? prods : [])
        setDict(Array.isArray(ing) ? ing : [])
      } catch (e) {
        console.error('[食疗文案助手] 加载失败', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) || null,
    [products, selectedId],
  )

  const therapyReport = useMemo(() => {
    if (!selected) return null
    const dictMap = new Map(dict.map((d) => [d.name, d]))
    const inputs: ProductIngredientInput[] = (selected.ingredients || [])
      .map((name: string) => {
        const row = dictMap.get(name)
        if (!row) return null
        const fi: FoodIngredient = {
          name: row.name,
          nature: row.nature,
          base_effect: row.base_effect ?? null,
          fit_scenes: row.fit_scenes ?? null,
          caution_crowds: row.caution_crowds ?? null,
          allergens: row.allergens ?? null,
          chronic_tags: row.chronic_tags ?? null,
          neutralize: row.neutralize ?? null,
        }
        return { ingredient: fi }
      })
      .filter(Boolean) as ProductIngredientInput[]
    return buildTherapyReport(selected.name, inputs)
  }, [selected, dict])

  const video = useMemo(() => {
    if (!selected) return null
    return buildVideoCopy(selected.name, therapyReport, selected.ingredients || [])
  }, [selected, therapyReport])

  const copy = (key: string, text: string) => {
    if (!text) return
    Taro.setClipboardData({ data: text })
      .then(() => {
        setCopied(key)
        Taro.showToast({ title: '已复制', icon: 'success' })
        setTimeout(() => setCopied(''), 1500)
      })
      .catch(() => Taro.showToast({ title: '复制失败', icon: 'none' }))
  }

  return (
    <RouteGuard>
      <View className="min-h-screen bg-bg px-4 pt-4 pb-10" style={{ background: '#FFFBF7' }}>
        <Text className="text-xl font-bold" style={{ display: 'block' }}>食疗短视频文案助手</Text>
        <Text className="text-xs text-muted-foreground mt-1" style={{ display: 'block', color: '#8C7E6E' }}>
          复用商品食疗引擎，一键生成口播脚本 + AI 视频提示词 + 分镜建议
        </Text>

        {/* 选择商品 */}
        <View className="mt-4 bg-card rounded-xl px-3 py-3" style={{ background: '#FFFFFF' }}>
          <Text className="text-xs text-muted-foreground" style={{ display: 'block', color: '#8C7E6E', marginBottom: 6 }}>选择商品</Text>
          {loading ? (
            <Text className="text-sm text-muted-foreground">加载中…</Text>
          ) : products.length === 0 ? (
            <Text className="text-sm text-muted-foreground">暂无商品，请先到「商品管理」添加</Text>
          ) : (
            <Picker
              mode="selector"
              range={products.map((p) => p.name)}
              onChange={(e) => {
                const idx = Number((e.detail as any).value)
                setSelectedId(products[idx]?.id || '')
              }}
            >
              <View className="flex items-center justify-between">
                <Text className="text-sm font-medium">{selected ? selected.name : '请选择商品'}</Text>
                <Text className="text-muted-foreground" style={{ color: '#8C7E6E' }}>▾</Text>
              </View>
            </Picker>
          )}
        </View>

        {selected && (
          <View className="mt-4 flex flex-col" style={{ gap: 12 }}>
            {(!selected.ingredients || selected.ingredients.length === 0) && (
              <View className="rounded-xl px-3 py-2" style={{ background: '#FEF3C7' }}>
                <Text className="text-xs" style={{ color: '#92400E' }}>
                  该商品尚未配置食材，引擎给出基础文案。建议先到「商品管理」配置食材与占比，文案更精准。
                </Text>
              </View>
            )}

            <CopyCard title="🎬 口播脚本" text={video?.script || ''} copied={copied === 'script'} onCopy={() => copy('script', video?.script || '')} />
            <CopyCard title="🤖 AI 视频提示词" text={video?.prompt || ''} copied={copied === 'prompt'} onCopy={() => copy('prompt', video?.prompt || '')} />
            <CopyCard title="🎞 分镜建议" text={(video?.shots || []).join('\n')} copied={copied === 'shots'} onCopy={() => copy('shots', (video?.shots || []).join('\n'))} />
            <CopyCard title="✨ 海报金句" text={video?.poster || ''} copied={copied === 'poster'} onCopy={() => copy('poster', video?.poster || '')} />

            <Text className="text-[11px] text-muted-foreground mt-1" style={{ display: 'block', color: '#A89A87', whiteSpace: 'normal' }}>
              {THERAPY_DISCLAIMER}
            </Text>
          </View>
        )}
      </View>
    </RouteGuard>
  )
}

function CopyCard({
  title,
  text,
  copied,
  onCopy,
}: {
  title: string
  text: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <View className="bg-card rounded-xl px-3 py-3" style={{ background: '#FFFFFF' }}>
      <View className="flex items-center justify-between mb-2">
        <Text className="font-bold text-sm">{title}</Text>
        <Text className="text-xs" style={{ color: copied ? '#10B981' : '#C2410C' }} onClick={onCopy}>
          {copied ? '已复制 ✓' : '复制'}
        </Text>
      </View>
      <Text className="text-sm leading-relaxed" style={{ whiteSpace: 'pre-wrap', color: '#3A332B' }}>{text}</Text>
    </View>
  )
}
