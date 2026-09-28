import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import { scanAndRoute } from '@/utils/scan'
import './index.scss'

// 中性灰白底部导航（与主题 #F8F8F8 底 / #333·#666 文字层级统一）
// 注意：微信小程序 WXML 不支持 <svg> 标签，故图标以 base64 svg 经 <Image> 渲染
// （图标配色：选中=深炭灰 #333333，未选=中灰 #666666，与 SCSS 文字层级一一对应）

type TabItem = { key: string; label: string; path?: string; center?: boolean }

// 5 项布局：首页 / 好物 / [扫码购物·居中凸起] / 购物车 / 用户
// 扫码购物居中按钮：直接调起扫码 → 门店码进店 / 商品码进 scan-result 加购购车，
// 不进配料安全分析页（扫码即购车，单一动作）。不参与 switchTab。
const TABS: TabItem[] = [
  { key: 'home', label: '首页', path: '/pages/index/index' },
  { key: 'goods', label: '好物', path: '/pages/goods/index' },
  { key: 'scan', label: '扫码购物', center: true },
  { key: 'cart', label: '购物车', path: '/pages/cart/index' },
  { key: 'user', label: '我的', path: '/pages/user/index' },
]

const TAB_ICONS_ACTIVE: Record<string, string> = {
  home: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMUY5RDZCIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDkgMzIgIzFGOUQ2QiAxNyAyMSwyOCAxMywzMiAxMSAjMUY5RDZCIDM2IDEzLDQ3IDIyLDU1IDMyIi8+PHBhdGggZD0iTSAxNSAzMiBMIDE0LjUgNTIgTCA0OSA1MS41IEwgNDguNSAzMiIvPjxwYXRoIGQ9Ik0gMjcgNTIgTCAyNy41IDQxIEwgMzYgNDEuMiBMIDM2IDUyIi8+PC9zdmc+',
  goods: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMUY5RDZCIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDExIDE5IEwgMjMgMTkgTCAyNyAzMiBMIDIzIDQ1IEwgMTEgNDUgWiIvPjxwYXRoIGQ9Ik0gMjcgMzIgTCA0MSAzMiIvPjxwYXRoIGQ9Ik0gNDEgMTkgTCA1MyAxOSBMIDUzIDQ1IEwgNDEgNDUgTCA0MSAxOSIvPjxjaXJjbGUgY3g9IjE3IiBjeT0iMTkiIHI9IjEuNCIgZmlsbD0iIzFGOUQ2QiIvPjxjaXJjbGUgY3g9IjQ3IiBjeT0iMTkiIHI9IjEuNCIgZmlsbD0iIzFGOUQ2QiIvPjwvc3ZnPg==',
  reward: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMUY5RDZCIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDEyIDI2IEwgNTIgMjYgTCA1MCA1MiBMIDE0IDUyIFoiLz48cGF0aCBkPSJNIDEwIDIyIEwgNTQgMjIgTCA1MyAyNiBMIDExIDI2IFoiLz48cGF0aCBkPSJNIDMyIDIyIEwgMzIgNTIiLz48cGF0aCBkPSJNIDI1IDE2ICMxRjlENkIgMjIgMTYsMjIgMjIsMjggMjIgIzFGOUQ2QiAzMSAyMiwzMiAxOSwzMiAxNyIvPjxwYXRoIGQ9Ik0gMzkgMTYgIzFGOUQ2QiA0MiAxNiw0MiAyMiwzNiAyMiAjMUY5RDZCIDMzIDIyLDMyIDE5LDMyIDE3Ii8+PC9zdmc+',
  cart: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMUY5RDZCIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDEwIDI0IEwgMTYgNTIgTCA0OCA1MiBMIDU0IDI0Ii8+PHBhdGggZD0iTSAxMCAyNCAjMUY5RDZCIDIwIDIyLDQ0IDIyLDU0IDI0Ii8+PHBhdGggZD0iTSAyMiAyNCAjMUY5RDZCIDIyIDEzLDQyIDEzLDQyIDI0Ii8+PHBhdGggZD0iTSAxOCAzMiBMIDQ2IDMyIiBzdHJva2UtZGFzaGFycmF5PSIyIDMiIG9wYWNpdHk9IjAuNTUiLz48L3N2Zz4=',
  user: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMUY5RDZCIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMzIgMTEgTDE1IDI3IEw0OSAyNyBaIi8+PHBhdGggZD0iTTEzIDI3IEw1MSAyNyIvPjxwYXRoIGQ9Ik0yNiAzMCBRMzIgMzUgMzggMzAiLz48cGF0aCBkPSJNMjEgMzkgUTMyIDM1IDQzIDM5IEw0NiA1NCBMMTggNTQgWiIvPjxwYXRoIGQ9Ik00NyAzNCBMNTcgMjQiLz48L3N2Zz4=',
}

