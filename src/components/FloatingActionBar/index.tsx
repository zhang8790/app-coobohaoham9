// 全局悬浮操作栏 —— 三个独立常驻按钮（不拖拽、不展开菜单）
// 入口：四个 Tab 页右下角常驻。客服 / 去结算 / 食疗咨询 各自独立可点。
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { subscribeCartCount, getCartCountState } from '@/utils/cartStore'
import './index.scss'

interface Props {
  cartCount?: number
}

export default function FloatingActionBar({ cartCount: externalCount }: Props) {
  const [internalCount, setInternalCount] = useState(() => getCartCountState())
  const cartCount = externalCount ?? internalCount

  useEffect(() => subscribeCartCount(setInternalCount), [])

  const goCart = () => Taro.switchTab({ url: '/pages/cart/index' })
  const goConsult = () => Taro.navigateTo({ url: '/pages/food/consult/index' })

  return (
    <View className="fab-container">
      {/* 去结算 */}
      <View className="fab-btn fab-btn--cart" onClick={goCart}>
        <Text className="fab-btn-icon">🛒</Text>
        <Text className="fab-btn-label">去结算</Text>
        {cartCount > 0 && (
          <View className="fab-btn-badge">
            <Text>{cartCount > 99 ? '99+' : cartCount}</Text>
          </View>
        )}
      </View>

      {/* 客服（微信原生会话，openType=contact） */}
      <Button openType="contact" className="fab-btn fab-btn--kefu wx-contact-btn" hoverClass="none">
        <Text className="fab-btn-icon">🎧</Text>
        <Text className="fab-btn-label">客服</Text>
      </Button>

      {/* 食疗咨询 */}
      <View className="fab-btn fab-btn--consult" onClick={goConsult}>
        <Text className="fab-btn-icon">🌿</Text>
        <Text className="fab-btn-label">食疗咨询</Text>
      </View>
    </View>
  )
}
