// 全局悬浮操作栏 —— 点击展开，不去拖拽
// 入口：四个 Tab 页右下角常驻。点击展开双按钮，再点收起。
import { useState, useCallback, useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { subscribeCartCount, getCartCountState } from '@/utils/cartStore'
import './index.scss'

interface Props {
  cartCount?: number
}

export default function FloatingActionBar({ cartCount: externalCount }: Props) {
  const [internalCount, setInternalCount] = useState(() => getCartCountState())
  const cartCount = externalCount ?? internalCount
  const [expanded, setExpanded] = useState(false)

  useEffect(() => subscribeCartCount(setInternalCount), [])

  const toggle = () => setExpanded(v => !v)
  const close = () => setExpanded(false)

  const goCart = () => { close(); Taro.switchTab({ url: '/pages/cart/index' }) }
  const goConsult = () => { close(); Taro.navigateTo({ url: '/pages/food/consult/index' }) }

  return (
    <View className="fab-container">
      {/* 展开蒙层（点击收起） */}
      {expanded && <View className="fab-overlay" onClick={close} />}

      {/* 子按钮 - 去结算 */}
      <View className={`fab-sub fab-sub--cart ${expanded ? 'fab-sub--show' : ''}`} onClick={goCart}>
        <View className="fab-sub-inner">
          <Text className="fab-sub-icon">🛒</Text>
          <Text className="fab-sub-label">去结算</Text>
          {cartCount > 0 && (
            <View className="fab-sub-badge">
              <Text>{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 子按钮 - 咨询 */}
      <View className={`fab-sub fab-sub--consult ${expanded ? 'fab-sub--show' : ''}`} onClick={goConsult}>
        <View className="fab-sub-inner">
          <Text className="fab-sub-icon">🌿</Text>
          <Text className="fab-sub-label">食疗咨询</Text>
        </View>
      </View>

      {/* 主按钮 */}
      <View className={`fab-main ${expanded ? 'fab-main--active' : ''}`} onClick={toggle}>
        <Text className="fab-main-icon">{expanded ? '✕' : '﹢'}</Text>
        {!expanded && cartCount > 0 && (
          <View className="fab-main-badge">
            <Text>{cartCount > 99 ? '99+' : cartCount}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
