// @title 我的文章收藏
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getMyFavoriteArticles, toggleArticleFavorite } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import type { ArticleFavorite } from '@/db/types'

export default function ArticleFavoritesPage() {
  const { user } = useAuth()
  const [list, setList] = useState<ArticleFavorite[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await getMyFavoriteArticles(0, 50)
      setList(data)
    } catch (e) {
      console.error('[ArticleFavorites]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [user])

  const onUnfav = async (id: string) => {
    const { isFav } = await toggleArticleFavorite(id)
    if (!isFav) {
      setList((prev) => prev.filter((x) => x.article_id !== id))
      Taro.showToast({ title: '已取消收藏', icon: 'none' })
    }
  }

  if (loading) {
    return <View className="min-h-screen bg-[#FFFBF7] px-4 pt-5"><Text className="text-muted-foreground">加载中…</Text></View>
  }

  return (
    <View className="min-h-screen bg-[#FFFBF7] px-4 pt-5 pb-16">
      <Text className="text-xl font-bold text-foreground">📑 文章收藏</Text>
      <Text className="text-xs text-muted-foreground block mt-1 mb-3">你收藏的食养好文，随时回看</Text>

      {list.length === 0 && (
        <View className="mt-10 items-center">
          <Text className="text-4xl">📭</Text>
          <Text className="text-sm text-muted-foreground mt-2 block">还没有收藏任何文章</Text>
          <Text className="text-xs text-muted-foreground mt-1 block">去文章里点「收藏」即可在这里找到</Text>
        </View>
      )}

      {list.map((f) => {
        const a = f.articles
        if (!a) return null
        return (
          <View
            key={f.id}
            className="mt-3 rounded-2xl bg-white p-3 flex flex-row items-center active:scale-[0.99] transition-transform"
            onClick={() => Taro.navigateTo({ url: `/pages/content/article-detail/index?id=${a.id}` })}
          >
            {a.cover_image ? (
              <Image src={a.cover_image} mode="aspectFill" style={{ width: 72, height: 72, borderRadius: 12, flexShrink: 0 }} />
            ) : (
              <View style={{ width: 72, height: 72, borderRadius: 12, flexShrink: 0, background: '#F0EDE8' }} />
            )}
            <View style={{ flex: 1, marginLeft: 12, overflow: 'hidden' }}>
              <Text className="text-sm font-semibold text-foreground" style={{ display: 'block' }} numberOfLines={2}>{a.title}</Text>
              <Text className="text-xs text-muted-foreground mt-1 block" numberOfLines={1}>
                {a.profiles?.nickname || '匿名'} · {(a.view_count || 0)} 阅读
              </Text>
            </View>
            <View
              style={{ paddingLeft: 12, flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); onUnfav(a.id) }}
            >
              <Text style={{ fontSize: 18, color: '#DC2626' }}>☆</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}
