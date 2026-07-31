// 轻量进程内请求缓存
// 用途：切 tab / 重复进入页面时秒回，避免重复重算服务端聚合（数据分析 / 商品收益）。
// 与小程序端 src/db/requestCache.ts 同款范式（Map + TTL）。

const DEFAULT_TTL = 20_000

type Entry<T> = { value: T; expire: number }

const cache = new Map<string, Entry<unknown>>()

export function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expire) {
    cache.delete(key)
    return null
  }
  return hit.value as T
}

export function cacheSet<T>(key: string, value: T, ttl: number = DEFAULT_TTL): void {
  cache.set(key, { value, expire: Date.now() + ttl })
}

export function cacheMakeKey(...parts: (string | number)[]): string {
  return parts.join(':')
}

export function clearRequestCache(): void {
  cache.clear()
}

const requestCache = {
  get: cacheGet,
  set: cacheSet,
  makeKey: cacheMakeKey,
  clear: clearRequestCache,
}

export default requestCache
