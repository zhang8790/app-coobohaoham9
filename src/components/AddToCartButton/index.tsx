// 共享加购按钮：全站统一（门店详情 / 首页 Feed / 自营页 等复用）。
// 赭红圆形 + 白色购物袋图标，确保「行囊」加购入口的视觉与交互 100% 一致，
// 避免出现「门店详情用 cart-plus、Feed 用 bag」这类图标/形状不统一的问题。
import { View } from '@tarojs/components'
import { useState } from 'react'
import Icon from '@/components/Icon'

export interface AddToCartButtonProps {
  onAdd: () => void
  adding?: boolean
  size?: number
  disabled?: boolean
}

export default function AddToCartButton({
  onAdd,
  adding = false,
  size = 36,
  disabled = false,
}: AddToCartButtonProps) {
  const [pressed, setPressed] = useState(false)
  const iconSize = Math.max(14, Math.round(size * 0.5))
  return (
    <View
      hoverClass="none"
      onClick={(e) => { e.stopPropagation(); if (!disabled && !adding) onAdd() }}
      onTouchStart={() => { if (!disabled) setPressed(true) }}
      onTouchEnd={() => setPressed(false)}
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        backgroundColor: disabled ? 'hsl(var(--muted-foreground) / 0.35)' : 'hsl(var(--brand-ochre))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        boxShadow: '0 4px 12px rgba(194,65,12,0.35)',
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        transition: 'transform 0.12s ease',
      }}
    >
      {adding
        ? <Icon name="loading" size={iconSize} className="text-white animate-spin" />
        : <Icon name="bag" size={iconSize} className="text-white" />}
    </View>
  )
}
