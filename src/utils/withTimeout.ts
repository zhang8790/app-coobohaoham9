/**
 * 给 Promise 添加超时保护
 * @param promise 原始 Promise
 * @param timeoutMs 超时时间（毫秒），默认 5000
 * @param errorMessage 超时错误信息
 * @returns 包装后的 Promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  errorMessage: string = '请求超时'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ])
}
