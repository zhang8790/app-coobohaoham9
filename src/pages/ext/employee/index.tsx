// @title 员工中心
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button, Input } from '@tarojs/components'
import { supabase, getLocalUser } from '@/client/supabase'
import { RouteGuard } from '@/components/RouteGuard'
import { clearRequestCache } from '@/db/requestCache'
import Icon from '@/components/Icon'

interface StaffInfo {
  id: string
  store_id: string
  role: string
  stores: { name: string } | null
}

function EmployeePage() {
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null)
  // 店长身份兜底：owner_id 命中的门店（owner 不是 store_staff 时也能进管理中心）
  const [ownerStore, setOwnerStore] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteCode, setInviteCode] = useState('')
  const [binding, setBinding] = useState(false)

  useEffect(() => {
    loadStaffInfo()
  }, [])

  const loadStaffInfo = async () => {
    const { data: { user } } = await getLocalUser()
    if (!user) { Taro.showToast({ title: '请先登录', icon: 'none' }); return }

    // 两条身份来源并行查：store_staff 成员 / stores.owner_id 店主
    const [staffRes, ownerRes] = await Promise.all([
      // 用 limit(1) 而非 maybeSingle()：同一账号若有多条活跃 store_staff（跨店/历史残留），
      // maybeSingle() 会因「返回多行」直接报错 → data 为 null → 页面误显示「未绑定门店身份」，
      // 把已绑定身份的店主/店长也挡在门外。取一行即可。
      supabase
        .from('store_staff')
        .select('id, store_id, role, stores(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1),
      supabase
        .from('stores')
        .select('id, name')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle(),
    ])

    if (staffRes.error) {
      console.error('[员工中心] 加载失败', staffRes.error)
    }

    setStaffInfo(((staffRes.data as any)?.[0]) ?? null)
    setOwnerStore((ownerRes.data as any) ?? null)
    setLoading(false)
  }

  /**
   * 绑定成功后统一跳转门店管理中心。
   * 注意：必须先清 requestCache —— getMerchantStore 有 30s 内存缓存，
   * 否则刚绑定完进管理中心仍会读到缓存的 null，继续显示"尚未开通门店"。
   */
  const goMerchantCenter = () => {
    clearRequestCache()
    Taro.redirectTo({ url: '/pages/merchant/merchant-center/index' })
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
        // 直接进管理中心（含 owner_id 门店时同样适用）
        setTimeout(goMerchantCenter, 600)
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

  // 店长身份：owner_id 命中的门店，直接给入口（无需邀请码）
  if (!staffInfo && ownerStore) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex items-center justify-center px-6">
        <View className="text-center w-full" style={{ maxWidth: 340 }}>
          <Icon name="store-check" size={56} className="text-primary mb-4" />
          <Text className="text-xl font-bold text-foreground block mb-2">{ownerStore.name}</Text>
          <Text className="text-base text-muted-foreground block mb-6">您是本店店主，可直接进入门店管理中心</Text>
          <Button className="!w-full !bg-primary !border-none !rounded-xl" onClick={goMerchantCenter}>
            <View className="py-3 text-base text-white font-bold">进入门店管理中心</View>
          </Button>
        </View>
      </View>
    </RouteGuard>
  )

  if (!staffInfo) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex items-center justify-center px-6">
        <View className="text-center w-full" style={{ maxWidth: 340 }}>
          <Icon name="user" size={56} color="var(--muted-foreground)" className="mb-4" />
          <Text className="text-xl text-muted-foreground block mb-2">未绑定门店身份</Text>
          <Text className="text-base text-muted-foreground/60 block mb-6">
            未绑定也可以进入管理后台（管理中心会按本账号实际归属展示）。
            绑定门店后可管理对应的门店数据。
          </Text>

          {/* 主通道：取消绑定限制，直接进入管理后台。
              安全性：门店中心的数据全部由 RLS 按账号归属过滤，未绑定账号只会看到
              「开通门店 / 输邀请码绑定」引导页，看不到任何他人门店数据。 */}
          <View className="mb-4">
            <Button className="!w-full !bg-primary !border-none !rounded-xl" onClick={goMerchantCenter}>
              <View className="py-3 text-base text-white font-bold">直接进入管理后台</View>
            </Button>
          </View>

          {/* 次通道：输入邀请码把本账号绑到门店（可选） */}
          <Text className="text-sm text-muted-foreground/60 block mb-2">或者，输入门店邀请码绑定身份</Text>
          <View className="flex items-center gap-2 mb-4">
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
        {/* 顶栏（2026-09-17 去暖色遗老，对齐中性灰白 + 主题绿设计系统） */}
        <View className="px-4 pb-2" style={{ background: 'linear-gradient(160deg,hsl(var(--primary-soft)) 0%,hsl(var(--background)) 100%)' }}>
          <Text className="text-2xl font-bold text-foreground">员工中心</Text>
          <Text className="text-base text-muted-foreground mt-1 block">{staffInfo.stores?.name || ownerStore?.name || '未知店铺'}</Text>
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

        {/* 进入管理中心 */}
        <View className="mx-4 mt-4">
          <Button className="!w-full !bg-primary !border-none !rounded-xl" onClick={goMerchantCenter}>
            <View className="py-3 text-base text-white font-bold">进入门店管理中心</View>
          </Button>
        </View>

        {/* 功能入口 */}
        <View className="mx-4 mt-4 grid grid-cols-2 gap-3">
          {[
            { icon: 'scan', label: '扫码推荐', desc: '让客户扫您的码', color: 'hsl(var(--primary))' },
            { icon: 'chart', label: '业绩统计', desc: '查看推荐业绩', color: '#0369A1' },
            { icon: 'user', label: '我的客户', desc: '查看归属客户', color: 'hsl(var(--primary))' },
            { icon: 'coin', label: '奖励明细', desc: '查看推荐奖励记录', color: '#8A6B22' },
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
