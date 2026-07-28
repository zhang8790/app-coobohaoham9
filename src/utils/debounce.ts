import { useEffect, useRef, useCallback } from 'react'

/**
 * 防抖工具：避免输入/滚动等高频事件每次都触发网络请求或重计算。
 * - debounce：命令式包装（非 Hook 场景）
 * - useDebouncedCallback：React Hook 场景，组件卸载自动清理定时器
 */

// 命令式防抖：返回带 cancel 的新函数
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait = 300,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
  wrapped.cancel = () => { if (timer) clearTimeout(timer) }
  return wrapped
}

// Hook 版防抖：每次渲染返回稳定引用，依赖变更自动重建（保留最新闭包）
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  wait = 300,
): ((...args: A) => void) & { cancel: () => void } {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wrapped = useCallback((...args: A) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fnRef.current(...args), wait)
  }, [wait]) as ((...args: A) => void) & { cancel: () => void }

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  // 卸载清理：避免组件已销毁后回调触发 setState
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  wrapped.cancel = cancel
  return wrapped
}
