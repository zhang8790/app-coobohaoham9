// @title 员工中心
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button, Input } from '@tarojs/components'
import { supabase, getLocalUser } from '@/client/supabase'
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
  const [inviteCode, setInviteCode] = useState('')
  const [binding, setBinding] = useState(false)

  useEffect(() => {
    loadStaffInfo()
  }, [])

  const loadStaffInfo = async () => {
    const { data: { user } } = await getLocalUser()
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
    // 用 navigateTo 而非 reLaunch：保留上一页栈，微信胶囊才能显示返回箭头
    Taro.navigateTo({ url: '/pages/login/index' })
  }

  const handleBind = async () => {
    const code = inviteCode.trim().toUpperCase()
    if (!code) { Taro.showToast({ title: '请输入邀请码', icon: 'none' }); return }
    setBinding(true)
    try {
      const { data, error } = await supabase.rpc('redeem_store_invite', { p_code: code })
      if (error) {
        Taro.showToast({ title: '绑定失败：' + error.message, icon: 'none' })
        return
      }
      const res = data as any
      if (res && res.ok) {
        Taro.showToast({ title: '绑定成功', icon: 'success' })
        await loadStaffInfo()
      } else {
        Taro.showToast({ title: (res && res.error) || '邀请码无效或已过期', icon: 'none' })
      }
    } finally {
      setBinding(false)
    }
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  if (!staffInfo) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex items-center justify-center px-6">
        <View className="text-center w-full" style={{ maxWidth: 340 }}>
          <Icon name="user" size={56} color="#9CA3AF" className="mb-4" />
          <Text className="text-xl text-muted-foreground block mb-2">未绑定门店身份</Text>
          <Text className="text-base text-muted-foreground/60 block mb-6">请联系门店添加您为员工，或在下方输入邀请码自助绑定</Text>
          <View className="flex items-center gap-2 mb-6">
            <Input
              className="flex-1 bg-card border border-border rounded-xl px-3 py-2 text-base text-foreground"
              placeholder="输入门店邀请码"
              value={inviteCode}
              onInput={(e: any) => setInviteCode(e.detail.value)}
              maxlength={12}
            />
            <Button className="!bg-primary !text-white !rounded-xl !px-4 !m-0" onClick={handleBind} disabled={binding}>
              <View className="py-2 px-1 text-sm">{binding ? '绑定中' : '绑定'}</View>
            </Button>
          </View>
          <Button className="!bg-transparent !border !border-border !text-muted-foreground !rounded-xl" onClick={handleLogout}>返回登录</Button>
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
            { icon: 'scan', label: '扫码推荐', desc: '让客户扫您的码', color: '#2E7D5B' },
            { icon: 'chart', label: '业绩统计', desc: '查看推荐业绩', color: '#3B5B7A' },
            { icon: 'user', label: '我的客户', desc: '查看归属客户', color: '#8A6D3B' },
            { icon: 'coin', label: '奖励明细', desc: '查看推荐奖励记录', color: '#C77B30' },
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
