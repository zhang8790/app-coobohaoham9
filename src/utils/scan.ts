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
 * 判断扫码结果是否为「门店二维码」并提取进店 scene 串，非门店码返回 null。
 *
 * ⚠️ 微信平台限制（务必牢记）：小程序内部 wx.scanCode **无法识别「小程序码（太阳码）」**，
 * 太阳码只能由微信客户端「扫一扫 / 长按识别」启动小程序（走启动参数 scene，不经过本函数）。
 * 因此本函数实际只会遇到两类输入：
 *  1) 应用内「扫码购物」扫到的【普通二维码】：result = `s=短码&r=推广码`，命中下方 s= 正则即进店；
 *  2) 旧版 ?store=SHORT 链接形式。
 * 切勿依赖 `res.path.includes('store-home')` 这条分支识别太阳码——那是死分支（wx.scanCode 读不到太阳码的 path）。
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