const TAB_ICONS_INACTIVE: Record<string, string> = {
  home: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS13aWR0aD0iMi42IiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDkgMzIgIzY2NjY2NiAxNyAyMSwyOCAxMywzMiAxMSAjNjY2NjY2IDM2IDEzLDQ3IDIyLDU1IDMyIi8+PHBhdGggZD0iTSAxNSAzMiBMIDE0LjUgNTIgTCA0OSA1MS41IEwgNDguNSAzMiIvPjxwYXRoIGQ9Ik0gMjcgNTIgTCAyNy41IDQxIEwgMzYgNDEuMiBMIDM2IDUyIi8+PC9zdmc+',
  goods: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDExIDE5IEwgMjMgMTkgTCAyNyAzMiBMIDIzIDQ1IEwgMTEgNDUgWiIvPjxwYXRoIGQ9Ik0gMjcgMzIgTCA0MSAzMiIvPjxwYXRoIGQ9Ik0gNDEgMTkgTCA1MyAxOSBMIDUzIDQ1IEwgNDEgNDUgTCA0MSAxOSIvPjxjaXJjbGUgY3g9IjE3IiBjeT0iMTkiIHI9IjEuNCIgZmlsbD0iIzY2NjY2NiIvPjxjaXJjbGUgY3g9IjQ3IiBjeT0iMTkiIHI9IjEuNCIgZmlsbD0iIzY2NjY2NiIvPjwvc3ZnPg==',
  reward: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDEyIDI2IEwgNTIgMjYgTCA1MCA1MiBMIDE0IDUyIFoiLz48cGF0aCBkPSJNIDEwIDIyIEwgNTQgMjIgTCA1MyAyNiBMIDExIDI2IFoiLz48cGF0aCBkPSJNIDMyIDIyIEwgMzIgNTIiLz48cGF0aCBkPSJNIDI1IDE2ICM2NjY2NjYgMjIgMTYsMjIgMjIsMjggMjIgIzY2NjY2NiAzMSAyMiwzMiAxOSwzMiAxNyIvPjxwYXRoIGQ9Ik0gMzkgMTYgIzY2NjY2NiA0MiAxNiw0MiAyMiwzNiAyMiAjNjY2NjY2IDMzIDIyLDMyIDE5LDMyIDE3Ii8+PC9zdmc+',
  cart: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDEwIDI0IEwgMTYgNTIgTCA0OCA1MiBMIDU0IDI0Ii8+PHBhdGggZD0iTSAxMCAyNCAjNjY2NjY2IDIwIDIyLDQ0IDIyLDU0IDI0Ii8+PHBhdGggZD0iTSAyMiAyNCAjNjY2NjY2IDIyIDEzLDQyIDEzLDQyIDI0Ii8+PHBhdGggZD0iTSAxOCAzMiBMIDQ2IDMyIiBzdHJva2UtZGFzaGFycmF5PSIyIDMiIG9wYWNpdHk9IjAuNTUiLz48L3N2Zz4=',
  user: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMzIgMTEgTDE1IDI3IEw0OSAyNyBaIi8+PHBhdGggZD0iTTEzIDI3IEw1MSAyNyIvPjxwYXRoIGQ9Ik0yNiAzMCBRMzIgMzUgMzggMzAiLz48cGF0aCBkPSJNMjEgMzkgUTMyIDM1IDQzIDM5IEw0NiA1NCBMMTggNTQgWiIvPjxwYXRoIGQ9Ik00NyAzNCBMNTcgMjQiLz48L3N2Zz4=',
}

