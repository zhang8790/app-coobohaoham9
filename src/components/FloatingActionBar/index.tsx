// 全局悬浮操作栏 —— 可拖拽，吸附边缘，双按钮
// ------------------------------------------------------------
// 入口：四个 Tab 页（首页/自营/购物车/我的）右下角常驻。
// 能力：拖拽移动（touch 事件），松手吸附左/右边缘。
//        「食疗咨询」→ 咨询页、「去结算」→ 购物车/立即下单。

import { useState, useRef, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'
import { subscribeCartCount, getCartCountState } from '@/utils/cartStore'
import './index.scss'

interface Props {
  /** 外部覆盖购物车数（不传则内部订阅 cartStore） */
  cartCount?: number
}

const POS_KEY = 'fab_pos_v1'
const BTN_SIZE = 48
const SNAP_THRESHOLD = 20 // 吸附阈值

// 取上次位置（localStorage，跨页保持）
function readPos(): { right: number; bottom: number } {
  try {
    const raw = Taro.getStorageSync(POS_KEY)
    if (raw && typeof raw.right === 'number' && typeof raw.bottom === 'number') return raw
  } catch { /* ignore */ }
  return { right: 20, bottom: 200 }
}
function savePos(p: { right: number; bottom: number }) {
  try { Taro.setStorageSync(POS_KEY, p) } catch { /* ignore */ }
}

export default function FloatingActionBar({ cartCount: externalCount }: Props) {
  const [internalCount, setInternalCount] = useState(() => getCartCountState())
  const cartCount = externalCount ?? internalCount

  useEffect(() => subscribeCartCount(setInternalCount), [])

  const [pos, setPos] = useState(() => readPos())
  const dragging = useRef(false)
  const start = useRef({ x: 0, y: 0, right: 0, bottom: 0 })
  const sysInfo = (Taro.getSystemInfoSync?.() || {}) as any
  const winW = sysInfo.windowWidth || 375

  const onTouchStart = useCallback((e: any) => {
    dragging.current = true
    const t = e.touches?.[0] || {}
    start.current = { x: t.clientX ?? t.x ?? 0, y: t.clientY ?? t.y ?? 0, right: pos.right, bottom: pos.bottom }
  }, [pos])

  const onTouchMove = useCallback((e: any) => {
    if (!dragging.current) return
    const t = e.touches?.[0] || {}
    const dx = (t.clientX ?? t.x ?? 0) - start.current.x
    const dy = (t.clientY ?? t.y ?? 0) - start.current.y
    const nextRight = Math.max(8, Math.min(winW - BTN_SIZE - 8, start.current.right - dx))
    const nextBottom = Math.max(80, start.current.bottom - dy)
    setPos({ right: nextRight, bottom: nextBottom })
  }, [winW])

  const onTouchEnd = useCallback(() => {
    dragging.current = false
    // 吸附左/右边缘
    const mid = (winW - BTN_SIZE) / 2
    const snapped = pos.right > mid ? 20 : winW - BTN_SIZE - 20
    const final = { right: Math.round(snapped), bottom: Math.round(pos.bottom) }
    setPos(final)
    savePos(final)
  }, [pos, winW])

  const goConsult = () => Taro.navigateTo({ url: '/pages/food/consult/index' })
  const goCart = () => Taro.switchTab({ url: '/pages/cart/index' })

  const containerStyle = {
    position: 'fixed' as const,
    right: `${pos.right}px`,
    bottom: `${pos.bottom}px`,
    zIndex: 70,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    transition: dragging.current ? 'none' : 'right 0.25s ease',
  }

  return (
    <View
      style={containerStyle}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* 去结算 */}
      <View
        hoverClass="none"
        onClick={(e: any) => { if (!dragging.current) goCart(); e.stopPropagation() }}
        className="fab-btn fab-btn--cart"
      >
        <Icon name="cart" size={22} color="white" />
        {cartCount > 0 && (
          <View className="fab-badge">
            <Text className="fab-badge-text">{cartCount > 99 ? '99+' : String(cartCount)}</Text>
          </View>
        )}
      </View>

      {/* 食疗咨询 */}
      <View
        hoverClass="none"
        onClick={(e: any) => { if (!dragging.current) goConsult(); e.stopPropagation() }}
        className="fab-btn fab-btn--consult"
      >
        <Icon name="leaf" size={22} color="white" />
      </View>
    </View>
  )
}
