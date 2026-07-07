import { View, Button, Text, Input } from '@tarojs/components'
// @title 公告管理
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'
import { withTimeout } from '@/utils/withTimeout'

type AnnouncementRow = {
  id: string
  content: string
  is_active: boolean
  sort_order: number | null
  created_at: string
}

function AdminAnnouncementsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [list, setList] = useState<AnnouncementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newContent, setNewContent] = useState('')
  const [adding, setAdding] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (authLoading) return
    if (profile?.role !== 'admin') { Taro.reLaunch({ url: '/pages/index/index' }); return }
    setLoading(true)
    try {
      const { data, error } = await withTimeout(
        supabase.from('announcements').select('id,content,is_active,sort_order,created_at').order('sort_order', { ascending: true }).limit(100),
        8000,
        '[admin-announcements] load timeout'
      )
      if (error) throw error
      setList((data as AnnouncementRow[]) || [])
    } catch (err) {
      console.error('[admin-announcements] load failed:', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [profile, authLoading])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    const content = newContent.trim()
    if (!content) { Taro.showToast({ title: '请输入公告内容', icon: 'none' }); return }
    setAdding(true)
    try {
      const maxOrder = list.reduce((m, a) => Math.max(m, a.sort_order ?? 0), 0)
      const { error } = await supabase.from('announcements').insert({
        content, is_active: true, sort_order: maxOrder + 1,
      })
      if (error) throw error
      setNewContent('')
      Taro.showToast({ title: '已发布', icon: 'success' })
      load()
    } catch (err) {
      console.error('[admin-announcements] add failed:', err)
      Taro.showToast({ title: '发布失败', icon: 'none' })
    } finally {
      setAdding(false)
    }
  }

  const toggleActive = async (a: AnnouncementRow) => {
    setProcessing(a.id)
    const { error } = await supabase.from('announcements').update({ is_active: !a.is_active }).eq('id', a.id)
    setProcessing(null)
    if (error) { Taro.showToast({ title: '操作失败', icon: 'none' }); return }
    load()
  }

  const handleDelete = async (a: AnnouncementRow) => {
    Taro.showModal({
      title: '确认删除',
      content: '删除后该公告将无法恢复',
      confirmText: '删除', confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return
        setProcessing(a.id)
        const { error } = await supabase.from('announcements').delete().eq('id', a.id)
        setProcessing(null)
        if (error) { Taro.showToast({ title: '删除失败', icon: 'none' }); return }
        Taro.showToast({ title: '已删除', icon: 'success' })
        load()
      }
    })
  }

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      <View className="px-4 py-4">
        <Text className="text-3xl font-bold text-foreground">公告管理</Text>
        <Text className="text-xl text-muted-foreground mt-1">共 {list.length} 条公告</Text>
      </View>

      {/* 新增公告 */}
      <View className="mx-4 bg-card rounded-2xl border border-border p-4">
        <Text className="text-xl font-bold text-foreground mb-2">发布新公告</Text>
        <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
          <Input className="w-full text-xl text-foreground bg-transparent outline-none"
            placeholder="输入公告内容…"
            value={newContent}
            onInput={e => { const ev = e as any; setNewContent(ev.detail?.value ?? ev.target?.value ?? '') }} />
        </View>
        <Button type="button"
          className={`w-full flex items-center justify-center leading-none rounded-2xl mt-3 ${adding ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handleAdd}>
          <View className="py-3 text-xl font-bold text-white">发布</View>
        </Button>
      </View>

      {loading ? (
        <View className="flex items-center justify-center py-20">
          <View className="i-mdi-loading text-5xl text-primary animate-spin" />
        </View>
      ) : list.length === 0 ? (
        <View className="flex flex-col items-center justify-center py-20 gap-3">
          <View className="i-mdi-bullhorn text-6xl text-muted-foreground/40" />
          <Text className="text-2xl text-muted-foreground">暂无公告</Text>
        </View>
      ) : (
        <View className="flex flex-col gap-3 px-4 mt-4">
          {list.map(a => (
            <View key={a.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
              <View className="flex items-start justify-between gap-3">
                <Text className={`text-xl leading-relaxed flex-1 ${a.is_active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                  {a.content}
                </Text>
                <View className={`px-2 py-0.5 rounded-full flex-shrink-0 ${a.is_active ? 'bg-green-500/15' : 'bg-gray-500/15'}`}>
                  <Text className={`text-xs font-bold ${a.is_active ? 'text-green-600' : 'text-gray-500'}`}>{a.is_active ? '已启用' : '已停用'}</Text>
                </View>
              </View>
              <Text className="text-base text-muted-foreground">{new Date(a.created_at).toLocaleDateString('zh-CN')}</Text>
              <View className="flex flex-row gap-3">
                <Button type="button"
                  className="flex-1 flex items-center justify-center leading-none rounded-xl bg-muted"
                  onClick={() => toggleActive(a)}>
                  <View className="py-2 text-xl text-foreground font-bold">
                    {a.is_active ? '停用' : '启用'}
                  </View>
                </Button>
                <Button type="button"
                  className="flex-1 flex items-center justify-center leading-none rounded-xl bg-destructive/10 border-2 border-destructive"
                  onClick={() => handleDelete(a)}>
                  <View className="py-2 text-xl text-destructive font-bold">删除</View>
                </Button>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  </RouteGuard>)
}

export default AdminAnnouncementsPage
