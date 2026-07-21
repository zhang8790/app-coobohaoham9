import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'

/**
 * 会员资产条（纯展示，读取现有 tb_balance / commission_balance，不新增任何字段/功能）
 * - 传入 commission 时渲染「金豆 / 佣金」两列资产卡（积分已并入金豆，统一货币为金豆）
 * - 仅传入 beans 时退化为内联单值（金豆），保留历史 +N 微动效
 */
export interface BeanHudProps {
  beans?: number
  commission?: number
  size?: 'sm' | 'md' | 'lg'
}

export default function BeanHud({ beans = 0, commission, size = 'md' }: BeanHudProps) {
  const prev = useRef(beans)
  const [burst, setBurst] = useState<number | null>(null)

  useEffect(() => {
    if (beans > prev.current) {
      setBurst(beans - prev.current)
      const t = setTimeout(() => setBurst(null), 1200)
      prev.current = beans
      return () => clearTimeout(t)
    }
    prev.current = beans
  }, [beans])

  // 两列资产卡模式（金豆 + 佣金，统一货币为金豆）
  if (commission !== undefined) {
    return (
      <View className="bean-hud">
        <View className="bean-hud-row">
          <View className="bean-hud-col">
            <View className="bean-item">
              <View className="bean-icon"><Text className="text-white font-bold text-xs">豆</Text></View>
              <Text className="bean-val gold-text">{beans.toLocaleString()}</Text>
            </View>
            <Text className="bean-label">金豆</Text>
          </View>
          <View className="bean-divider" />
          <View className="bean-hud-col">
            <Text className="bean-val">¥{commission.toFixed(2)}</Text>
            <Text className="bean-label">佣金</Text>
          </View>
        </View>
      </View>
    )
  }

  // 内联单值模式（仅金豆）
  const dim = size === 'sm' ? 14 : size === 'lg' ? 22 : 18
  const textCls = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-base'
  return (
    <View className="relative inline-flex items-center gap-1">
      <Icon name="coin" size={dim} color="hsl(var(--brand-gold))" />
      <Text className={`gold-text font-bold ${textCls}`}>{beans}</Text>
      <Text className="text-muted-foreground text-xs">金豆</Text>
      {burst != null && (
        <View className="bean-burst" style={{ position: 'absolute', left: '50%', top: '-6px' }}>
          <Text className="gold-text text-xs font-bold">+{burst}</Text>
        </View>
      )}
    </View>
  )
}
