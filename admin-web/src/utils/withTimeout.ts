// 请求超时护栏
// 背景（真实故障）：supabase-js 底层的 fetch 没有内置超时。一旦连接被挂起
// （跨境链路 stall、令牌刷新互斥锁竞争、网络抖动），Promise 永不 settle——
// 页面 loading 分支的 `setLoading(false)` 永远执行不到，表现为「永久转圈」，
// 而且因为 Promise 未 reject，连 catch 也不会触发，界面上没有任何线索。
// 用法：把「一定会 settle 的 Promise」交给它，保证调用方在 ms 内拿到结果或异常。
// 注意：超时后底层请求可能仍在飞（不强制 abort），但调用方得以继续，
// 界面有确定的终态（错误 + 重试），不会无限等待。

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}超时（${Math.round(ms / 1000)} 秒未响应），请检查网络后重试`)
    this.name = 'TimeoutError'
  }
}

/**
 * @param factory 惰性执行并返回 Promise 的工厂函数（用 async 包裹，避免 thenable 边界问题）
 * @param ms      超时毫秒数
 * @param label   业务名，用于错误文案
 */
export function withTimeout<T>(
  factory: () => PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new TimeoutError(label, ms))
    }, ms)

    Promise.resolve()
      .then(factory)
      .then(
        (value) => {
          if (done) return
          done = true
          clearTimeout(timer)
          resolve(value)
        },
        (err) => {
          if (done) return
          done = true
          clearTimeout(timer)
          reject(err)
        },
      )
  })
}
