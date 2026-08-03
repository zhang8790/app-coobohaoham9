/**
 * @file Taro application entry file
 */
import { View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import type { PropsWithChildren } from 'react'
import { Component, type ReactNode } from 'react'
import { useTabBarPageClass } from '@/hooks/useTabBarPageClass'
import { useSwipeToHome } from '@/hooks/useSwipeToHome'

import './app.scss'
import { AuthProvider } from '@/contexts/AuthContext'
import { LocationProvider } from '@/contexts/LocationContext'
import { FoodTherapyProvider } from '@/contexts/FoodTherapyContext'
import { handleInviterFromQuery } from '@/utils/share'
import CartToast from '@/components/CartToast'
import PrivacyModal from '@/components/PrivacyModal'
import Taro from '@tarojs/taro'
import { reportError, initGlobalErrorCapture } from '@/utils/error-log'
import { useEffect } from 'react'

/**
 * 全局错误边界：任何页面/组件渲染期抛错都不再整页白屏，
 * 而是显示可读的错误文字 + 重试按钮，便于真机定位。
 */
class GlobalErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: any) {
    return { err: e?.stack ? String(e.stack) : (e?.message || String(e)) }
  }
  componentDidCatch(e: any) {
    console.error('[GlobalErrorBoundary] 应用级渲染异常', e)
    reportError(e, { phase: 'GlobalErrorBoundary' })
    try { Taro.reportAnalytics?.('app_crash', { msg: String(e?.message || e) }) } catch { /* ignore */ }
  }
  handleRetry = () => this.setState({ err: null })
  render() {
    if (this.state.err) {
      return (
        <View className="min-h-screen bg-white flex flex-col items-center justify-center p-8" style={{ paddingTop: '120px' }}>
          <Text className="text-3xl text-red-500 font-bold">页面出错了</Text>
          <Text className="text-sm text-gray-500 mt-4 leading-relaxed text-left" style={{ wordBreak: 'break-all' }}>{this.state.err}</Text>
          <View className="mt-8 px-8 py-3 rounded-xl bg-red-500" hoverClass="none" onClick={this.handleRetry}>
            <Text className="text-white font-bold">重试</Text>
          </View>
        </View>
      )
    }
    return this.props.children
  }
}

const App: React.FC = ({ children }: PropsWithChildren<unknown>) => {
  useTabBarPageClass()
  const { onTouchStart, onTouchEnd } = useSwipeToHome()
  useEffect(() => { initGlobalErrorCapture() }, [])

  // 每次页面显示时检查进入参数：
  //  - 小程序码扫码进入（朋友圈海报）→ scene 短码反查图文并锁客
  //  - 普通分享卡片进入 → 处理推广码绑定
  useDidShow((options: any) => {
    // 处理进入小程序的推广码绑定（文章分享码已随创作功能移除，不再有 article 场景分支）
    handleInviterFromQuery()
  })

  return (
    <GlobalErrorBoundary>
      <AuthProvider>
        <LocationProvider>
          <FoodTherapyProvider>
            <View onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              {children}
            </View>
            <CartToast />
            <PrivacyModal />
          </FoodTherapyProvider>
        </LocationProvider>
      </AuthProvider>
    </GlobalErrorBoundary>
  )
}

export default App
