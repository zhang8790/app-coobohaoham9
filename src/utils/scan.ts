import Taro from '@tarojs/taro'

interface ScanToProductOptions {
  scanType?: ('barCode' | 'qrCode')[]
  redirect?: boolean
}

const RESULT_PAGE = '/pages/scan-result/index'

/**
 * 统一扫码入口：调起微信扫码 → 跳转/重定向到扫码购物结果页。
 * 取代 index / food-scan / explore / scan-result 四处逐字复制的 scanCode 样板。
 */
export async function scanToProduct(opts: ScanToProductOptions = {}): Promise<void> {
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
