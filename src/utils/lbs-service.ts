/**
 * LBS定位服务（扩展现有功能）
 * 功能：获取用户定位、查找就近门店、城市切换
 * 注意：此文件是新增的，因为原来没有LBS服务
 */

import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'
import { TENCENT_MAP_KEY, TENCENT_MAP_API_BASE } from '@/config/map'

// 城市信息接口
// 注意：线上 cities.id 实际是自增 integer（不是 uuid），这里放宽为 string | number，
// 避免把 'HZ' 这类假 id 传给 campaigns.city_id（integer）查询导致 PostgREST 报错。
export interface CityInfo {
  id: string | number
  city_code: string
  city_name: string
  province: string
  lng: number
  lat: number
  geo_hash: string
  status: string
  config_json: any
  /** 以下为 00226 迁移新增字段，用于城市选择页拼音搜索 / 字母索引 / 热门宫格 */
  pinyin?: string | null
  initial?: string | null
  is_hot?: boolean | null
  sort_order?: number | null
}

// 门店信息接口
export interface StoreInfo {
  id: string
  store_code: string
  store_name: string
  city_id: string
  lng: number
  lat: number
  address: string
  service_radius: number
  business_hours: any
  status: string
  phone: string
  distance_km?: number
  is_open: boolean
}

// 用户位置接口
export interface UserLocation {
  latitude: number
  longitude: number
  city_name?: string
  district?: string
}

/**
 * 获取用户当前定位
 */
export async function getUserLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    Taro.getLocation({
      type: 'gcj02',
      success: (res) => {
        resolve({
          latitude: res.latitude,
          longitude: res.longitude,
        })
      },
      fail: (err) => {
        console.warn('[LBS] 获取定位失败', err)
        reject(err)
      }
    })
  })
}

/**
 * 查找就近门店（调用后端RPC函数）
 */
export async function findNearestStores(
  lat: number,
  lng: number,
  cityId?: string,
  maxDistance: number = 5,
  limit: number = 20
): Promise<StoreInfo[]> {
  try {
    const { data, error } = await supabase.rpc('find_nearest_stores', {
      p_lat: lat,
      p_lng: lng,
      p_city_id: cityId || null,
      p_max_distance_km: maxDistance,
      p_limit: limit,
    })

    if (error) {
      console.error('[LBS] 查找就近门店失败', error)
      return []
    }

    return (data || []).map((store: any) => ({
      id: store.store_id,
      store_name: store.store_name,
      address: store.address,
      distance_km: Math.round(store.distance_km * 100) / 100,
      is_open: store.is_open,
    }))
  } catch (err) {
    console.error('[LBS] 查找就近门店异常', err)
    return []
  }
}

/**
 * 计算两点距离（半正矢公式，前端备用）
 */
export function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * 获取所有城市列表
 *
 * 城市库补全到 250 条后（迁移 00226），每次定位都全表拉取代价明显，
 * 故加两级缓存：进程内存（本次会话）+ Taro Storage（跨会话 24h）。
 * 城市数据是极低频变更的字典数据，缓存收益远大于实时性损失。
 *
 * 注意：排序仍按 city_name 走 DB，不依赖 sort_order 列——这样即使
 * 00226 迁移尚未执行，本函数也不会因缺列报 42703，前端自行按
 * sort_order/initial 做二次排序（缺字段时自动降级）。
 */
const CITY_CACHE_KEY = 'lbs_city_list_v1'
const CITY_CACHE_TTL = 24 * 60 * 60 * 1000
let cityMemoryCache: { t: number; list: CityInfo[] } | null = null

export async function getCityList(forceRefresh = false): Promise<CityInfo[]> {
  const now = Date.now()

  if (!forceRefresh) {
    if (cityMemoryCache && now - cityMemoryCache.t < CITY_CACHE_TTL) return cityMemoryCache.list
    try {
      const cached = Taro.getStorageSync(CITY_CACHE_KEY)
      if (cached?.list?.length && now - cached.t < CITY_CACHE_TTL) {
        cityMemoryCache = cached
        return cached.list
      }
    } catch {
      /* storage 读取失败忽略，走网络 */
    }
  }

  try {
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('status', 'active')
      .order('city_name')

    if (error) {
      console.error('[LBS] 获取城市列表失败', error)
      return cityMemoryCache?.list || []
    }

    const list = data || []
    if (list.length) {
      cityMemoryCache = { t: now, list }
      try { Taro.setStorageSync(CITY_CACHE_KEY, cityMemoryCache) } catch { /* 忽略写入失败 */ }
    }
    return list
  } catch (err) {
    console.error('[LBS] 获取城市列表异常', err)
    return cityMemoryCache?.list || []
  }
}

/**
 * 按城市名取真实城市行（用于把硬编码的兜底城市换成库内真实记录，
 * 保证 currentCity.id 是真实 integer，避免污染 campaigns.city_id 查询）
 */
export async function getCityByName(name: string): Promise<CityInfo | null> {
  if (!name) return null
  const cities = await getCityList()
  return cities.find((c) => c.city_name === name) || null
}

