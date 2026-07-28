/**
 * 轻量级内存请求缓存（仅用于读多写少、可短暂容忍陈旧的商品列表类查询）。
 *
 * 用途：解决「缓存慢 / 速度慢」——小程序每次切 tab、每次输入都直击 Supabase，
 * 没有任何内存缓存。给 getProducts 等列表查询加 TTL 缓存后：
 *   - 首页 Feed / 探索页 / 门店首页 切走再切回 → 命中缓存瞬间出数据（不再转圈）
 *   - 搜索框连续输入 → 命中近期相同关键词缓存，省一次网络往返
 *
 * 设计要点：
 *   - 进程级内存 Map，TTL 短（默认 30s），自动过期，不会无限膨胀
 *   - 仅在读函数命中；写函数（createProduct/updateProduct）调用 clearRequestCache 主动失效，
 *     保证「刚上架/改价的商品立即可见」，避免缓存陈旧
 *   - 不持久化、不跨会话，进程重启即清空，安全无副作用
 */

type Entry = { value: unknown; expire: number }

const store = new Map<string, Entry>()

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key)
  if (!e) return undefined
  if (Date.now() > e.expire) {
    store.delete(key)
    return undefined
  }
  return e.value as T
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expire: Date.now() + ttlMs })
}

// 任意参数稳定序列化为缓存键
export function cacheMakeKey(...parts: unknown[]): string {
  try {
    return JSON.stringify(parts)
  } catch {
    return parts.map((p) => (typeof p === 'object' ? '[obj]' : String(p))).join('|')
  }
}

export function clearRequestCache(): void {
  store.clear()
}
