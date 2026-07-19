/**
 * @file Taro application entry file
 */
import { View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import type { PropsWithChildren } from 'react'
import { useTabBarPageClass } from '@/hooks/useTabBarPageClass'
import { useSwipeToHome } from '@/hooks/useSwipeToHome'

import './app.scss'
import { AuthProvider } from '@/contexts/AuthContext'
import { LocationProvider } from '@/contexts/LocationContext'
import { FoodTherapyProvider } from '@/contexts/FoodTherapyContext'
import { handleInviterFromQuery } from '@/utils/share'
import PrivacyModal from '@/components/PrivacyModal'

const App: React.FC = ({ children }: PropsWithChildren<unknown>) => {
  useTabBarPageClass()
  const { onTouchStart, onTouchEnd } = useSwipeToHome()

  // 每次页面显示时检查推广参数（处理从小程序卡片进入的场景）
  useDidShow(() => {
    handleInviterFromQuery()
  })

  return (
    <AuthProvider>
      <LocationProvider>
        <FoodTherapyProvider>
          <View onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {children}
          </View>
          <PrivacyModal />
        </FoodTherapyProvider>
      </LocationProvider>
    </AuthProvider>
  )
}

export default App
