import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { getUserLocation, matchCityByLocation } from '@/utils/lbs-service'
import { getNearestStores } from '@/db/api'
import type { NearestStore } from '@/db/api'
import type { CityInfo } from '@/utils/lbs-service'

interface LocationContextValue {
  currentCity: CityInfo | null
  currentLocation: { lng: number; lat: number } | null
  currentStore: NearestStore | null
  nearbyStores: NearestStore[]
  loading: boolean
  error: string | null
  setCity: (city: CityInfo) => void
  detectLocation: () => Promise<void>
  setStore: (store: NearestStore) => void
  followLocation: () => Promise<void>
}

const LocationContext = createContext<LocationContextValue | null>(null)

const DEFAULT_CITY: CityInfo = {
  id: '1',
  city_code: 'SH',
  city_name: '上海',
  province: '上海市',
  lng: 121.4737,
  lat: 31.2304,
  geo_hash: '',
  status: 'active',
  config_json: null,
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentCity, setCurrentCity] = useState<CityInfo | null>(null)
  const [currentLocation, setCurrentLocation] = useState<{ lng: number; lat: number } | null>(null)
  const [currentStore, setCurrentStore] = useState<NearestStore | null>(null)
  const [nearbyStores, setNearbyStores] = useState<NearestStore[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 从缓存恢复
  useEffect(() => {
    const cachedCity = Taro.getStorageSync('currentCity')
    setCurrentCity(cachedCity || DEFAULT_CITY)
    const cachedStore = Taro.getStorageSync('currentStore')
    if (cachedStore) setCurrentStore(cachedStore)
    const cachedNearby = Taro.getStorageSync('nearbyStores')
    if (cachedNearby) setNearbyStores(cachedNearby)
  }, [])

  // 根据定位解析最近的直营门店（升序前 20）
  const resolveNearestStore = useCallback(async (lat: number, lng: number) => {
    try {
      const stores = await getNearestStores(lat, lng, 20)
      if (stores && stores.length) {
        setNearbyStores(stores)
        Taro.setStorageSync('nearbyStores', stores)
        const nearest = stores[0]
        setCurrentStore(nearest)
        Taro.setStorageSync('currentStore', nearest)
      }
    } catch (e) {
      console.error('[Location] resolveNearestStore error:', e)
    }
  }, [])

  // 自动检测定位：城市 + 最近直营门店（按定位切换当前门店）
  const detectLocation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const loc = await getUserLocation()
      // 规范化：currentLocation 统一为 { lng, lat }
      setCurrentLocation({ lng: loc.longitude, lat: loc.latitude })

      const city = await matchCityByLocation(loc.latitude, loc.longitude)
      const resolvedCity = city || DEFAULT_CITY
      setCurrentCity(resolvedCity)
      Taro.setStorageSync('currentCity', resolvedCity)

      Taro.showToast({
        title: `已定位到${resolvedCity.city_name}`,
        icon: 'success',
        duration: 1500,
      })

      // 根据定位切换当前自营门店（最近门店）
      await resolveNearestStore(loc.latitude, loc.longitude)
    } catch (err: any) {
      console.error('[Location] detectLocation error:', err)
      setError(err?.message || '定位失败')
      if (!currentCity) {
        setCurrentCity(DEFAULT_CITY)
        Taro.setStorageSync('currentCity', DEFAULT_CITY)
      }
    } finally {
      setLoading(false)
    }
  }, [currentCity, resolveNearestStore])

  const setCity = useCallback((city: CityInfo) => {
    setCurrentCity(city)
    Taro.setStorageSync('currentCity', city)
  }, [])

  // 手动切换门店（用户选择；下次定位会按 GPS 重新切换）
  const setStore = useCallback((store: NearestStore) => {
    setCurrentStore(store)
    Taro.setStorageSync('currentStore', store)
  }, [])

  // 跟随定位：重新按 GPS 切换最近门店
  const followLocation = useCallback(async () => {
    await detectLocation()
  }, [detectLocation])

  return (
    <LocationContext.Provider value={{
      currentCity,
      currentLocation,
      currentStore,
      nearbyStores,
      loading,
      error,
      setCity,
      detectLocation,
      setStore,
      followLocation,
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
