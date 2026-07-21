// @title 设置
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, Input } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { updateUserProfile, deleteUserAccount } from '@/db/api'
import { RouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

function SettingsPage() {
  const { user, profile: ctxProfile, signOut } = useAuth()
  const [nickname, setNickname] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notifyOrder, setNotifyOrder] = useState(true)
  const [notifyPromo, setNotifyPromo] = useState(true)
  const [allowBehaviorAnalysis, setAllowBehaviorAnalysis] = useState(true)
  const [togglingAnalysis, setTogglingAnalysis] = useState(false)

  useEffect(() => {
    if (ctxProfile) {
      setNickname(ctxProfile.nickname || '')
      setAvatarUrl(ctxProfile.avatar_url || '')
      setAllowBehaviorAnalysis(ctxProfile.allow_behavior_analysis ?? true)
    }
    // 从本地存储读取通知设置
    const orderNotify = Taro.getStorageSync('notify_order')
    const promoNotify = Taro.getStorageSync('notify_promo')
    if (orderNotify !== '' && orderNotify !== undefined) setNotifyOrder(orderNotify)
    if (promoNotify !== '' && promoNotify !== undefined) setNotifyPromo(promoNotify)
  }, [ctxProfile])

  const handleSaveProfile = useCallback(async () => {
    if (!nickname.trim()) { Taro.showToast({ title: '昵称不能为空', icon: 'none' }); return }
    setSaving(true)
    const ok = await updateUserProfile({ nickname: nickname.trim(), avatar_url: avatarUrl || undefined })
    setSaving(false)
    if (ok) { Taro.showToast({ title: '保存成功', icon: 'success' }); setEditing(false) }
    else Taro.showToast({ title: '保存失败', icon: 'none' })
  }, [nickname, avatarUrl])

  const handleChangeAvatar = () => {
    Taro.chooseMedia({
      count: 1, mediaType: ['image'],
      success: (res) => {
        const tempPath = res.tempFiles[0]?.tempFilePath
        if (tempPath) setAvatarUrl(tempPath)
      },
    })
  }

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录', content: '确认退出当前账号？',
      confirmText: '退出', confirmColor: '#ef4444',
      success: async (r) => {
        if (r.confirm) { await signOut(); Taro.reLaunch({ url: '/pages/login/index' }) }
      },
    })
  }

  const handleDeleteAccount = () => {
    Taro.showModal({
      title: '注销账号',
      content: '注销后账号数据将无法恢复，我们将删除您的个人信息或对其进行匿名化处理。确认注销？',
      confirmText: '确认注销', confirmColor: '#ef4444',
      success: async (r) => {
        if (r.confirm) {
          Taro.showLoading({ title: '注销中…' })
          const ok = await deleteUserAccount()
          Taro.hideLoading()
          if (ok) {
            Taro.showToast({ title: '账号已注销', icon: 'success' })
            await signOut()
            Taro.reLaunch({ url: '/pages/login/index' })
          } else {
            Taro.showToast({ title: '注销失败，请联系客服', icon: 'none' })
          }
        }
      },
    })
  }

  const handleToggleAnalysis = useCallback(async () => {
    const next = !allowBehaviorAnalysis
    setAllowBehaviorAnalysis(next)
    setTogglingAnalysis(true)
    const ok = await updateUserProfile({ allow_behavior_analysis: next })
    setTogglingAnalysis(false)
    if (!ok) {
      setAllowBehaviorAnalysis(!next)
      Taro.showToast({ title: '设置失败，请重试', icon: 'none' })
    } else {
      Taro.showToast({ title: next ? '已开启个性化' : '已退出个性化', icon: 'success' })
    }
  }, [allowBehaviorAnalysis])

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">

      {/* 个人资料卡 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Icon name="account-circle" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">个人资料</Text>
          <View className="flex-1" />
          <View
            className="flex items-center justify-center leading-none rounded-lg bg-primary/10"
            onClick={() => setEditing(e => !e)}>
            <View className="px-3 py-1 text-xl text-primary">{editing ? '取消' : '编辑'}</View>
          </View>
        </View>

        {/* 头像 */}
        <View className="flex items-center justify-between px-4 py-4 border-b border-border">
          <Text className="text-xl text-foreground">头像</Text>
          <View className="flex items-center gap-2" onClick={editing ? handleChangeAvatar : undefined}>
            <View className="w-14 h-14 rounded-full bg-muted overflow-hidden border-2 border-border">
              {avatarUrl
                ? <Image src={avatarUrl} mode="aspectFill" style={{ width: '56px', height: '56px' }} />
                : <View className="w-full h-full flex items-center justify-center">
                    <Icon name="account" size={30} className="text-muted-foreground" />
                  </View>}
            </View>
            {editing && <Icon name="camera" size={24} className="text-muted-foreground" />}
          </View>
        </View>

        {/* 昵称 */}
        <View className="flex items-center justify-between px-4 py-4 border-b border-border">
          <Text className="text-xl text-foreground">昵称</Text>
          {editing ? (
            <View className="flex-1 ml-4 border-2 border-input rounded-xl px-3 py-2 bg-background overflow-hidden">
              <Input className="w-full text-xl text-foreground bg-transparent outline-none text-right"
                value={nickname}
                onInput={e => { const ev = e as any; setNickname(ev.detail?.value ?? ev.target?.value ?? '') }} />
            </View>
          ) : (
            <Text className="text-xl text-muted-foreground">{nickname || '未设置'}</Text>
          )}
        </View>

        {/* 手机号（脱敏显示） */}
        <View className="flex items-center justify-between px-4 py-4">
          <Text className="text-xl text-foreground">手机号</Text>
          <Text className="text-xl text-muted-foreground">
            {ctxProfile?.phone
              ? `${ctxProfile.phone.slice(0,3)}****${ctxProfile.phone.slice(-4)}`
              : user?.phone
                ? `${user.phone.slice(0,3)}****${user.phone.slice(-4)}`
                : '去绑定'}
          </Text>
        </View>

        {/* 保存按钮 */}
        {editing && (
          <View className="px-4 pb-4">
            <View
              className={`w-full flex items-center justify-center leading-none rounded-2xl ${saving ? 'bg-primary/50' : 'bg-primary'}`}
              onClick={handleSaveProfile}>
              <View className="py-3 text-xl font-bold text-white">{saving ? '保存中…' : '保存修改'}</View>
            </View>
          </View>
        )}
      </View>

      {/* 通知设置 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Icon name="bell-outline" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">通知设置</Text>
        </View>
        {[
          { label: '订单消息', desc: '支付、发货、退款等通知', key: 'order' },
          { label: '活动推送', desc: '优惠券、限时活动等通知', key: 'promo' },
        ].map(item => {
          const isOn = item.key === 'order' ? notifyOrder : notifyPromo
          const toggle = () => {
            if (item.key === 'order') {
              setNotifyOrder(v => { Taro.setStorageSync('notify_order', !v); return !v })
            } else {
              setNotifyPromo(v => { Taro.setStorageSync('notify_promo', !v); return !v })
            }
          }
          return (
            <View key={item.label} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0"
              onClick={toggle}>
              <View className="flex flex-col gap-1">
                <Text className="text-xl text-foreground">{item.label}</Text>
                <Text className="text-base text-muted-foreground">{item.desc}</Text>
              </View>
              <View
                className="w-12 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: isOn ? '#22C55E' : '#D1D5DB', padding: '2px' }}>
                <View
                  className="w-6 h-6 rounded-full bg-white"
                  style={{
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    alignSelf: isOn ? 'flex-end' : 'flex-start',
                    transition: 'all 0.2s',
                  }} />
              </View>
            </View>
          )
        })}
      </View>

      {/* 隐私与个性化 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Icon name="shield-lock-outline" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">隐私与个性化</Text>
        </View>
        <View className="flex items-center justify-between px-4 py-4"
          onClick={togglingAnalysis ? undefined : handleToggleAnalysis}>
          <View className="flex flex-col gap-1">
            <Text className="text-xl text-foreground">允许行为分析</Text>
            <Text className="text-base text-muted-foreground">用于优化推荐与成长体验；关闭后后台分析将排除您的数据</Text>
          </View>
          <View
            className="w-12 h-7 rounded-full flex items-center justify-center"
            style={{ backgroundColor: allowBehaviorAnalysis ? '#22C55E' : '#D1D5DB', padding: '2px' }}>
            <View
              className="w-6 h-6 rounded-full bg-white"
              style={{
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                alignSelf: allowBehaviorAnalysis ? 'flex-end' : 'flex-start',
                transition: 'all 0.2s',
              }} />
          </View>
        </View>
      </View>

      {/* 账号安全 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Icon name="shield-account" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">账号安全</Text>
        </View>
        <View className="flex items-center justify-between px-4 py-4 border-b border-border"
          onClick={() => Taro.showToast({ title: '请通过微信修改绑定手机号', icon: 'none' })}>
          <Text className="text-xl text-foreground">修改手机号</Text>
          <Icon name="chevron-right" size={24} className="text-muted-foreground" />
        </View>
        <View className="flex items-center justify-between px-4 py-4"
          onClick={handleDeleteAccount}>
          <Text className="text-xl text-red-400">注销账号</Text>
          <Icon name="chevron-right" size={24} className="text-muted-foreground" />
        </View>
      </View>

      {/* 关于 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Icon name="information-outline" size={24} className="text-primary" />
          <Text className="text-xl font-bold text-foreground">关于</Text>
        </View>
        {[
          { label: '用户协议', handler: () => Taro.navigateTo({ url: '/pages/user-agreement/index' }) },
          { label: '隐私政策', handler: () => Taro.navigateTo({ url: '/pages/privacy-policy/index' }) },
          { label: '交易规则', handler: () => Taro.navigateTo({ url: '/pages/trade-rules/index' }) },
          { label: '提现规则', handler: () => Taro.navigateTo({ url: '/pages/withdraw-rules/index' }) },
          { label: '佣金规则', handler: () => Taro.navigateTo({ url: '/pages/commission-rules/index' }) },
          { label: '段位规则', handler: () => Taro.navigateTo({ url: '/pages/rank-rules/index' }) },
          { label: '资产规则', handler: () => Taro.navigateTo({ url: '/pages/points-rules/index' }) },
          { label: '商家入驻协议', handler: () => Taro.navigateTo({ url: '/pages/merchant-agreement/index' }) },
          { label: '版本信息', handler: () => Taro.showToast({ title: 'v1.0.0 来电有喜', icon: 'none' }) },
        ].map(item => (
          <View key={item.label} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0"
            onClick={item.handler}>
            <Text className="text-xl text-foreground">{item.label}</Text>
            <Icon name="chevron-right" size={24} className="text-muted-foreground" />
          </View>
        ))}
      </View>

      {/* 退出登录 */}
      <View className="mx-4 mt-4">
        <View
          className="w-full flex items-center justify-center leading-none rounded-2xl border-2 border-red-300 bg-card"
          onClick={handleLogout}>
          <View className="py-4 text-xl font-bold text-red-400">退出登录</View>
        </View>
      </View>
    </View>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default SettingsPage
