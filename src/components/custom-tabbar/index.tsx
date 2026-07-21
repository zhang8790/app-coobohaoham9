import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { useCartCount, refreshCartCount } from '@/utils/cartStore'
import './index.scss'

// 去 AI 化手绘风底部导航
// 注意：微信小程序 WXML 不支持 <svg> 标签，故图标以 base64 svg 经 <Image> 渲染
// （图标由 scripts 思路生成：赭红=选中，中墨=未选）

const TABS = [
  { key: 'home', label: '首页', path: '/pages/index/index' },
  { key: 'explore', label: '自营', path: '/pages/explore/index' },
  { key: 'reward', label: '品牌馆', path: '/pages/reward-shop/index' },
  { key: 'cart', label: '行囊', path: '/pages/cart/index' },
  { key: 'user', label: '侠客', path: '/pages/user/index' },
] as const

type TabKey = typeof TABS[number]['key']

const TAB_ICONS_ACTIVE: Record<string, string> = {
  home: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjQTg1NTJFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDkgMzIgI0E4NTUyRSAxNyAyMSwyOCAxMywzMiAxMSAjQTg1NTJFIDM2IDEzLDQ3IDIyLDU1IDMyIi8+PHBhdGggZD0iTSAxNSAzMiBMIDE0LjUgNTIgTCA0OSA1MS41IEwgNDguNSAzMiIvPjxwYXRoIGQ9Ik0gMjcgNTIgTCAyNy41IDQxIEwgMzYgNDEuMiBMIDM2IDUyIi8+PC9zdmc+',
  explore: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjQTg1NTJFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDExIDE5IEwgMjMgMTkgTCAyNyAzMiBMIDIzIDQ1IEwgMTEgNDUgWiIvPjxwYXRoIGQ9Ik0gMjcgMzIgTCA0MSAzMiIvPjxwYXRoIGQ9Ik0gNDEgMTkgTCA1MyAxOSBMIDUzIDQ1IEwgNDEgNDUgTCA0MSAxOSIvPjxjaXJjbGUgY3g9IjE3IiBjeT0iMTkiIHI9IjEuNCIgZmlsbD0iI0E4NTUyRSIvPjxjaXJjbGUgY3g9IjQ3IiBjeT0iMTkiIHI9IjEuNCIgZmlsbD0iI0E4NTUyRSIvPjwvc3ZnPg==',
  reward: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjQTg1NTJFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDEyIDI2IEwgNTIgMjYgTCA1MCA1MiBMIDE0IDUyIFoiLz48cGF0aCBkPSJNIDEwIDIyIEwgNTQgMjIgTCA1MyAyNiBMIDExIDI2IFoiLz48cGF0aCBkPSJNIDMyIDIyIEwgMzIgNTIiLz48cGF0aCBkPSJNIDI1IDE2ICNBODU1MkUgMjIgMTYsMjIgMjIsMjggMjIgI0E4NTUyRSAzMSAyMiwzMiAxOSwzMiAxNyIvPjxwYXRoIGQ9Ik0gMzkgMTYgI0E4NTUyRSA0MiAxNiw0MiAyMiwzNiAyMiAjQTg1NTJFIDMzIDIyLDMyIDE5LDMyIDE3Ii8+PC9zdmc+',
  cart: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjQTg1NTJFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDEwIDI0IEwgMTYgNTIgTCA0OCA1MiBMIDU0IDI0Ii8+PHBhdGggZD0iTSAxMCAyNCAjQTg1NTJFIDIwIDIyLDQ0IDIyLDU0IDI0Ii8+PHBhdGggZD0iTSAyMiAyNCAjQTg1NTJFIDIyIDEzLDQyIDEzLDQyIDI0Ii8+PHBhdGggZD0iTSAxOCAzMiBMIDQ2IDMyIiBzdHJva2UtZGFzaGFycmF5PSIyIDMiIG9wYWNpdHk9IjAuNTUiLz48L3N2Zz4=',
  user: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjQTg1NTJFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMzIgMTEgTDE1IDI3IEw0OSAyNyBaIi8+PHBhdGggZD0iTTEzIDI3IEw1MSAyNyIvPjxwYXRoIGQ9Ik0yNiAzMCBRMzIgMzUgMzggMzAiLz48cGF0aCBkPSJNMjEgMzkgUTMyIDM1IDQzIDM5IEw0NiA1NCBMMTggNTQgWiIvPjxwYXRoIGQ9Ik00NyAzNCBMNTcgMjQiLz48L3N2Zz4=',
}