// 居中「扫码购物」按钮图标：白色相机（绿底上唯一能在深色/彩色底保持清晰的自绘图标，替代原先在深底上发糊的 emoji）
const CAMERA_ICON_WHITE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjMuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSI1IiB5PSIxOSIgd2lkdGg9IjU0IiBoZWlnaHQ9IjM2IiByeD0iOCIvPjxwYXRoIGQ9Ik0gMjIgMTkgTCAyNS41IDExIEwgMzguNSAxMSBMIDQyIDE5Ii8+PGNpcmNsZSBjeD0iMzIiIGN5PSIzNyIgcj0iMTEiLz48Y2lyY2xlIGN4PSI1MC41IiBjeT0iMjciIHI9IjEuOCIgZmlsbD0iI0ZGRkZGRiIgc3Ryb2tlPSJub25lIi8+PC9zdmc+'

// 性能：切 tab 即同步购物车件数 → 10s 节流，避免每次切 tab 都打一次网络请求
let lastCartSyncAt = 0

export default function CustomTabBar() {
  const [active, setActive] = useState<string>('home')
  const cartCount = useCartCount()

  useDidShow(() => {
    try {
      const pages = Taro.getCurrentPages()
      const cur = pages[pages.length - 1]
      const path = cur ? `/${(cur as any).route ?? ''}` : ''
      const tab = TABS.find(t => t.path === path)
      if (tab) setActive(tab.key)
    } catch {}
    // 回到 tabBar 时从服务端同步真实购物车件数（10s 节流）
    const now = Date.now()
    if (now - lastCartSyncAt > 10_000) {
      lastCartSyncAt = now
      refreshCartCount().catch(() => {})
    }
  })

  // 隐藏原生 tabBar
  useEffect(() => {
    Taro.hideTabBar({ animation: false }).catch(() => {})
    // 挂载时拉取一次真实购物车件数（冷启动初始化）
    lastCartSyncAt = Date.now()
    refreshCartCount().catch(() => {})
  }, [])

  const onSwitch = (t: TabItem) => {
    if (!t.path || t.key === active) return
    Taro.switchTab({ url: t.path })
  }

  return (
    <View className="ctb">
      {TABS.map(t => {
        // 居中「扫码购物」凸起按钮：直接调起扫码 → 购车链路（门店码进店 / 商品码进 scan-result 加购）
        if (t.center) {
          return (
            <View
              key={t.key}
              className="ctb-item ctb-center"
              hoverClass="ctb-item--hover"
              onClick={() => scanAndRoute()}
            >
              <View className="ctb-center-btn">
                <Image className="ctb-center-icon" src={CAMERA_ICON_WHITE} mode="aspectFit" />
              </View>
              <Text className="ctb-label">{t.label}</Text>
            </View>
          )
        }
        const isActive = t.key === active
        return (
          <View
            key={t.key}
            className={`ctb-item ${isActive ? 'ctb-item--active' : ''}`}
            hoverClass="ctb-item--hover"
            onClick={() => onSwitch(t)}
          >
            <View className="relative flex items-center justify-center">
              <Image
                className="ctb-icon-img"
                src={(isActive ? TAB_ICONS_ACTIVE : TAB_ICONS_INACTIVE)[t.key]}
                mode="aspectFit"
              />
              {/* 购物车（购物车）实时件数徽标：订阅全局 cartStore，加购/删改即时同步 */}
              {t.key === 'cart' && cartCount > 0 && (
                <View className="ctb-badge">{cartCount > 99 ? '99+' : cartCount}</View>
              )}
            </View>
            <Text className="ctb-label">{t.label}</Text>
          </View>
        )
      })}
    </View>
  )
}
