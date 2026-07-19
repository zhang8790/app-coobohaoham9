// @title 搜索
import { useState, useCallback, useEffect } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text, Image, Input } from '@tarojs/components'
import { searchProducts, getProductsByEmotion } from '@/db/api'
import { analyzeEmotionAsync, rankProductsByEmotion, getEmotionPoetry, ScoredProduct } from '@/utils/emotionEngine'
import { generateEmotionDescription } from '@/utils/emotion-description'
import type { Product } from '@/db/types'

const HOT_WORDS = ['手账套装', '奶茶', '咖啡', '礼品盒', '人间失格', '香薰', '红烧肉', '零食大礼包']
// 心情引导词：让用户知道搜索框也能"说心情"
const MOOD_HINTS = ['我失恋了', '今天好累', '想要放松', '需要放松', '有点孤独', '想犒赏自己']

interface EmotionState {
  bubble: string      // IP 回应气泡
  poetry: string      // 武侠风心情诗
  tags: string[]      // 命中的情绪标签
  intensity: 'low' | 'medium' | 'high'
}

const MATCH_LABEL_STYLE: Record<string, { bg: string; color: string; text: string }> = {
  '完美契合': { bg: 'rgba(34,160,94,0.12)', color: '#22A05E', text: '完美契合' },
  '较好匹配': { bg: 'rgba(25,118,210,0.12)', color: '#1976D2', text: '较好匹配' },
  '有点匹配': { bg: 'rgba(140,140,140,0.12)', color: '#8C8C8C', text: '有点匹配' },
}

