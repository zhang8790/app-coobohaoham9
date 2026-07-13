// @title 会员管理（商家端）—— 展示本店真实归属客户名单
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Button, Image } from '@tarojs/components'
import { getMerchantStore } from '@/db/api'
import type { Store } from '@/db/types'
import { RouteGuard } from '@/components/RouteGuard'
import { supabase } from '@/client/supabase'

interface LockedMember {
  user_id: string
  nickname: string
  phone_masked: string
  phone_last4: string
  avatar_url: string
  locked_at: string
  lock_type: string
}

const LOCK_TYPE_LABEL: Record<string, string> = {
  first_order: '首单绑定',
  scan: '扫码进店',
  share: '分享绑定',
  invite: '邀请绑定',
  campaign: '红包绑定',
}

function MerchantMembersPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [members, setMembers] = useState<LockedMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const s = await getMerchantStore()
        if (!s) { setLoading(false); return }
        if (!cancelled) setStore(s)

        // 查询本店真实归属客户名单（走脱敏 RPC，明文手机号不下发客户端）
        const { data, error } = await supabase
          .rpc('get_store_locked_members', { p_store_id: s.id })

        if (error) {
          console.error('[Members] 查询客户失败', error)
          if (!cancelled) setMembers([])
        } else {
          const list: LockedMember[] = (data || []).map((r: any) => ({
            user_id: r.user_id,
            nickname: r.nickname || '微信用户',
            phone_masked: r.phone_masked || '未知',
            phone_last4: r.phone_last4 || '',
            avatar_url: r.avatar_url || '',
            locked_at: r.locked_at,
            lock_type: r.lock_type || 'first_order',
          }))
          if (!cancelled) setMembers(list)
        }
      } catch (err) {
        console.error('[Members] 加载失败', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = members.filter(m =>
    !search ||
    m.nickname.includes(search) ||
    m.phone_last4.includes(search)
  )

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-8">

      {store && (
        <View className="mx-4 mt-2 p-3 rounded-2xl bg-card border border-border">
          <Text className="text-base text-muted-foreground">{store.name}</Text>
        </View>
      )}

      {/* 统计 + 搜索 */}
      <View className="flex gap-3 px-4 mt-3 items-center">
        <View className="flex-1 bg-card rounded-2xl border border-border p-3 text-center">
          <Text className="text-2xl font-bold text-primary">{members.length}</Text>
          <Text className="text-xs text-muted-foreground">本店客户数</Text>
        </View>
        <View className="flex-[2] border-2 border-input rounded-xl px-3 py-2 flex items-center bg-background">
          <View className="i-mdi-magnify text-lg text-muted-foreground mr-2" />
          <Input className="flex-1 text-base bg-transparent" placeholder="搜索昵称/手机号"
            value={search} onInput={e => setSearch((e.target as any)?.value ?? '')} />
        </View>
      </View>

      {/* 客户列表（真实数据） */}
      {loading ? (
        <View className="flex items-center justify-center py-20">
          <View className="i-mdi-loading text-4xl text-primary animate-spin" />
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex flex-col items-center justify-center py-20 gap-3">
          <View className="i-mdi-account-group text-5xl text-muted-foreground/30" />
          <Text className="text-base text-muted-foreground">暂无绑定会员</Text>
          <Text className="text-sm text-muted-foreground/50">用户领取本店红包或扫码进店即会归入本店会员</Text>
        </View>
      ) : (
        <View className="px-4 mt-3">
          {filtered.map(m => (
            <View key={m.user_id} className="bg-card rounded-2xl border border-border mb-3 p-4 flex items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                {m.avatar_url ? (
                  <Image src={m.avatar_url} mode="aspectFill" className="w-12 h-12 rounded-full" />
                ) : (
                  <Text className="text-lg font-bold text-primary">{m.nickname[0] || '?'}</Text>
                )}
              </View>
              <View className="flex-1">
                <View className="flex items-center gap-2">
                  <Text className="text-base font-bold text-foreground">{m.nickname}</Text>
                  <View className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-xs">
                    {LOCK_TYPE_LABEL[m.lock_type] || '已绑定'}
                  </View>
                </View>
                <Text className="text-sm text-muted-foreground">{m.phone_masked}</Text>
              </View>
              <View className="text-right">
                <Text className="text-xs text-muted-foreground">绑定于</Text>
                <Text className="text-sm text-foreground">{(m.locked_at || '').slice(0, 10)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default MerchantMembersPage
