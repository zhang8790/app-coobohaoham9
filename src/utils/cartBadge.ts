import Taro from '@tarojs/taro'
import { getCartCount } from '@/db/api'

/** 刷新底部 Tab 栏"行囊"徽标（index=3）。只在 Tab 页上调用有效 */
export async function updateCartBadge(): Promise<void> {
  try {
    const n = await getCartCount()
    if (n > 0) {
      Taro.setTabBarBadge({ index: 3, text: n > 99 ? '99+' : String(n) })
    } else {
      Taro.removeTabBarBadge({ index: 3 })
    }
  } catch { /* 非 tab 页调用时忽略 */ }
}