export default function SearchPage() {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [scored, setScored] = useState<ScoredProduct<Product>[]>([]) // 情绪模式排序结果
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [mode, setMode] = useState<'keyword' | 'emotion'>('keyword')
  const [emotion, setEmotion] = useState<EmotionState | null>(null)
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(Taro.getStorageSync('search_history') || '[]') } catch { return [] }
  })
  const router = useRouter()

  const pushHistory = (kw: string) => {
    const newHistory = [kw, ...history.filter(h => h !== kw)].slice(0, 10)
    setHistory(newHistory)
    Taro.setStorageSync('search_history', JSON.stringify(newHistory))
  }

  const doSearch = useCallback(async (kw: string) => {
    const text = kw.trim()
    if (!text) return
    setLoading(true)
    setSearched(true)
    pushHistory(text)

    // ① 先解析心情：命中情绪标签则进入「情绪配对」模式（含 DB 词库 + LLM 兜底）
    const analysis = await analyzeEmotionAsync(text)
    if (analysis.detectedTags.length > 0) {
      const products = await getProductsByEmotion(analysis.detectedTags, 40, 'only')
      const ranked = rankProductsByEmotion(products, analysis.tagScores)
      const poetry = getEmotionPoetry(analysis.detectedTags, analysis.intensity)
      setMode('emotion')
      setEmotion({ bubble: analysis.ipBubble, poetry, tags: analysis.detectedTags, intensity: analysis.intensity })
      setScored(ranked)
      setResults([])
      setLoading(false)
      return
    }

    // ② 未命中情绪 → 普通关键词搜索
    const data = await searchProducts(text)
    setMode('keyword')
    setEmotion(null)
    setScored([])
    setResults(data)
    setLoading(false)
  }, [history])

  const clearHistory = () => {
    setHistory([])
    Taro.removeStorageSync('search_history')
  }

  const resetSearch = () => {
    setKeyword('')
    setSearched(false)
    setMode('keyword')
    setEmotion(null)
    setScored([])
    setResults([])
  }

  // 支持从犒赏铺(?mood=标签) / 情绪检测页(?keyword=关键词) 带参跳转自动搜索
  useEffect(() => {
    const rawMood = router.params?.mood
    const rawKw = router.params?.keyword
    const raw = rawMood || rawKw
    if (raw) {
      const text = decodeURIComponent(raw)
      setKeyword(text)
      doSearch(text)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 情绪模式下：取匹配到的商品情绪翻译副标题（用命中的主标签驱动）
  const emotionSubtitle = (p: Product): string => {
    if (!emotion || emotion.tags.length === 0) return ''
    return generateEmotionDescription(p, emotion.tags.slice(0, 3))
  }

  return (
    <View className="min-h-screen bg-background">
      {/* 搜索栏 */}
      <View className="sticky top-0 z-10 bg-background px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <View className="flex-1 border-2 border-input rounded-full px-4 py-2 bg-muted flex items-center gap-2">
          <View className="i-mdi-magnify text-xl text-muted-foreground" />
          <Input
            className="flex-1 text-xl text-foreground bg-transparent outline-none"
            placeholder="说心情或搜商品，如「我失恋了」"
            value={keyword}
            onInput={(e) => { const ev = e as any; setKeyword(ev.detail?.value ?? ev.target?.value ?? '') }}
            onConfirm={() => doSearch(keyword)}
          />
          {keyword && (
            <View className="i-mdi-close text-xl text-muted-foreground" onClick={() => { setKeyword(''); setSearched(false); setResults([]); setScored([]); setEmotion(null) }} />
          )}
        </View>
        <View className="flex items-center justify-center flex-shrink-0"
          onClick={() => keyword.trim() ? doSearch(keyword) : resetSearch()}>
          <Text className="text-xl text-primary font-bold">{keyword.trim() ? '搜索' : '取消'}</Text>
        </View>
      </View>

      {/* 无搜索状态 */}
      {!searched && (
        <View className="px-4 pt-6">
          {/* 心情引导 */}
          <View className="mb-6">
            <View className="flex items-center gap-2 mb-3">
              <View className="i-mdi-heart-pulse text-2xl text-primary" />
              <Text className="text-2xl font-bold text-foreground">此刻的心情</Text>
            </View>
            <View className="flex flex-wrap gap-2">
              {MOOD_HINTS.map(w => (
                <View key={w}
                  className="px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-xl text-primary"
                  onClick={() => { setKeyword(w); doSearch(w) }}>
                  {w}
                </View>
              ))}
            </View>
          </View>

          {/* 热门搜索 */}
          <View className="mb-6">
            <View className="flex items-center gap-2 mb-3">
              <View className="i-mdi-fire text-2xl text-primary" />
              <Text className="text-2xl font-bold text-foreground">热门搜索</Text>
            </View>
            <View className="flex flex-wrap gap-2">
              {HOT_WORDS.map(w => (
                <View key={w}
                  className="px-4 py-2 rounded-full bg-muted border border-border text-xl text-foreground"
                  onClick={() => { setKeyword(w); doSearch(w) }}>
                  {w}
                </View>
              ))}
            </View>
          </View>

          {/* 历史记录 */}
          {history.length > 0 && (
            <View>
              <View className="flex items-center justify-between mb-3">
                <View className="flex items-center gap-2">
                  <View className="i-mdi-history text-2xl text-muted-foreground" />
                  <Text className="text-2xl font-bold text-foreground">搜索历史</Text>
                </View>
                <View className="flex items-center gap-1" onClick={clearHistory}>
                  <View className="i-mdi-delete-outline text-xl text-muted-foreground" />
                  <Text className="text-xl text-muted-foreground">清空</Text>
                </View>
              </View>
              <View className="flex flex-wrap gap-2">
                {history.map(h => (
                  <View key={h}
                    className="px-4 py-2 rounded-full bg-card border border-border text-xl text-foreground"
                    onClick={() => { setKeyword(h); doSearch(h) }}>
                    {h}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* 搜索结果 */}
      {searched && (
        <View className="px-4 pt-4">
          {loading ? (
            <View className="flex items-center justify-center pt-20">
              <View className="i-mdi-loading text-4xl text-primary animate-spin" />
            </View>
          ) : mode === 'emotion' && emotion ? (
            <View>
              {/* 心情横幅：IP 气泡 + 武侠诗 + 情绪标签 */}
              <View className="rounded-2xl p-4 mb-4"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.25))', border: '1px solid rgba(0,0,0,0.06)', backdropFilter: 'blur(12px)' }}>
                <View className="flex items-center gap-2 mb-2">
                  <View className="i-mdi-heart-pulse text-2xl text-primary" />
                  <Text className="text-xl font-bold text-foreground">读懂了你的心情</Text>
                </View>
                <Text className="text-xl text-foreground leading-relaxed block" style={{ fontWeight: 600 }}>{emotion.bubble}</Text>
                <Text className="text-lg text-muted-foreground leading-relaxed block mt-1">{emotion.poetry}</Text>
                <View className="flex gap-2 flex-wrap mt-3">
                  {emotion.tags.map(t => (
                    <View key={t} className="px-3 py-1 rounded-full text-base" style={{ background: 'rgba(0,0,0,0.05)' }}>
                      <Text className="text-foreground">#{t}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <Text className="text-xl text-muted-foreground mb-3">为你配对 <Text className="text-primary font-bold">{scored.filter(s => s.matchScore > 0).length}</Text> 件懂你的好物</Text>

              {scored.map(({ product: p, matchScore, matchLabel }) => {
                const label = matchLabel ? MATCH_LABEL_STYLE[matchLabel] : null
                const subtitle = emotionSubtitle(p)
                return (
                  <View key={p.id} className="bg-card rounded-2xl border border-border mb-3 flex overflow-hidden"
                    onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}>
                    <Image src={(p as any).main_image || p.image_url || ''} mode="aspectFill" style={{ width: '100px', height: '100px', flexShrink: 0 }} />
                    <View className="flex-1 p-3 flex flex-col justify-between">
                      <View className="flex items-center justify-between gap-2">
                        <Text className="text-xl font-bold text-foreground line-clamp-1 flex-1">{p.name}</Text>
                        {label && (
                          <View className="px-2 py-0.5 rounded-full text-base flex-shrink-0" style={{ background: label.bg }}>
                            <Text style={{ color: label.color }}>{label.text}</Text>
                          </View>
                        )}
                      </View>
                      {subtitle ? (
                        <Text className="text-base text-muted-foreground line-clamp-2 mt-1">{subtitle}</Text>
                      ) : null}
                      <View className="flex items-center gap-2 mt-1">
                        <Text className="text-xl font-bold text-primary">¥{p.price}</Text>
                        {p.original_price && <Text className="text-base text-muted-foreground line-through">¥{p.original_price}</Text>}
                      </View>
                    </View>
                    <View className="flex items-center pr-3">
                      <View className="i-mdi-chevron-right text-xl text-muted-foreground" />
                    </View>
                  </View>
                )
              })}
            </View>
          ) : results.length === 0 ? (
            <View className="flex flex-col items-center justify-center pt-20 gap-4">
              <View className="i-mdi-magnify-close text-8xl text-muted-foreground" />
              <Text className="text-2xl text-muted-foreground">未找到相关商品</Text>
              <Text className="text-xl text-muted-foreground">换个关键词试试？</Text>
            </View>
          ) : (
            <View>
              <Text className="text-xl text-muted-foreground mb-4">共找到 <Text className="text-primary font-bold">{results.length}</Text> 件商品</Text>
              {results.map(p => (
                <View key={p.id} className="bg-card rounded-2xl border border-border mb-3 flex overflow-hidden"
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}>
                  <Image src={p.image_url || ''} mode="aspectFill" style={{ width: '100px', height: '100px', flexShrink: 0 }} />
                  <View className="flex-1 p-3 flex flex-col justify-between">
                    <Text className="text-xl font-bold text-foreground line-clamp-2">{p.name}</Text>
                    <View className="flex items-center gap-2">
                      <Text className="text-xl font-bold text-primary">¥{p.price}</Text>
                      {p.original_price && <Text className="text-base text-muted-foreground line-through">¥{p.original_price}</Text>}
                    </View>
                  </View>
                  <View className="flex items-center pr-3">
                    <View className="i-mdi-chevron-right text-xl text-muted-foreground" />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  )
}
