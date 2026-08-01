/**
 * 坐标系转换工具（中国地图偏移修正）
 * ====================================
 * 中国境内存在三套坐标系，互相偏移几百米 ~ 几公里，直接混算距离会出错：
 *   - WGS-84（原始 GPS / 苹果地图 / Google 地图）
 *   - GCJ-02（火星坐标 / 腾讯地图 / 高德地图 / 微信 getLocation）—— 本项目【用户定位】即此
 *   - BD-09（百度地图）
 *
 * 本项目用户定位（WeChat getLocation type:'gcj02'）返回 GCJ-02，
 * 因此【门店坐标必须也是 GCJ-02】距离才算得准。凡手填、或从百度/GPS 拿到的门店坐标，
 * 需先转换到 GCJ-02 再参与距离计算，否则会偏差「几公里」。
 *
 * 标准近似算法，纯函数、无网络依赖。
 */

const PI = Math.PI
const A = 6378245.0                  // 长半轴
const EE = 0.00669342162296594323    // 偏心率平方

function outOfChina(lat: number, lng: number): boolean {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)
}

function transformLat(lng: number, lat: number): number {
  let ret =
    -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat +
    0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLng(lng: number, lat: number): number {
  let ret =
    300.0 + lng + 2.0 * lat + 0.1 * lng * lng +
    0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((lng / 12.0) * PI) + 300.0 * Math.sin((lng / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

/** WGS-84 → GCJ-02 */
export function wgs84ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  if (outOfChina(lat, lng)) return { lat, lng }
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { lat: lat + dLat, lng: lng + dLng }
}

/** GCJ-02 → WGS-84（逆变换，一次迭代已足够精确） */
export function gcj02ToWgs84(lat: number, lng: number): { lat: number; lng: number } {
  if (outOfChina(lat, lng)) return { lat, lng }
  const g = wgs84ToGcj02(lat, lng)
  return { lat: lat - (g.lat - lat), lng: lng - (g.lng - lng) }
}

/** BD-09 → GCJ-02 */
export function bd09ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  const x = lng - 0.0065
  const y = lat - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI)
  return { lat: z * Math.sin(theta), lng: z * Math.cos(theta) }
}

/** GCJ-02 → BD-09 */
export function gcj02ToBd09(lat: number, lng: number): { lat: number; lng: number } {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * Math.PI)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * Math.PI)
  return { lat: z * Math.sin(theta) + 0.006, lng: z * Math.cos(theta) + 0.0065 }
}

export type CoordSystem = 'gcj02' | 'bd09' | 'wgs84'

/** 把任意坐标系的点统一转到 GCJ-02（用户定位所用坐标系） */
export function toGcj02(lat: number, lng: number, from: CoordSystem): { lat: number; lng: number } {
  if (from === 'bd09') return bd09ToGcj02(lat, lng)
  if (from === 'wgs84') return wgs84ToGcj02(lat, lng)
  return { lat, lng }
}
