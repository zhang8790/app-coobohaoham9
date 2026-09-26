// 首页模块级工具：商品人群分档 / 食养标签配置 / 反馈复利 / Feed+消费本地缓存
// 从 index.tsx 抽出，零逻辑改动（便于独立审查首页推荐与缓存策略）
import Taro from '@tarojs/taro'
import type { Product } from '@/db/types'
import { type ScoredProduct } from '@/utils/emotionEngine'
import { classifyProduct as classifyOne, toFoodTherapyInput, HEALTH_TAGS, type Crowd, type HealthTag } from '@/utils/food-therapy'
import type { ConsumptionProfile } from '@/utils/consumption-profile'
// 纯函数：把商品列表按"身体人群"分三档（直接吃 Product，零网络）
export function classifyProductList(products: Product[], crowds: Crowd[]) {
 const res: { recommend: Product[]; caution: Product[]; avoid: Product[] } = { recommend: [], caution: [], avoid: [] }
 for (const p of products) {
 const tier = classifyOne(toFoodTherapyInput(p), crowds, null)
 if (tier === 'recommend') res.recommend.push(p)
 else if (tier === 'caution') res.caution.push(p)
 else if (tier === 'avoid') res.avoid.push(p)
 }
 return res
}

// 行为标签复利：把用户显式反馈权重（点赞+1 / 点踩-1 / 加购+1 / 购买+1，view 记 0）叠加进消费画像的标签权重，
// 让「浏览 / 购买 / 互动」共同沉淀为食养偏好，反哺首页推荐与今日食养。
export function mergeFeedbackIntoProfile(prof: ConsumptionProfile, weights: Record<string, number>): ConsumptionProfile {
 const entries = weights && Object.keys(weights).length > 0 ? weights : {}
 const counts = new Map<string, number>()
 for (const ht of prof.topHealthTags) counts.set(ht.tag, ht.count)
 for (const [tag, w] of Object.entries(entries)) {
 if (!w) continue
 if (!(HEALTH_TAGS as readonly string[]).includes(tag)) continue
 counts.set(tag, (counts.get(tag) ?? 0) + w)
 }
 const topHealthTags = [...counts.entries()]
 .filter(([, c]) => c > 0)
 .sort((a, b) => b[1] - a[1])
 .slice(0, 3)
 .map(([tag, count]) => ({ tag: tag as HealthTag, count }))
 return { ...prof, hasData: topHealthTags.length > 0, topHealthTags }
}

// ============ 首页本地缓存：打开即渲染缓存内容，后台静默刷新 ============
// 根治「反应速度慢 / 缓存慢」：原每次切回首页都重新拉全量 Feed + 50 笔订单，
// 现改为先用 storage 缓存秒出，再后台刷新，用户感知不到网络等待。
const FEED_CACHE_KEY = 'home_feed_cache_v1'
const FEED_CACHE_TTL = 5 * 60 * 1000
const CONSUME_CACHE_KEY = 'home_consume_cache_v1'
const CONSUME_CACHE_TTL = 10 * 60 * 1000

export function readFeedCache(scope: string): ScoredProduct<Product>[] | null {
 try {
 const key = `${FEED_CACHE_KEY}:${scope}`
 const raw = Taro.getStorageSync(key) as { t: number; items: ScoredProduct<Product>[] } | null
 if (!raw?.items?.length) return null
 if (Date.now() - raw.t > FEED_CACHE_TTL) return null
 return raw.items
 } catch { return null }
}
export function writeFeedCache(scope: string, items: ScoredProduct<Product>[]) {
 try { Taro.setStorageSync(`${FEED_CACHE_KEY}:${scope}`, { t: Date.now(), items }) } catch { /* ignore */ }
}
export function readConsumeCache(uid: string): { profile: ConsumptionProfile; boughtIds: string[] } | null {
 try {
 const raw = Taro.getStorageSync(CONSUME_CACHE_KEY) as { uid: string; t: number; profile: ConsumptionProfile; boughtIds: string[] } | null
 if (!raw || raw.uid !== uid) return null
 if (Date.now() - raw.t > CONSUME_CACHE_TTL) return null
 return raw
 } catch { return null }
}
export function writeConsumeCache(uid: string, data: { profile: ConsumptionProfile; boughtIds: string[] }) {
 try { Taro.setStorageSync(CONSUME_CACHE_KEY, { uid, t: Date.now(), ...data }) } catch { /* ignore */ }
}
