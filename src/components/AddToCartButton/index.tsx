// 共享加购按钮：全站统一（门店详情 / 首页 Feed / 自营页 等复用）。
// 品牌绿圆形（hsl(var(--primary)) hsl(var(--primary))）+ 白色购物袋图标，确保「购物车」加购入口的视觉与交互 100% 一致，
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
  size = 44,
  disabled = false,
}: AddToCartButtonProps) {
  const [pressed, setPressed] = useState(false)
  const iconSize = Math.max(14, Math.round(size * 0.5))
  return (
    <View
      hoverClass="none"
      aria-role="button"
      aria-label={disabled ? '加入购物车（已禁用）' : adding ? '正在加入购物车' : '加入购物车'}
      onClick={(e) => { e.stopPropagation(); if (!disabled && !adding) onAdd() }}
      onTouchStart={() => { if (!disabled) setPressed(true) }}
      onTouchEnd={() => setPressed(false)}
      onTouchCancel={() => setPressed(false)}
      style={{
        width: `${size * 2}rpx`,
        height: `${size * 2}rpx`,
        borderRadius: 9999,
        backgroundColor: disabled ? 'rgba(153,153,153,0.35)' : 'hsl(var(--primary-strong))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        boxShadow: '0 4px 12px rgba(192,83,61,0.30)',
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        transition: `transform var(--motion-duration-fast) var(--ease-standard)`,
      }}
    >
      {adding
        ? <Icon name="loading" size={iconSize} className="text-white animate-spin" />
        : <Icon name="bag" size={iconSize} className="text-white" />}
    </View>
  )
}
