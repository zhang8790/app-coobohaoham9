import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { getCityList, getUserLocation, matchCityByLocation } from '@/utils/lbs-service'
import type { City } from '@/db/types'

interface LocationContextValue {
  currentCity: City | null
  currentLocation: { lng: number; lat: number } | null
  loading: boolean
  error: string | null
  setCity: (city: City) => void
  detectLocation: () => Promise<void>
}

const LocationContext = createContext<LocationContextValue | null>(null)

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentCity, setCurrentCity] = useState<City | null>(null)
  const [currentLocation, setCurrentLocation] = useState<{ lng: number; lat: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 从缓存恢复城市
  useEffect(() => {
    const cached = Taro.getStorageSync('currentCity')
    if (cached) {
      setCurrentCity(cached)
    } else {
      // 默认城市：上海
      setCurrentCity({
        id: 1,
        city_code: 'SH',
        city_name: '上海',
        province: '上海市',
        lng: 121.4737,
        lat: 31.2304,
        status: 'active',
        created_at: '',
      } as City)
    }
  }, [])

  // 自动检测定位
  const detectLocation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. 获取用户定位
      const location = await getUserLocation()
      setCurrentLocation(location)

      // 2. 匹配城市
      const city = await matchCityByLocation(location.lng, location.lat)
      
      // 3. 更新城市
      setCurrentCity(city)
      Taro.setStorageSync('currentCity', city)
      
      Taro.showToast({
        title: `已定位到${city.city_name}`,
        icon: 'success',
        duration: 1500,
      })
    } catch (err: any) {
      console.error('[Location] detectLocation error:', err)
      setError(err.message || '定位失败')
      // 定位失败，使用缓存或默认城市
      if (!currentCity) {
        const defaultCity = {
          id: 1,
          city_code: 'SH',
          city_name: '上海',
          province: '上海市',
          lng: 121.4737,
          lat: 31.2304,
          status: 'active',
          created_at: '',
        } as City
        setCurrentCity(defaultCity)
        Taro.setStorageSync('currentCity', defaultCity)
      }
    } finally {
      setLoading(false)
    }
  }, [currentCity])

  // 设置城市（手动选择）
  const setCity = useCallback((city: City) => {
    setCurrentCity(city)
    Taro.setStorageSync('currentCity', city)
  }, [])

  return (
    <LocationContext.Provider value={{
      currentCity,
      currentLocation,
      loading,
      error,
      setCity,
      detectLocation,
    }}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocation() {
  const ctx = useContext(LocationContext)
  if (!ctx) {
    throw new Error('useLocation must be used within LocationProvider')
  }
  return ctx
}
