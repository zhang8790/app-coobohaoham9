import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import Taro from '@tarojs/taro'
import { getUserLocation, matchCityByLocation, getCityByName } from '@/utils/lbs-service'
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
  /** 手动选择城市：设城市 + 按该城市坐标重算最近门店（切城市的完整闭环） */
  selectCity: (city: CityInfo) => Promise<void>
  detectLocation: () => Promise<void>
  setStore: (store: NearestStore) => void
  followLocation: () => Promise<void>
}

const LocationContext = createContext<LocationContextValue | null>(null)

// 兜底城市：杭州（业务重心）。city_code 对齐国家行政区划代码，与 cities 表（迁移 00226）一致。
// 注意 id 仅在「城市库尚未就绪」的极端情况下才会被用到——正常路径一律用 resolveDefaultCity()
// 从库里取真实记录，保证 currentCity.id 是真实 integer（campaigns.city_id 是 integer 列，
// 传 'HZ' 这类假 id 会让 PostgREST 查询直接报错）。
const DEFAULT_CITY: CityInfo = {
  id: 0,
  city_code: '330100',
  city_name: '杭州',
  province: '浙江省',
  lng: 120.1551,
  lat: 30.2741,
  geo_hash: '',
  status: 'active',
  config_json: null,
  pinyin: 'hangzhou',
  initial: 'H',
  is_hot: true,
  sort_order: 1,
}

/** 取库内真实的杭州记录；库不可用时回退到硬编码常量 */
async function resolveDefaultCity(): Promise<CityInfo> {
  try {
    return (await getCityByName(DEFAULT_CITY.city_name)) || DEFAULT_CITY
  } catch {
    return DEFAULT_CITY
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentCity, setCurrentCity] = useState<CityInfo | null>(null)
  const [currentLocation, setCurrentLocation] = useState<{ lng: number; lat: number } | null>(null)
  const [currentStore, setCurrentStore] = useState<NearestStore | null>(null)
  const [nearbyStores, setNearbyStores] = useState<NearestStore[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 用 ref 持有 currentCity 最新值，避免 detectLocation 因依赖 currentCity 而反复重装引用（这是首页定位闪烁的根因之一）
  const cityRef = useRef<CityInfo | null>(null)
  cityRef.current = currentCity
  // 定位并发去重：正在定位时重复调用直接返回，杜绝首页 effect 在 nearbyStores 异步就绪前的渲染间隙重复拉 GPS
  const locateInFlightRef = useRef(false)

  // 从缓存恢复
  useEffect(() => {
    const cachedCity = Taro.getStorageSync('currentCity')
    // 旧版本缓存里 id 是 'HZ' 这类假值（老 DEFAULT_CITY 遗留），会污染 campaigns.city_id
    // （integer 列）查询，这里直接判定为无效缓存丢弃，等 detectLocation 重新解析真实记录
    const validCached = cachedCity && Number.isFinite(Number(cachedCity.id)) ? cachedCity : null
    setCurrentCity(validCached || DEFAULT_CITY)
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
    // 并发去重：首页 effect 在 nearbyStores 异步就绪前的渲染间隙可能重复进入，
    // 这里直接拦掉重复调用，避免反复拉 GPS 导致定位 pill 一直闪烁
    if (locateInFlightRef.current) return
    locateInFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      const loc = await getUserLocation()
      // 规范化：currentLocation 统一为 { lng, lat }
      setCurrentLocation({ lng: loc.longitude, lat: loc.latitude })

      // 城市匹配已带距离阈值（≤40km 采信 / 逆地址校正 / ≤150km 回退），
      // 返回 null 表示当前位置未被城市库覆盖，此时才回退到默认城市的真实库记录
      const city = await matchCityByLocation(loc.latitude, loc.longitude)
      const resolvedCity = city || (await resolveDefaultCity())
      setCurrentCity(resolvedCity)
      Taro.setStorageSync('currentCity', resolvedCity)

      // 根据定位切换当前自营门店（最近门店）
      await resolveNearestStore(loc.latitude, loc.longitude)
    } catch (err: any) {
      console.error('[Location] detectLocation error:', err)
      setError(err?.message || '定位失败')
      // 兜底：定位失败（用户拒绝授权/无法获取 GPS）时，仍要用默认城市（杭州）坐标解析最近门店，
      // 保证首页始终有「最近门店商品」可展示，而非降级到全平台。cityRef 为空才设城市，避免重复。
      if (!cityRef.current) {
        const fallbackCity = await resolveDefaultCity()
        setCurrentCity(fallbackCity)
        Taro.setStorageSync('currentCity', fallbackCity)
      }
      try {
        await resolveNearestStore(DEFAULT_CITY.lat, DEFAULT_CITY.lng)
      } catch (e2) {
        console.error('[Location] 兜底解析杭州门店失败（保持降级）:', e2)
      }
    } finally {
      setLoading(false)
      locateInFlightRef.current = false
    }
  }, [resolveNearestStore])

  const setCity = useCallback((city: CityInfo) => {
    setCurrentCity(city)
    Taro.setStorageSync('currentCity', city)
  }, [])

  // 手动选择城市：仅设城市是不够的——用户切到上海却还看到杭州门店会非常割裂，
  // 这里同步按目标城市坐标重算最近门店，保证「城市 → 门店 → 首页商品」整条链路一致
  const selectCity = useCallback(async (city: CityInfo) => {
    setCurrentCity(city)
    Taro.setStorageSync('currentCity', city)
    const lat = Number(city.lat)
    const lng = Number(city.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      await resolveNearestStore(lat, lng)
    }
  }, [resolveNearestStore])

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
      selectCity,
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
