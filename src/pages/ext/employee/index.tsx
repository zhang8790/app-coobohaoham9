// @title 员工中心（门店运营身份 · 邀请码绑定）
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button, Input } from '@tarojs/components'
import { supabase, getLocalUser } from '@/client/supabase'
import { RouteGuard } from '@/components/RouteGuard'
import { clearRequestCache } from '@/db/requestCache'
import { scanRaw } from '@/utils/scan'
import Icon from '@/components/Icon'

interface StaffInfo {
  id: string
  store_id: string
  role: string
  stores: { name: string } | null
}

/** 门店角色 → 展示名。旧实现只判 manager，导致 owner/cashier 都落进「员工」 */
const ROLE_LABEL: Record<string, string> = {
  owner: '店主',
  manager: '店长',
  staff: '店员',
  cashier: '收银员',
}
/** 头像首字。旧实现把 owner 也显示成「员」，属于误导 */
const ROLE_AVATAR: Record<string, string> = {
  owner: '主',
  manager: '店',
  staff: '员',
  cashier: '银',
}

/**
 * 兑换失败细分错误码 → 用户可读文案。
 * 对应后端迁移 00206 redeem_store_invite 的返回值。
 * 原则：绝不把英文错误码直接甩给用户，未知码走兜底。
 */
const ERROR_TEXT: Record<string, string> = {
  not_authenticated: '请先登录后再绑定',
  rate_limited: '操作过于频繁，请 5 分钟后再试',
  code_not_found: '邀请码不存在，请核对后重试',
  code_revoked: '该邀请码已被店长撤销，请重新索取',
  code_expired: '该邀请码已过期，请联系店长重新生成',
  code_used: '该邀请码已被使用，请向店长索取专属码',
  max_uses_reached: '该邀请码使用次数已达上限，请重新索取',
  store_inactive: '该门店已停止营业，无法绑定',
  role_conflict: '您在本店已有更高权限身份，无需绑定此码',
  already_bound_same: '您已是本店成员，无需重复绑定',
}
const ERROR_FALLBACK = '绑定失败，请稍后重试'

/** 这两种「失败」其实代表用户早已是成员，应引导进管理中心而不是报错了事 */
const ALREADY_BOUND = new Set(['already_bound_same', 'role_conflict'])