/**
 * 腾讯位置服务逆地址解析（经纬度 → 城市名/地址）。
 * 失败时回退 null，调用方需自行兜底（本项目回退到本地城市表/DEFAULT_CITY）。
 * 注意：真机需在微信后台配置 request 合法域名 https://apis.map.qq.com
 * （开发者工具可临时勾选「不校验合法域名」调试）。
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{ city?: string; address?: string } | null> {
  try {
    const url = `${TENCENT_MAP_API_BASE}/ws/geocoder/v1/?location=${lat},${lng}&key=${TENCENT_MAP_KEY}`
    const res = await Taro.request({ url, method: 'GET' })
    const result = res.data as any
    if (result?.status === 0) {
      const c = result.result?.address_component
      return { city: c?.city, address: result.result?.address }
    }
    return null
  } catch (err) {
    console.warn('[LBS] 逆地址解析失败（已回退）', err)
    return null
  }
}

/** 距城市中心 ≤ 该距离，直接采信坐标匹配结果（省一次逆地址解析网络请求） */
const CITY_TRUST_KM = 40
/** 坐标匹配的最大可信半径：超出则认为该城市未被城市库覆盖，交由上层兜底 */
const CITY_MAX_KM = 150

/** 去掉行政区划后缀，让「杭州市」能匹配库里的「杭州」 */
function normalizeCityName(name: string): string {
  return (name || '').replace(/(市辖区|特别行政区|自治州|自治县|地区|盟|市|县)$/g, '').trim()
}

/**
 * 根据坐标匹配城市
 *
 * 【修复背景】原实现是「全表取最近城市」且**没有距离阈值**，在城市库只有
 * 5 条（上海/北京/广州/成都/深圳）时，杭州的 GPS(30.27,120.15) 会被硬匹配到
 * 160km 外的上海——用户看到的定位城市完全错误，且无任何报错提示。
 *
 * 【新策略】三级判定，兼顾准确性与网络开销：
 *   1. 坐标最近且 ≤40km  → 直接采信（城市中心 40km 内基本可确定就是该市）
 *   2. 否则调腾讯逆地址解析拿真实城市名做精确匹配（跨省误配的唯一可靠解法）
 *   3. 逆地址不可用 → 回退坐标最近，但必须 ≤150km，否则返回 null 让上层兜底
 */
export async function matchCityByLocation(lat: number, lng: number): Promise<CityInfo | null> {
  try {
    const cities = await getCityList()
    if (!cities.length) return null

    let nearestCity: CityInfo | null = null
    let minDistance = Infinity

    for (const city of cities) {
      if (!city.lng || !city.lat) continue
      const dist = calculateDistance(lat, lng, Number(city.lat), Number(city.lng))
      if (dist < minDistance) {
        minDistance = dist
        nearestCity = city
      }
    }

    // 1) 足够近，直接采信
    if (nearestCity && minDistance <= CITY_TRUST_KM) return nearestCity

    // 2) 距离偏远：可能是城市库未覆盖，也可能是跨省误配。用真实城市名兜底校正
    try {
      const geo = await reverseGeocode(lat, lng)
      const gc = normalizeCityName(geo?.city || '')
      if (gc) {
        const exact = cities.find((c) => normalizeCityName(c.city_name) === gc)
        if (exact) return exact
        const fuzzy = cities.find(
          (c) => c.city_name?.includes(gc) || (c.city_name && gc.includes(c.city_name)),
        )
        if (fuzzy) return fuzzy
      }
    } catch {
      /* 逆地址解析失败（未配域名白名单/网络异常）→ 继续走坐标回退 */
    }

    // 3) 坐标回退，但拒绝离谱的跨城误配
    if (nearestCity && minDistance <= CITY_MAX_KM) return nearestCity

    console.warn(`[LBS] 当前位置未被城市库覆盖（最近城市 ${nearestCity?.city_name} 距 ${minDistance.toFixed(0)}km）`)
    return null
  } catch (err) {
    console.error('[LBS] 匹配城市异常', err)
    return null
  }
}

/**
 * 保存用户常用地址
 */
export async function saveUserFrequentAddress(
  userId: string,
  addressType: 'home' | 'company',
  location: UserLocation
) {
  try {
    const key = `frequent_address_${userId}_${addressType}`
    Taro.setStorageSync(key, location)
  } catch (err) {
    console.error('[LBS] 保存常用地址失败', err)
  }
}

/**
 * 获取用户常用地址
 */
export function getUserFrequentAddresses(userId: string) {
  try {
    const home = Taro.getStorageSync(`frequent_address_${userId}_home`)
    const company = Taro.getStorageSync(`frequent_address_${userId}_company`)
    return { home, company }
  } catch (err) {
    console.error('[LBS] 获取常用地址失败', err)
    return {}
  }
}

/**
 * 检查定位权限
 */
export async function checkLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    Taro.getSetting({
      success: (res) => {
        const hasPermission = res.authSetting['scope.userLocation']
        resolve(hasPermission || false)
      },
      fail: () => resolve(false)
    })
  })
}

/**
 * 请求定位权限
 */
export async function requestLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    Taro.authorize({
      scope: 'scope.userLocation',
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}
