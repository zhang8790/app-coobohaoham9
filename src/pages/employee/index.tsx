// @title 员工中心
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

interface StaffInfo {
  id: string
  store_id: string
  role: string
  stores: { name: string } | null
}

function EmployeePage() {
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStaffInfo()
  }, [])

  const loadStaffInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { Taro.showToast({ title: '请先登录', icon: 'none' }); return }

    const { data, error } = await supabase
      .from('store_staff')
      .select('id, store_id, role, stores(name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error('[员工中心] 加载失败', error)
    }

    setStaffInfo(data as any)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    Taro.reLaunch({ url: '/pages/login/index' })
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  if (!staffInfo) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex items-center justify-center px-6">
        <View className="text-center">
          <Icon name="user" size={56} color="#9CA3AF" className="mb-4" />
          <Text className="text-xl text-muted-foreground block mb-2">未绑定员工身份</Text>
          <Text className="text-base text-muted-foreground/60 block mb-6">请联系商家添加您为员工</Text>
          <Button className="!bg-primary !text-white !rounded-xl" onClick={handleLogout}>返回登录</Button>
        </View>
      </View>
    </RouteGuard>
  )

  return (
    <RouteGuard>
      <View className="min-h-screen bg-background pb-8">
        {/* 顶栏 */}
        <View className="px-4 pb-2" style={{ background: 'linear-gradient(160deg,#F5ECE2 0%,#F0DCCB 100%)' }}>
          <Text className="text-2xl font-bold text-foreground">员工中心</Text>
          <Text className="text-base text-muted-foreground mt-1 block">{staffInfo.stores?.name || '未知店铺'}</Text>
        </View>

        {/* 员工信息 */}
        <View className="mx-4 mt-4 p-4 rounded-2xl bg-card border border-border">
          <View className="flex items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
              <Text className="text-white font-bold text-xl">{staffInfo.role === 'manager' ? '店' : '员'}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{staffInfo.role === 'manager' ? '店长' : '员工'}</Text>
              <Text className="text-base text-muted-foreground">角色：{staffInfo.role}</Text>
            </View>
          </View>
        </View>

        {/* 功能入口（待开发） */}
        <View className="mx-4 mt-4 grid grid-cols-2 gap-3">
          {[
            { icon: 'scan', label: '扫码推广', desc: '让客户扫您的码', color: '#2E7D5B' },
            { icon: 'chart', label: '业绩统计', desc: '查看推广业绩', color: '#3B5B7A' },
            { icon: 'user', label: '我的客户', desc: '查看归属客户', color: '#8A6D3B' },
            { icon: 'coin', label: '佣金明细', desc: '查看佣金记录', color: '#C77B30' },
          ].map(btn => (
            <View key={btn.label} className="p-4 rounded-2xl bg-card border border-border">
              <Icon name={btn.icon} size={32} color={btn.color} className="mb-2" />
              <Text className="text-xl font-bold text-foreground block">{btn.label}</Text>
              <Text className="text-xs text-muted-foreground mt-0.5 block">{btn.desc}</Text>
            </View>
          ))}
        </View>

        {/* 退出登录 */}
        <View className="mx-4 mt-8">
          <Button className="!w-full !bg-transparent !border !border-red-300 !text-red-500 !rounded-xl"
            onClick={handleLogout}>
            <View className="py-3 text-base">退出登录</View>
          </Button>
        </View>
      </View>
    </RouteGuard>
  )
}

export default EmployeePage
