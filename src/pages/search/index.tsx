// @title 搜索
import { useState, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { searchProducts } from '@/db/api'
import type { Product } from '@/db/types'

const HOT_WORDS = ['手账套装', '奶茶', '咖啡', '礼品盒', '人间失格', '香薰', '红烧肉', '零食大礼包']

export default function SearchPage() {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(Taro.getStorageSync('search_history') || '[]') } catch { return [] }
  })

  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) return
    setLoading(true)
    setSearched(true)
    // 更新历史
    const newHistory = [kw, ...history.filter(h => h !== kw)].slice(0, 10)
    setHistory(newHistory)
    Taro.setStorageSync('search_history', JSON.stringify(newHistory))
    const data = await searchProducts(kw.trim())
    setResults(data)
    setLoading(false)
  }, [history])

  const clearHistory = () => {
    setHistory([])
    Taro.removeStorageSync('search_history')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 搜索栏 */}
      <div className="sticky top-0 z-10 bg-background px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <div className="flex-1 border-2 border-input rounded-full px-4 py-2 bg-muted flex items-center gap-2">
          <div className="i-mdi-magnify text-xl text-muted-foreground" />
          <input
            className="flex-1 text-xl text-foreground bg-transparent outline-none"
            placeholder="搜索商品、门店..."
            value={keyword}
            onInput={(e) => { const ev = e as any; setKeyword(ev.detail?.value ?? ev.target?.value ?? '') }}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(keyword) }}
          />
          {keyword && (
            <div className="i-mdi-close text-xl text-muted-foreground" onClick={() => { setKeyword(''); setSearched(false); setResults([]) }} />
          )}
        </div>
        <button type="button" className="flex items-center justify-center" onClick={() => keyword.trim() ? doSearch(keyword) : Taro.navigateBack()}>
          <span className="text-xl text-primary font-bold">{keyword.trim() ? '搜索' : '取消'}</span>
        </button>
      </div>

      {/* 无搜索状态 */}
      {!searched && (
        <div className="px-4 pt-6">
          {/* 热门搜索 */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="i-mdi-fire text-2xl text-primary" />
              <span className="text-2xl font-bold text-foreground">热门搜索</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {HOT_WORDS.map(w => (
                <div key={w}
                  className="px-4 py-2 rounded-full bg-muted border border-border text-xl text-foreground"
                  onClick={() => { setKeyword(w); doSearch(w) }}>
                  {w}
                </div>
              ))}
            </div>
          </div>

          {/* 历史记录 */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="i-mdi-history text-2xl text-muted-foreground" />
                  <span className="text-2xl font-bold text-foreground">搜索历史</span>
                </div>
                <button type="button" className="flex items-center gap-1" onClick={clearHistory}>
                  <div className="i-mdi-delete-outline text-xl text-muted-foreground" />
                  <span className="text-xl text-muted-foreground">清空</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map(h => (
                  <div key={h}
                    className="px-4 py-2 rounded-full bg-card border border-border text-xl text-foreground"
                    onClick={() => { setKeyword(h); doSearch(h) }}>
                    {h}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 搜索结果 */}
      {searched && (
        <div className="px-4 pt-4">
          {loading ? (
            <div className="flex items-center justify-center pt-20">
              <div className="i-mdi-loading text-4xl text-primary animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-20 gap-4">
              <div className="i-mdi-magnify-close text-8xl text-muted-foreground" />
              <p className="text-2xl text-muted-foreground">未找到相关商品</p>
              <p className="text-xl text-muted-foreground">换个关键词试试？</p>
            </div>
          ) : (
            <div>
              <p className="text-xl text-muted-foreground mb-4">共找到 <span className="text-primary font-bold">{results.length}</span> 件商品</p>
              {results.map(p => (
                <div key={p.id} className="bg-card rounded-2xl border border-border mb-3 flex overflow-hidden"
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}>
                  <Image src={p.image_url || ''} mode="aspectFill" style={{ width: '100px', height: '100px', flexShrink: 0 }} />
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <p className="text-xl font-bold text-foreground line-clamp-2">{p.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-primary">¥{p.price}</span>
                      {p.original_price && <span className="text-base text-muted-foreground line-through">¥{p.original_price}</span>}
                    </div>
                  </div>
                  <div className="flex items-center pr-3">
                    <div className="i-mdi-chevron-right text-xl text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
