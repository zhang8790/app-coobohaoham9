// 全局购物车计数 store —— 解决「加购后角标/数量不同步，需刷新才显示」的问题。
// 设计：模块级单一 count + 订阅池；任何页面加购/改数量/删除都即时 bump，
// 底部自定义 TabBar（CustomTabBar）订阅本 store 自行渲染「行囊」徽标（ctb-badge），
// 不再依赖原生 setTabBarBadge（原生 tabBar 已 hideTabBar 隐藏）。
// 计数语义 = 购物车总件数（Σ quantity），最贴合「购物数量」心智。
import { useState, useEffect } from 'react'

let count = 0
const listeners = new Set<(c: number) => void>()

function emit(next: number) {
  count = Math.max(0, next)
  listeners.forEach(fn => {
    try { fn(count) } catch { /* 忽略单个订阅异常 */ }
  })
  // 注：原生 TabBar 已被 hideTabBar 隐藏，徽标改由 CustomTabBar 订阅本 store 自行渲染（ctb-badge），
  // 不再调用 Taro.setTabBarBadge（对隐藏 tabBar 无效，且会多发一次无效网络请求）。
}

export function getCartCountState(): number {
  return count
}

/** 订阅计数变化；注册时立即回调当前值；返回取消订阅函数 */
export function subscribeCartCount(fn: (c: number) => void): () => void {
  listeners.add(fn)
  fn(count)
  return () => { listeners.delete(fn) }
}

/** 直接设置（一般来自服务端拉取） */
export function setCartCount(n: number): void {
  emit(n)
}

/** 增量更新：加购 +quantity、改数量 ±delta、删除 -quantity */
export function bumpCartCount(delta: number): void {
  emit(count + delta)
}

/** 从服务端重新拉取真实总件数并广播（mount / didShow 时调用） */
export async function refreshCartCount(): Promise<number> {
  // 懒加载避免与 @/db/api 形成循环依赖（api 又 import 本 store 的 bumpCartCount），
  // 杜绝某些打包场景下 bumpCartCount 在 api 模块初始化期被解析为 undefined 的风险。
  const { getCartCount } = await import('@/db/api')
  const n = await getCartCount()
  emit(n)
  return count
}

/** 组件内获取实时购物车计数（响应式） */
export function useCartCount(): number {
  const [c, setC] = useState(count)
  useEffect(() => subscribeCartCount(setC), [])
  return c
}
