import { View, Button, Text } from '@tarojs/components'
// @title 用户管理
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'
import { withTimeout } from '@/utils/withTimeout'

type UserRow = {
  id: string
  nickname: string | null
  phone: string | null
  member_rank: string | null
  role: string | null
  points: number | null
  balance: number | null
  created_at: string
}

function AdminUsersPage() {
  const { profile, loading: authLoading } = useAuth()
  const [list, setList] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (authLoading) return
    if (profile?.role !== 'admin') { Taro.reLaunch({ url: '/pages/index/index' }); return }
    setLoading(true)
    try {
        const { data, error } = await withTimeout(
        supabase.from('profiles').select('id,nickname,phone,member_rank,role,points,balance,gold_beans,created_at').order('created_at', { ascending: false }).limit(100),
        8000,
        '[admin-users] load timeout'
      )
      if (error) throw error
      setList((data as UserRow[]) || [])
    } catch (err) {
      console.error('[admin-users] load failed:', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [profile, authLoading])

  useEffect(() => { load() }, [load])

  const toggleRole = async (u: UserRow) => {
    const target = u.role === 'admin' ? 'user' : 'admin'
    Taro.showModal({
      title: '修改管理员权限',
      content: `确认将「${u.nickname || u.phone || '该用户'}」${target === 'admin' ? '设为' : '取消'}管理员？`,
      success: async (res) => {
        if (!res.confirm) return
        setProcessing(u.id)
        const { error } = await supabase.from('profiles').update({ role: target }).eq('id', u.id)
        setProcessing(null)
        if (error) { Taro.showToast({ title: '操作失败', icon: 'none' }); return }
        Taro.showToast({ title: '已更新', icon: 'success' })
        load()
      }
    })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      <View className="px-4 py-4">
        <Text className="text-3xl font-bold text-foreground">用户管理</Text>
        <Text className="text-xl text-muted-foreground mt-1">共 {list.length} 位用户</Text>
      </View>

      {loading ? (
        <View className="flex items-center justify-center py-20">
          <View className="i-mdi-loading text-5xl text-primary animate-spin" />
        </View>
      ) : list.length === 0 ? (
        <View className="flex flex-col items-center justify-center py-20 gap-3">
          <View className="i-mdi-account-group text-6xl text-muted-foreground/40" />
          <Text className="text-2xl text-muted-foreground">暂无用户</Text>
        </View>
      ) : (
        <View className="flex flex-col gap-3 px-4">
          {list.map(u => (
            <View key={u.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
              <View className="flex items-start justify-between">
                <View className="flex flex-col gap-1">
                  <View className="flex items-center gap-2">
                    <Text className="text-2xl font-bold text-foreground">{u.nickname || '侠客'}</Text>
                    {u.role === 'admin' && (
                      <View className="px-2 py-0.5 rounded-full bg-primary/15">
                        <Text className="text-xs text-primary font-bold">管理员</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xl text-muted-foreground">{u.phone || '未知手机'}</Text>
                </View>
                <View className="flex flex-col items-end">
                  <Text className="text-xl font-bold text-primary">{u.member_rank || '江湖散修'}</Text>
                  <Text className="text-base text-muted-foreground">积分 {u.points ?? 0} · 金豆 {Number(u.gold_beans ?? 0).toFixed(2)}</Text>
                </View>
              </View>
              <View className="flex items-center justify-between">
                <Text className="text-base text-muted-foreground">{new Date(u.created_at).toLocaleDateString('zh-CN')}</Text>
                <Button type="button"
                  className={`flex items-center justify-center leading-none rounded-xl ${processing === u.id ? 'bg-primary/50' : 'bg-muted'}`}
                  onClick={() => toggleRole(u)}>
                  <View className="px-4 py-2 text-xl text-foreground font-bold">
                    {u.role === 'admin' ? '取消管理员' : '设为管理员'}
                  </View>
                </Button>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  </RouteGuard>)
}

export default AdminUsersPage
