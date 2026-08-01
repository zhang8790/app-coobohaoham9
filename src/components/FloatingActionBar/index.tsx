// 全局悬浮操作栏 —— 两个独立常驻按钮（不拖拽、不展开菜单）
// 入口：四个 Tab 页右下角常驻。客服 / 食疗咨询 各自独立可点。
// 注：结算功能已嵌入「食疗咨询」页内联面板，不在此处。
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import './index.scss'

export default function FloatingActionBar() {
  const goConsult = () => Taro.navigateTo({ url: '/pages/food/consult/index' })

  return (
    <View className="fab-container">
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
