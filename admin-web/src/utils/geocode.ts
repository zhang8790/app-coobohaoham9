/**
 * 正向地理编码（地址文本 → GCJ-02 经纬度）
 *
 * 用途：后台门店表单「填地址自动出坐标」。腾讯地图 WebService 地理编码接口返回的坐标
 * 即 GCJ-02，与本项目 stores 表默认坐标系（src/db/api.ts:333 STORE_COORD_SYSTEM='gcj02'）
 * 完全一致，无需任何坐标转换，填进 lat/lng 即可在小程序算出正确距离。
 *
 * 为什么用 JSONP：admin-web 是纯浏览器端，腾讯 WebService API 不支持现代浏览器的 CORS，
 * 但支持 output=jsonp + callback 回调，故用动态 <script> 注入绕过跨域。
 *
 * 注意：浏览器端会暴露 key（与小程序端同源，沿用现状）。若后台域名被腾讯 key 的
 * 「授权域名/IP」白名单拦截，需在腾讯地图控制台放开；或改用服务端 Edge Function 代理。
 */
const TENCENT_MAP_KEY = 'D63BZ-GLHCL-XUIPF-EI7QI-6OK6S-7IB3Q'

export interface GeoPoint {
  lat: number
  lng: number
}

export function geocodeAddress(address: string): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    const addr = (address || '').trim()
    if (!addr) {
      resolve(null)
      return
    }

    const cb = '__qq_geocode_cb_' + Date.now() + Math.floor(Math.random() * 1e6)
    const script = document.createElement('script')
    let timer: any = null

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      try {
        delete (window as any)[cb]
      } catch {
        /* ignore */
      }
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    ;(window as any)[cb] = (res: any) => {
      cleanup()
      if (res && res.status === 0 && res.result && res.result.location) {
        const loc = res.result.location
        const lat = Number(loc.lat)
        const lng = Number(loc.lng)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          resolve({ lat, lng })
          return
        }
      }
      resolve(null)
    }

    script.onerror = () => {
      cleanup()
      resolve(null)
    }

    // 8s 超时兜底，避免 script 挂起导致按钮一直转圈
    timer = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 8000)

    const url =
      `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(addr)}` +
      `&key=${TENCENT_MAP_KEY}&output=jsonp&callback=${cb}`
    script.src = url
    document.head.appendChild(script)
  })
}
