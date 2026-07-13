// 待结算缓存：解决「冷启动 / 热重载后停在支付页、router.params 为空」导致 items 为空的问题。
// 购物车「去结算」与商品详情「立即购买」在跳转前写入；支付页在 params 为空时回退读取。
// 同时落 Taro 本地存储，使微信开发者工具热重载后仍可恢复（内存缓存会被重置）。
import Taro from '@tarojs/taro'

export interface PendingCheckout {
  cartIds?: string[]
  productId?: string
  total?: number
  quantity?: number
}

const KEY = 'pendingCheckout'
let memCache: PendingCheckout | null = null

export function setPendingCheckout(d: PendingCheckout) {
  memCache = d
  try { Taro.setStorageSync(KEY, d) } catch { /* 忽略存储异常 */ }
}

export function getPendingCheckout(): PendingCheckout | null {
  if (memCache && typeof memCache === 'object') return memCache
  try {
    const s = Taro.getStorageSync(KEY)
    if (s && typeof s === 'object') return s as PendingCheckout
  } catch { /* 忽略读取异常 */ }
  return null
}

export function clearPendingCheckout() {
  memCache = null
  try { Taro.removeStorageSync(KEY) } catch { /* 忽略 */ }
}