/** 邀请码规范化：只留字母数字并大写，LD + 8 位 */
function normalize(raw: string): string {
  return String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 10)
}
/** 视觉分段：LD8A3F1C2B → LD8A-3F1C-2B */
function pretty(code: string): string {
  if (code.length !== 10) return code
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`
}

/**
 * 从扫码原始串里抠出邀请码，三种形态都要兜住：
 * ① 明文 LD8A3F1C2B ② 链接 ?code=LD8A3F1C2B ③ 小程序 scene 串
 */
function parseScanResult(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const m = s.match(/[?&](?:code|invite|invite_code)=([0-9A-Za-z-]{4,20})/i)
  const candidate = normalize(m ? m[1] : s)
  return /^LD[0-9A-Z]{8}$/.test(candidate) ? candidate : null
}

function EmployeePage() {
  // 多店支持：一个账号可同时是多家门店成员，旧版 limit(1) 会把其余门店吞掉
  const [staffList, setStaffList] = useState<StaffInfo[]>([])
  const [ownerStores, setOwnerStores] = useState<{ id: string; name: string }[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [inviteCode, setInviteCode] = useState('')
  const [binding, setBinding] = useState(false)

  useEffect(() => {
    loadStaffInfo()
  }, [])

  const loadStaffInfo = async () => {
    const { data: { user } } = await getLocalUser()
    if (!user) { Taro.showToast({ title: '请先登录', icon: 'none' }); return }

    const [staffRes, ownerRes] = await Promise.all([
      supabase
        .from('store_staff')
        .select('id, store_id, role, stores(name)')
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('stores')
        .select('id, name')
        .eq('owner_id', user.id),
    ])

    if (staffRes.error) console.error('[员工中心] 加载失败', staffRes.error)
    setStaffList((staffRes.data as any) ?? [])
    setOwnerStores((ownerRes.data as any) ?? [])
    setLoading(false)
  }

  /**
   * 绑定成功后统一跳转门店管理中心。
   * 🔴 必须先 clearRequestCache —— getMerchantStore 有 30s 内存缓存，
   * 否则刚绑定完进管理中心仍会读到缓存的 null，继续显示「尚未开通门店」。
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

  const doRedeem = async (code: string, source: 'code' | 'qrcode') => {
    setBinding(true)
    try {
      const { data, error } = await supabase.rpc('redeem_store_invite', {
        p_code: code,
        p_source: source,
      })
      if (error) {
        Taro.showToast({ title: ERROR_FALLBACK, icon: 'none' })
        return
      }
      const res = data as any
      if (res?.ok) {
        setInviteCode('')
        Taro.showToast({ title: '绑定成功', icon: 'success' })
        // 800ms 而非 600ms：部分机型 toast 还没渲染完，页面就已被 redirectTo 带走
        setTimeout(goMerchantCenter, 800)
        return
      }
      const errCode = String(res?.error || '')
      if (ALREADY_BOUND.has(errCode)) {
        Taro.showToast({ title: ERROR_TEXT[errCode], icon: 'none' })
        setTimeout(goMerchantCenter, 800)
        return
      }
      Taro.showToast({ title: ERROR_TEXT[errCode] || ERROR_FALLBACK, icon: 'none' })
    } finally {
      setBinding(false)
    }
  }

  const handleBind = async () => {
    const code = normalize(inviteCode)
    if (!code) { Taro.showToast({ title: '请输入邀请码', icon: 'none' }); return }
    await doRedeem(code, 'code')
  }

  /** 扫码绑定：拍到的是二维码文本/链接，抠出邀请码后直接兑换 */
  const handleScanBind = async () => {
    if (binding) return
    const raw = await scanRaw({ scanType: ['qrCode', 'barCode'] })
    if (!raw) { Taro.showToast({ title: '未识别到邀请码', icon: 'none' }); return }
    const code = parseScanResult(raw)
    if (!code) { Taro.showToast({ title: '这不是门店邀请码', icon: 'none' }); return }
    setInviteCode(code)
    await doRedeem(code, 'qrcode')
  }

  if (loading) return (
    <View className="flex items-center justify-center min-h-screen bg-background">
      <Icon name="loading" size={36} className="text-primary animate-spin" />
    </View>
  )

  const staff = staffList[activeIdx] ?? null

  // 店主身份：owner_id 命中的门店，直接给入口（无需邀请码）
  if (!staff && ownerStores.length > 0) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex items-center justify-center px-6">
        <View className="text-center w-full" style={{ maxWidth: 340 }}>
          <Icon name="store-check" size={56} className="text-primary mb-4" />
          <Text className="text-xl font-bold text-foreground block mb-2">{ownerStores[0].name}</Text>
          <Text className="text-base text-muted-foreground block mb-6">您是本店店主，可直接进入门店管理中心</Text>
          <Button className="!w-full !bg-primary !border-none !rounded-xl" onClick={goMerchantCenter}>
            <View className="py-3 text-base text-white font-bold">进入门店管理中心</View>
          </Button>
        </View>
      </View>
    </RouteGuard>
  )

  if (!staff) return (
    <RouteGuard>
      <View className="min-h-screen bg-background flex items-center justify-center px-6">
        <View className="text-center w-full" style={{ maxWidth: 340 }}>
          <Icon name="user" size={56} color="var(--muted-foreground)" className="mb-4" />
          <Text className="text-xl text-muted-foreground block mb-2">绑定门店运营身份</Text>
          <Text className="text-base text-muted-foreground/60 block mb-6">
            绑定后可管理门店商品、订单与店员{'\n'}未绑定也能继续使用全部功能
          </Text>

          {/* 主通道：扫码。门店现场让店长出示二维码，比手抄 10 位码靠谱得多 */}
          <View className="mb-3">
            <Button className="!w-full !bg-primary !border-none !rounded-xl" onClick={handleScanBind} disabled={binding}>
              <View className="py-3 flex items-center justify-center">
                <Icon name="scan" size={18} color="#FFFFFF" />
                <Text className="ml-2 text-base text-white font-bold">
                  {binding ? '绑定中…' : '扫码绑定邀请码'}
                </Text>
              </View>
            </Button>
          </View>

          {/* 次通道：手输。输入框只做「大写 + 去符号」，分段展示放下方小字，避开受控 Input 光标跳动 */}
          <Text className="text-sm text-muted-foreground/60 block mb-2">或手动输入邀请码</Text>
          <View className="flex items-center gap-2 mb-2">
            <Input
              className="flex-1 bg-card border border-border rounded-xl px-3 py-2 text-base text-foreground"
              placeholder="LD8A3F1C2B"
              value={inviteCode}
              onInput={(e: any) => setInviteCode(normalize(e.detail.value))}
              maxlength={10}
            />
            <Button className="!bg-primary !text-white !rounded-xl !px-4 !m-0" onClick={handleBind} disabled={binding}>
              <View className="py-2 px-1 text-sm">{binding ? '绑定中' : '绑定'}</View>
            </Button>
          </View>
          {inviteCode.length > 0 && inviteCode.length < 10 && (
            <Text className="text-xs text-muted-foreground/60 block mb-4">已输入 {inviteCode.length}/10 位</Text>
          )}
          {inviteCode.length === 10 && (
            <Text className="text-xs text-primary block mb-4">{pretty(inviteCode)}</Text>
          )}

          <Button className="!bg-transparent !border !border-border !text-muted-foreground !rounded-xl" onClick={goMerchantCenter}>
            <View className="py-3 text-base">先进入管理后台浏览</View>
          </Button>
        </View>
      </View>
    </RouteGuard>
  )

  const hasMulti = staffList.length > 1

  return (
    <RouteGuard>
      <View className="min-h-screen bg-background pb-8">
        {/* 顶栏 */}
        <View className="px-4 pb-2" style={{ background: 'linear-gradient(160deg,hsl(var(--primary-soft)) 0%,hsl(var(--background)) 100%)' }}>
          <Text className="text-2xl font-bold text-foreground">员工中心</Text>
          <Text className="text-base text-muted-foreground mt-1 block">{staff.stores?.name || '未知店铺'}</Text>
        </View>

        {/* 多店切换 */}
        {hasMulti && (
          <View className="mx-4 mt-4">
            <Text className="text-sm text-muted-foreground block mb-2">我的门店（{staffList.length}）</Text>
            <View className="flex flex-wrap gap-2">
              {staffList.map((s, i) => (
                <View
                  key={s.id}
                  onClick={() => setActiveIdx(i)}
                  className={`px-3 py-2 rounded-xl border ${i === activeIdx ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                >
                  <Text className={`text-sm ${i === activeIdx ? 'text-white font-bold' : 'text-muted-foreground'}`}>
                    {s.stores?.name || '未知店铺'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 员工信息 */}
        <View className="mx-4 mt-4 p-4 rounded-2xl bg-card border border-border">
          <View className="flex items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
              <Text className="text-white font-bold text-xl">{ROLE_AVATAR[staff.role] || '员'}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{ROLE_LABEL[staff.role] || '成员'}</Text>
              <Text className="text-base text-muted-foreground">已绑定本店运营身份</Text>
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
            { icon: 'chart', label: '业绩统计', desc: '查看推荐业绩', color: '#15803D' },
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
