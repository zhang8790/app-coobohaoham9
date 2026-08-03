// 全局悬浮操作栏（全站统一）
// ── 所有页面：右侧边缘停靠把手，按下才向左侧滑出「食养咨询（主入口）/ 客服」；无遮罩、按钮直接可点。
// 注：结算功能已嵌入「食疗咨询」页内联面板，不在此处。
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import './index.scss'

export default function FloatingActionBar() {
  const pages = Taro.getCurrentPages()
  const curRoute = pages.length ? (pages[pages.length - 1]?.route || '') : ''
  const isConsult = curRoute === 'pages/food/consult/index'
  const [open, setOpen] = useState(false)

  const goConsult = () => {
    setOpen(false)
    Taro.navigateTo({ url: '/pages/food/consult/index' })
  }

  // 全站统一：右侧边缘停靠把手，按下才向左侧滑出「食养咨询（主入口）/ 客服」。
  // 无遮罩、按钮直接可点（规避此前浮层点不动的反馈）。
  // 已在「食养咨询」页时，面板只保留客服，避免自指向导航。
  return (
    <View className={['fab-edge', open ? 'fab-edge--open' : ''].join(' ')}>
      {/* 展开面板：停靠在把手左侧，始终可直接点击 */}
      <View className="fab-edge-panel">
        {!isConsult && (
          <View className="fab-edge-item fab-edge-item--consult" hoverClass="none" onClick={goConsult}>
            <Text className="fab-edge-icon">🌿</Text>
            <Text className="fab-edge-label">食养咨询</Text>
          </View>
        )}
        <Button
          openType="contact"
          className="fab-edge-item fab-edge-item--kefu wx-contact-btn"
          hoverClass="none"
          onClick={() => setOpen(false)}
        >
          <Text className="fab-edge-icon">🎧</Text>
          <Text className="fab-edge-label">客服</Text>
        </Button>
      </View>

      {/* 右侧边缘把手：始终可见、贴右边缘，按下展开/收起 */}
      <View className="fab-edge-handle" hoverClass="none" onClick={() => setOpen(v => !v)}>
        <Text className="fab-edge-handle-icon">{open ? '✕' : '🌿'}</Text>
        <Text className="fab-edge-handle-text">{open ? '收起' : '咨询'}</Text>
      </View>
    </View>
  )
}