const TAB_ICONS_INACTIVE: Record<string, string> = {
  home: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEM3RTZFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDkgMzIgIzhDN0U2RSAxNyAyMSwyOCAxMywzMiAxMSAjOEM3RTZFIDM2IDEzLDQ3IDIyLDU1IDMyIi8+PHBhdGggZD0iTSAxNSAzMiBMIDE0LjUgNTIgTCA0OSA1MS41IEwgNDguNSAzMiIvPjxwYXRoIGQ9Ik0gMjcgNTIgTCAyNy41IDQxIEwgMzYgNDEuMiBMIDM2IDUyIi8+PC9zdmc+',
  explore: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEM3RTZFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDExIDE5IEwgMjMgMTkgTCAyNyAzMiBMIDIzIDQ1IEwgMTEgNDUgWiIvPjxwYXRoIGQ9Ik0gMjcgMzIgTCA0MSAzMiIvPjxwYXRoIGQ9Ik0gNDEgMTkgTCA1MyAxOSBMIDUzIDQ1IEwgNDEgNDUgTCA0MSAxOSIvPjxjaXJjbGUgY3g9IjE3IiBjeT0iMTkiIHI9IjEuNCIgZmlsbD0iIzhDN0U2RSIvPjxjaXJjbGUgY3g9IjQ3IiBjeT0iMTkiIHI9IjEuNCIgZmlsbD0iIzhDN0U2RSIvPjwvc3ZnPg==',
  reward: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEM3RTZFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDEyIDI2IEwgNTIgMjYgTCA1MCA1MiBMIDE0IDUyIFoiLz48cGF0aCBkPSJNIDEwIDIyIEwgNTQgMjIgTCA1MyAyNiBMIDExIDI2IFoiLz48cGF0aCBkPSJNIDMyIDIyIEwgMzIgNTIiLz48cGF0aCBkPSJNIDI1IDE2ICM4QzdFNkUgMjIgMTYsMjIgMjIsMjggMjIgIzhDN0U2RSAzMSAyMiwzMiAxOSwzMiAxNyIvPjxwYXRoIGQ9Ik0gMzkgMTYgIzhDN0U2RSA0MiAxNiw0MiAyMiwzNiAyMiAjOEM3RTZFIDMzIDIyLDMyIDE5LDMyIDE3Ii8+PC9zdmc+',
  cart: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEM3RTZFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNIDEwIDI0IEwgMTYgNTIgTCA0OCA1MiBMIDU0IDI0Ii8+PHBhdGggZD0iTSAxMCAyNCAjOEM3RTZFIDIwIDIyLDQ0IDIyLDU0IDI0Ii8+PHBhdGggZD0iTSAyMiAyNCAjOEM3RTZFIDIyIDEzLDQyIDEzLDQyIDI0Ii8+PHBhdGggZD0iTSAxOCAzMiBMIDQ2IDMyIiBzdHJva2UtZGFzaGFycmF5PSIyIDMiIG9wYWNpdHk9IjAuNTUiLz48L3N2Zz4=',
  user: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEM3RTZFIiBzdHJva2Utd2lkdGg9IjIuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMzIgMTEgTDE1IDI3IEw0OSAyNyBaIi8+PHBhdGggZD0iTTEzIDI3IEw1MSAyNyIvPjxwYXRoIGQ9Ik0yNiAzMCBRMzIgMzUgMzggMzAiLz48cGF0aCBkPSJNMjEgMzkgUTMyIDM1IDQzIDM5IEw0NiA1NCBMMTggNTQgWiIvPjxwYXRoIGQ9Ik00NyAzNCBMNTcgMjQiLz48L3N2Zz4=',
}

export default function CustomTabBar() {
  const [active, setActive] = useState<TabKey>('home')
  const cartCount = useCartCount()

  useDidShow(() => {
    try {
      const pages = Taro.getCurrentPages()
      const cur = pages[pages.length - 1]
      const path = cur ? `/${(cur as any).route ?? ''}` : ''
      const tab = TABS.find(t => t.path === path)
      if (tab) setActive(tab.key)
    } catch {}
    // 回到 tabBar 时从服务端同步真实购物车件数
    refreshCartCount().catch(() => {})
  })

  // 隐藏原生 tabBar
  useEffect(() => {
    Taro.hideTabBar({ animation: false }).catch(() => {})
    // 挂载时拉取一次真实购物车件数（冷启动初始化）
    refreshCartCount().catch(() => {})
  }, [])

  const onSwitch = (t: typeof TABS[number]) => {
    if (t.key === active) return
    Taro.switchTab({ url: t.path })
  }

  return (
    <View className="ctb">
      {TABS.map(t => {
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
              {/* 行囊（购物车）实时件数徽标：订阅全局 cartStore，加购/删改即时同步 */}
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
