// 全局「加购成功」提示条 store —— 加购后底部弹出「已加入购物车 · 去结算」，
// 点「去结算」直达购物车结算页（cart 为 tabBar 页，用 switchTab）。
// 设计为模块级单一状态 + 订阅池：任意页面调用 showCartToast() 触发，
// 由挂载在 App 根的 <CartToast /> 订阅渲染（与 cartStore 同模式）。
import { useState, useEffect } from 'react'

export interface CartToastState {
  visible: boolean
  message: string
}

let state: CartToastState = { visible: false, message: '已加入购物车' }
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(s: CartToastState) => void>()

function emit(next: CartToastState) {
  state = next
  listeners.forEach(fn => { try { fn(state) } catch { /* 忽略单个订阅异常 */ } })
}

/** 显示加购成功提示条（默认 3s 后自动隐藏；重复调用会刷新计时） */
export function showCartToast(message = '已加入购物车') {
  if (timer) { clearTimeout(timer); timer = null }
  emit({ visible: true, message })
  timer = setTimeout(() => { timer = null; emit({ visible: false, message }) }, 3000)
}

/** 立即隐藏提示条 */
export function hideCartToast() {
  if (timer) { clearTimeout(timer); timer = null }
  emit({ visible: false, message: state.message })
}

/** 组件内响应式读取提示条状态 */
export function useCartToast(): CartToastState {
  const [s, setS] = useState<CartToastState>(state)
  useEffect(() => {
    const fn = (next: CartToastState) => setS(next)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  return s
}
