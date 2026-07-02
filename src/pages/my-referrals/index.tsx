// 我的推荐 - 展示一级、二级推荐关系
import { useState, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { getMyProfile, getMyReferrals, ensureReferralCode } from '@/db/api'
import type { Profile } from '@/db/types'

export default function MyReferrals() {
  const [referralCode, setReferralCode] = useState('')
  const [level1List, setLevel1List] = useState<Profile[]>([])
  const [level2List, setLevel2List] = useState<Profile[]>([])
  const [counts, setCounts] = useState({ l1: 0, l2: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'1' | '2'>('1')

  const load = async () => {
    setLoading(true)
    const [data, code] = await Promise.all([
      getMyReferrals(),
      ensureReferralCode(),
    ])
    setLevel1List(data.level_1 || [])
    setLevel2List(data.level_2 || [])
    setCounts({ l1: data.level_1_count || 0, l2: data.level_2_count || 0 })
    setReferralCode(code || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useDidShow(() => { load() })

  const copyCode = () => {
    if (!referralCode) return
    Taro.setClipboardData({ data: referralCode })
    Taro.showToast({ title: '推广码已复制', icon: 'success' })
  }

  const list = activeTab === '1' ? level1List : level2List

  return (
    <View className="min-h-screen bg-background pb-8">
      {/* 顶部统计卡片 */}
      <View className="mx-4 mt-4 p-5 rounded-2xl bg-primary border border-primary/20">
        <Text className="text-white text-lg font-bold">我的推荐</Text>
        <View className="flex gap-4 mt-4">
          <View className="flex-1 bg-white bg-opacity-20 rounded-xl p-3 text-center">
            <Text className="text-white text-2xl font-bold">{counts.l1}</Text>
            <Text className="text-white text-xs opacity-80 mt-1">一级推荐好友</Text>
          </View>
          <View className="flex-1 bg-white bg-opacity-20 rounded-xl p-3 text-center">
            <Text className="text-white text-2xl font-bold">{counts.l2}</Text>
            <Text className="text-white text-xs opacity-80 mt-1">二级推荐好友</Text>
          </View>
        </View>
      </View>

      {/* 我的推广码 */}
      <View className="mx-4 mt-4 p-4 rounded-2xl bg-card border border-border">
        <Text className="text-base font-bold text-foreground">我的推广码</Text>
        <View className="flex items-center gap-3 mt-3">
          <View className="flex-1 bg-background rounded-xl px-4 py-3 border border-border">
            <Text className="text-xl font-bold text-primary font-mono tracking-widest">
              {referralCode || '加载中...'}
            </Text>
          </View>
          <View className="bg-primary px-4 py-2 rounded-xl" onClick={copyCode}>
            <Text className="text-white text-base font-bold">复制</Text>
          </View>
        </View>
        <Text className="text-xs text-muted-foreground mt-2">
          分享小程序给好友，好友注册时自动绑定推荐关系
        </Text>
      </View>

      {/* Tab 切换 */}
      <View className="flex mx-4 mt-4 bg-card rounded-xl p-1 border border-border">
        <View
          className={`flex-1 py-2 rounded-lg text-center ${activeTab === '1' ? 'bg-primary' : ''}`}
          onClick={() => setActiveTab('1')}
        >
          <Text className={`text-base font-bold ${activeTab === '1' ? 'text-white' : 'text-foreground'}`}>
            一级推荐 ({counts.l1})
          </Text>
        </View>
        <View
          className={`flex-1 py-2 rounded-lg text-center ${activeTab === '2' ? 'bg-primary' : ''}`}
          onClick={() => setActiveTab('2')}
        >
          <Text className={`text-base font-bold ${activeTab === '2' ? 'text-white' : 'text-foreground'}`}>
            二级推荐 ({counts.l2})
          </Text>
        </View>
      </View>

      {/* 推荐列表 */}
      <View className="mx-4 mt-3">
        {loading ? (
          <View className="flex items-center justify-center py-8">
            <Text className="text-base text-muted-foreground">加载中...</Text>
          </View>
        ) : list.length === 0 ? (
          <View className="flex flex-col items-center justify-center py-12 gap-3">
            <View className="i-mdi-account-search text-5xl text-muted-foreground opacity-40" />
            <Text className="text-base text-muted-foreground">
              {activeTab === '1' ? '暂无一级推荐好友' : '暂无二级推荐好友'}
            </Text>
            <Text className="text-xs text-muted-foreground">
              分享小程序给好友，好友注册后即可在此看到
            </Text>
          </View>
        ) : (
          list.map(p => (
            <View key={p.id} className="flex items-center gap-3 bg-card rounded-2xl border border-border p-3 mb-3">
              <Image
                src={p.avatar_url || ''}
                className="w-10 h-10 rounded-full bg-muted flex-shrink-0"
                mode="aspectFill"
                onError={() => {}}
              />
              <View className="flex-1">
                <Text className="text-base font-bold text-foreground">{p.nickname || '江湖侠客'}</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {p.member_rank || '江湖散修'} · 积分 {p.points || 0}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {p.created_at ? new Date(p.created_at).toLocaleDateString('zh-CN') : ''}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  )
}
