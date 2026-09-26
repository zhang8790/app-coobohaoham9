import Taro from '@tarojs/taro'

interface ScanOptions {
  scanType?: ('barCode' | 'qrCode')[]
  redirect?: boolean
}

const RESULT_PAGE = '/pages/food/scan-result/index'

/**
 * 通用「取扫码原始结果」：统一封装 Taro.scanCode 调用，
 * 屏蔽各业务页逐字复制的 scanType / fail 样板，并归一「用户取消 / 异常」为返回 null。
 * 注意：只负责「拿到字符串」，不决定路由/业务——路由与后续处理由各调用方自行实现，
 * 因此 merchant-orders（扫小票码查单）与 merchant-products（扫条码建/查商品）可安全共用。
 * @param opts.scanType 扫码类型，默认条码+二维码
 * @param opts.onlyFromCamera 是否仅相机（如商家建商品扫条形码防误触相册）
 */
export async function scanRaw(opts: {
 scanType?: ('barCode' | 'qrCode')[]
 onlyFromCamera?: boolean
} = {}): Promise<string | null> {
 const { scanType = ['barCode', 'qrCode'], onlyFromCamera = false } = opts
 try {
 const res: any = await Taro.scanCode({
 scanType,
 onlyFromCamera,
 fail: () => {},
 } as any)
 const raw = String(res?.result || '').trim()
 return raw || null
 } catch {
 // 用户取消扫码或异常，统一返回 null
 return null
 }
}

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
