import Taro from '@tarojs/taro'

interface ScanOptions {
  scanType?: ('barCode' | 'qrCode')[]
  redirect?: boolean
}

const RESULT_PAGE = '/pages/food/scan-result/index'

/**
 * 判断扫码结果是否为「门店二维码」（小程序码 / 链接形式均可识别）
 * - 小程序码被 wx.scanCode 识别时，path 会带 store-home，result/query 含 scene=s=短码
 * - 兼容旧版 ?store= 链接形式
 * 返回可用于进店的 scene 串，或 null 表示非门店码。
 */
function detectStoreScene(res: any): string | null {
  try {
    const result: string = res?.result || ''
    const path: string = res?.path || ''
    const queryScene: string = res?.query?.scene || ''

    // 1) 指向门店页的小程序码：path 带 store-home
    if (path.includes('store-home')) {
      return queryScene || result || null
    }
    // 2) scene 含门店短码 s=XXXX（4~12 位字母数字）
    const sceneSrc = queryScene || result
    const m = sceneSrc.match(/s=([A-Za-z0-9]{4,12})/i)
    if (m) {
      return sceneSrc
    }
    // 3) 旧版链接 ?store=SHORT
    const u = result.match(/[?&]store=([A-Za-z0-9]{4,12})/i)
    if (u) {
      return `s=${u[1]}`
    }
  } catch {
    // 解析异常视为非门店码
  }
  return null
}

/**
 * 通用扫码入口：
 * 1) 若扫到门店二维码 → 进入门店页（store-home 内自动锁客）
 * 2) 否则 → 跳转食材/商品扫码结果页（保持原行为）
 */
export async function scanAndRoute(opts: ScanOptions = {}): Promise<void> {
  const { scanType = ['barCode', 'qrCode'], redirect = false } = opts
  try {
    const res: any = await Taro.scanCode({
      scanType,
      fail: () => {},
    } as any)
    if (!res?.result && !res?.path) return

    // 优先识别门店二维码
    const scene = detectStoreScene(res)
    if (scene) {
      const target = `/pages/store-home/index?scene=${encodeURIComponent(scene)}`
      if (redirect) Taro.redirectTo({ url: target })
      else Taro.navigateTo({ url: target })
      return
    }

    // 否则走原食材/商品扫码流程
    const url = `${RESULT_PAGE}?code=${encodeURIComponent(res.result)}`
    if (redirect) Taro.redirectTo({ url })
    else Taro.navigateTo({ url })
  } catch {
    // 用户取消扫码或异常，静默处理
  }
}

/**
 * 仅食材/商品扫码（保持旧行为，供明确只扫商品/食材的入口使用）
 * 取代 index / food-scan / explore / scan-result 四处逐字复制的 scanCode 样板。
 */
export async function scanToProduct(opts: ScanOptions = {}): Promise<void> {
  const { scanType = ['barCode', 'qrCode'], redirect = false } = opts
  try {
    const res = await Taro.scanCode({
      scanType,
      fail: () => {},
    } as any)
    if (!res?.result) return
    const url = `${RESULT_PAGE}?code=${encodeURIComponent(res.result)}`
    if (redirect) Taro.redirectTo({ url })
    else Taro.navigateTo({ url })
  } catch {
    // 用户取消扫码或异常，静默处理
  }
}
