/**
 * useSwipeToHome
 * 全局右滑（从左边缘向右滑动）返回首页（pages/index/index）。
 * 在 app.tsx 的根 View 上挂载 onTouchStart/onTouchEnd，
 * 触摸事件会冒泡到该 View，因此无需逐页改造即可全站生效。
 */
import { useRef } from 'react'
import Taro from '@tarojs/taro'

export function useSwipeToHome() {
  const start = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (e: any) => {
    const t = e?.touches?.[0] || e?.changedTouches?.[0]
    if (t) start.current = { x: t.clientX ?? t.pageX, y: t.clientY ?? t.pageY }
  }

  const onTouchEnd = (e: any) => {
    const s = start.current
    start.current = null
    if (!s) return
    const t = e?.changedTouches?.[0]
    if (!t) return
    const endX = t.clientX ?? t.pageX
    const endY = t.clientY ?? t.pageY
    const dx = endX - s.x
    const dy = endY - s.y
    // 仅「左边缘起向右滑」触发：起点靠左 + 横向位移足够 + 横向主导（避免与纵向滚动/内部轮播冲突）
    if (s.x < 40 && dx > 60 && dx > Math.abs(dy)) {
      try {
        const pages = Taro.getCurrentPages()
        const cur = pages[pages.length - 1]
        const route = (cur as any)?.route || ''
        if (route === 'pages/index/index') return // 已在首页，不重复跳转
        Taro.switchTab({ url: '/pages/index/index' })
      } catch {
        Taro.switchTab({ url: '/pages/index/index' })
      }
    }
  }

  return { onTouchStart, onTouchEnd }
}
