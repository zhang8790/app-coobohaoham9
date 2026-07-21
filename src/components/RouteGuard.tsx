import {useCallback, useEffect, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import type {TabBarItem} from '@tarojs/taro'
import {View, Text} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import Icon from '@/components/Icon'

// Public pages that don't require authentication
const PUBLIC_PAGE_PATHS = ['/pages/login/index']

const LOGIN_PAGE_PATH = '/pages/login/index'

// Storage key for saving redirect path after login
export const STORAGE_KEY_REDIRECT_PATH = 'loginRedirectPath'

function getTabBarPages(): string[] {
  const app = Taro.getApp()
  const tabBarList = app?.config?.tabBar?.list || []
  return tabBarList.map((item: TabBarItem) => `/${item.pagePath}`)
}

function isTabBarPage(path: string): boolean {
  const tabBarPages = getTabBarPages()
  return tabBarPages.some((tabBarPath) => path?.includes(tabBarPath))
}

// Throttled navigation to prevent duplicate redirects
let isNavigating = false
function navigateToLogin(currentPath: string): void {
  if (isNavigating) {
    return
  }

  isNavigating = true

  // Save current path for redirect after login
  Taro.setStorageSync(STORAGE_KEY_REDIRECT_PATH, currentPath)
  const navigateMethod = isTabBarPage(currentPath) ? Taro.navigateTo : Taro.redirectTo
  navigateMethod({url: LOGIN_PAGE_PATH})

  // Reset flag after 100ms
  setTimeout(() => {
    isNavigating = false
  }, 100)
}

/**
 * Route guard component for authentication protection
 * Use inline in JSX: <RouteGuard><YourContent /></RouteGuard>
 *
 * @warning DO NOT use the old HOC pattern "export default withRouteGuard(Page)" —
 *   it causes "withRouteGuard is not defined" errors after Taro/Rollup compilation.
 *   Always use this as a JSX component instead.
 */
export function RouteGuard({children}: {children: React.ReactNode}) {
  const {user, loading} = useAuth()
  const [shouldRender, setShouldRender] = useState(false)

  const checkAuth = useCallback(() => {
    const currentPath: string = Taro.getCurrentInstance()?.router?.path || ''

    // Always allow public pages to render (even during loading)
    const isPublic = PUBLIC_PAGE_PATHS.some((publicPath) => currentPath?.includes(publicPath))
    if (isPublic) {
      setShouldRender(true)
      return
    }

    // During loading, don't render anything (prevent flash of unauthenticated content)
    if (loading) {
      setShouldRender(false)
      return
    }

    // Allow access if user is authenticated
    if (user) {
      setShouldRender(true)
      return
    }

    // Not authenticated and not a public page -> redirect to login
    if (currentPath && !currentPath?.includes(LOGIN_PAGE_PATH)) {
      navigateToLogin(currentPath)
      setShouldRender(false)
      return
    }
    setShouldRender(false)
  }, [user, loading])

  // Check auth when page is shown (handles tab switching)
  useDidShow(() => {
    checkAuth()
  })

  // Check auth when component mounts or auth state changes
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // loading 期间只显示加载态；未登录非公开页由 checkAuth 引导跳登录，绝不强制渲染
  if (!shouldRender) {
    return (
      <View className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-8">
        <Icon name="loading" size={36} className="text-primary animate-spin" />
        <Text className="text-base text-muted-foreground">正在检查登录状态...</Text>
      </View>
    )
  }

  return <>{children}</>
}

/**
 * @deprecated Use <RouteGuard> as JSX component instead.
 * This HOC pattern causes "withRouteGuard is not defined" after Taro/Rollup build.
 * Kept only for backward compatibility — do NOT use in new code.
 */
export function withRouteGuard<P extends object>(Component: React.ComponentType<P>) {
  return function GuardedComponent(props: P) {
    return (
      <RouteGuard>
        <Component {...props} />
      </RouteGuard>
    )
  }
}
