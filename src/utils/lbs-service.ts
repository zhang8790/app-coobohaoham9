/**
 * LBS定位服务（扩展现有功能）
 * 功能：获取用户定位、查找就近门店、城市切换
 * 注意：此文件是新增的，因为原来没有LBS服务
 */

import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'

// 城市信息接口
export interface CityInfo {
  id: string
  city_code: string
  city_name: string
  province: string
  lng: number
  lat: number
  geo_hash: string
  status: string
  config_json: any
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
 */
export async function getCityList(): Promise<CityInfo[]> {
  try {
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('status', 'active')
      .order('city_name')

    if (error) {
      console.error('[LBS] 获取城市列表失败', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[LBS] 获取城市列表异常', err)
    return []
  }
}

/**
 * 根据坐标匹配城市
 */
export async function matchCityByLocation(lat: number, lng: number): Promise<CityInfo | null> {
  try {
    const cities = await getCityList()
    if (!cities.length) return null

    let nearestCity: CityInfo | null = null
    let minDistance = Infinity

    for (const city of cities) {
      if (!city.lng || !city.lat) continue
      const dist = calculateDistance(lat, lng, city.lat, city.lng)
      if (dist < minDistance) {
        minDistance = dist
        nearestCity = city
      }
    }

    return nearestCity
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
    console.log(`[LBS] 保存常用地址：${addressType}`, location)
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
