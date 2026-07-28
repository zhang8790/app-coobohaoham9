// @title 我的关注
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { getMyFollowedAuthors, toggleAuthorFollow } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import type { AuthorFollow } from '@/db/types'

export default function FollowedAuthorsPage() {
  const { user } = useAuth()
  const [list, setList] = useState<AuthorFollow[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await getMyFollowedAuthors(0, 100)
      setList(data)
    } catch (e) {
      console.error('[FollowedAuthors]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [user])

  const onUnfollow = async (authorId: string) => {
    const { isFollowing } = await toggleAuthorFollow(authorId)
    if (!isFollowing) {
      setList((prev) => prev.filter((x) => x.author_id !== authorId))
      Taro.showToast({ title: '已取消关注', icon: 'none' })
    }
  }

  if (loading) {
    return <View className="min-h-screen bg-[#FFFBF7] px-4 pt-5"><Text className="text-muted-foreground">加载中…</Text></View>
  }

  return (
    <View className="min-h-screen bg-[#FFFBF7] px-4 pt-5 pb-16">
      <Text className="text-xl font-bold text-foreground">👤 我的关注</Text>
      <Text className="text-xs text-muted-foreground block mt-1 mb-3">你关注的作者，发布新文会第一时间看到</Text>

      {list.length === 0 && (
        <View className="mt-10 items-center">
          <Text className="text-4xl">👥</Text>
          <Text className="text-sm text-muted-foreground mt-2 block">还没有关注任何作者</Text>
          <Text className="text-xs text-muted-foreground mt-1 block">去文章页点作者旁的「关注」即可</Text>
        </View>
      )}

      {list.map((f) => {
        const p = f.profiles
        return (
          <View
            key={f.id}
            className="mt-3 rounded-2xl bg-white p-3 flex flex-row items-center"
          >
            {p?.avatar_url ? (
              <Image src={p.avatar_url} mode="aspectFill" style={{ width: 48, height: 48, borderRadius: 24, flexShrink: 0 }} />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 24, flexShrink: 0, background: '#F0EDE8', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, color: '#9A8070' }}>{(p?.nickname || '喜')[0]}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text className="text-sm font-semibold text-foreground" style={{ display: 'block' }} numberOfLines={1}>{p?.nickname || '匿名用户'}</Text>
              <Text className="text-xs text-muted-foreground mt-0.5 block">已关注</Text>
            </View>
            <View
              className="px-3 py-1.5 rounded-full"
              style={{ background: '#F0EDE8', flexShrink: 0 }}
              onClick={() => onUnfollow(f.author_id)}
            >
              <Text className="text-xs text-foreground">取消关注</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}
