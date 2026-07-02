// @title 设置
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, Input } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { updateUserProfile, deleteUserAccount } from '@/db/api'
import { RouteGuard } from '@/components/RouteGuard'

function SettingsPage() {
  const { user, profile: ctxProfile, signOut } = useAuth()
  const [nickname, setNickname] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (ctxProfile) {
      setNickname(ctxProfile.nickname || '')
      setAvatarUrl(ctxProfile.avatar_url || '')
    }
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

  return (<RouteGuard>
    <View className="min-h-screen bg-background pb-10">
      {/* 导航 */}
      <View className="flex items-center px-4 pt-4 pb-2">
        <View className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <View className="i-mdi-arrow-left text-2xl text-foreground" />
        </View>
        <Text className="flex-1 text-center text-xl font-bold text-foreground pr-10">设置</Text>
      </View>

      {/* 个人资料卡 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <View className="i-mdi-account-circle text-2xl text-primary" />
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
                    <View className="i-mdi-account text-3xl text-muted-foreground" />
                  </View>}
            </View>
            {editing && <View className="i-mdi-camera text-2xl text-muted-foreground" />}
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
            {user?.phone ? `${user.phone.slice(0,3)}****${user.phone.slice(-4)}` : '未绑定'}
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
          <View className="i-mdi-bell-outline text-2xl text-primary" />
          <Text className="text-xl font-bold text-foreground">通知设置</Text>
        </View>
        {[
          { label: '订单消息', desc: '支付、发货、退款等通知' },
          { label: '活动推送', desc: '优惠券、限时活动等通知' },
        ].map(item => (
          <View key={item.label} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0">
            <View className="flex flex-col gap-1">
              <Text className="text-xl text-foreground">{item.label}</Text>
              <Text className="text-base text-muted-foreground">{item.desc}</Text>
            </View>
            <View className="w-12 h-7 rounded-full bg-primary flex items-end justify-end" style={{ padding: '2px' }}>
              <View className="w-6 h-6 rounded-full bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </View>
          </View>
        ))}
      </View>

      {/* 账号安全 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <View className="i-mdi-shield-account text-2xl text-primary" />
          <Text className="text-xl font-bold text-foreground">账号安全</Text>
        </View>
        <View className="flex items-center justify-between px-4 py-4 border-b border-border"
          onClick={() => Taro.showToast({ title: '请通过微信修改绑定手机号', icon: 'none' })}>
          <Text className="text-xl text-foreground">修改手机号</Text>
          <View className="i-mdi-chevron-right text-2xl text-muted-foreground" />
        </View>
        <View className="flex items-center justify-between px-4 py-4"
          onClick={handleDeleteAccount}>
          <Text className="text-xl text-red-400">注销账号</Text>
          <View className="i-mdi-chevron-right text-2xl text-muted-foreground" />
        </View>
      </View>

      {/* 关于 */}
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
        <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <View className="i-mdi-information-outline text-2xl text-primary" />
          <Text className="text-xl font-bold text-foreground">关于</Text>
        </View>
        {[
          { label: '用户协议', handler: () => Taro.navigateTo({ url: '/pages/user-agreement/index' }) },
          { label: '隐私政策', handler: () => Taro.navigateTo({ url: '/pages/privacy-policy/index' }) },
          { label: '版本信息', handler: () => Taro.showToast({ title: 'v1.0.0 来店有喜', icon: 'none' }) },
        ].map(item => (
          <View key={item.label} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0"
            onClick={item.handler}>
            <Text className="text-xl text-foreground">{item.label}</Text>
            <View className="i-mdi-chevron-right text-2xl text-muted-foreground" />
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
