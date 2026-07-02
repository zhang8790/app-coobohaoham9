/**
 * @file Taro application entry file
 */

import { useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import type { PropsWithChildren } from 'react'
import { useTabBarPageClass } from '@/hooks/useTabBarPageClass'

import './app.scss'
import { AuthProvider } from '@/contexts/AuthContext'
import { handleInviterFromQuery } from '@/utils/share'

const App: React.FC = ({ children }: PropsWithChildren<unknown>) => {
  useTabBarPageClass()

  // 每次页面显示时检查推广参数（处理从小程序卡片进入的场景）
  useDidShow(() => {
    handleInviterFromQuery()
  })

  return <AuthProvider>{children}</AuthProvider>
}

export default App
