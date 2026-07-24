/**
 * 隐私协议弹窗组件
 * 首次进入小程序时弹出，用户同意后才能正常使用
 */
import { useState, useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/Icon'

// 把同意时间写入 profiles.privacy_consented_at（PIPL 审计留痕，幂等）
async function recordConsent(userId: string) {
  try {
    await supabase.from('profiles')
      .update({ privacy_consented_at: new Date().toISOString() })
      .eq('id', userId)
  } catch (e) {
    console.warn('[PrivacyModal] 写入同意时间失败（不影响使用）', e)
  }
}

export default function PrivacyModal() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const consentFlushed = useRef(false)

  useEffect(() => {
    // 检查是否已经同意过
    const agreed = Taro.getStorageSync('privacyAgreed')
    if (!agreed) {
      // 延迟 500ms 弹出，让首屏先渲染
      setTimeout(() => setVisible(true), 500)
    }
  }, [])

  // 已本地同意、但当时未登录导致 DB 未留痕：登录后自动回填一次
  useEffect(() => {
    if (consentFlushed.current) return
    const agreed = Taro.getStorageSync('privacyAgreed')
    if (agreed && user) {
      consentFlushed.current = true
      recordConsent(user.id)
    }
  }, [user])

  const handleAgree = async () => {
    Taro.setStorageSync('privacyAgreed', '1')
    // 已登录则同步落库；未登录时由上面的回填 effect 在登录后补写
    if (user) recordConsent(user.id)
    setVisible(false)
  }

  const handleDisagree = () => {
    Taro.showModal({
      title: '提示',
      content: '需要同意隐私协议才能正常使用小程序功能',
      showCancel: false,
      confirmText: '我知道了',
    })
  }

  if (!visible) return null

  return (
    <View className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <View
        className="absolute inset-0 bg-black/50"
        onClick={handleDisagree} />
      {/* 弹窗内容 */}
      <View className="relative w-80 rounded-2xl bg-white overflow-hidden">
        {/* 标题 */}
        <View className="px-6 pt-8 pb-4 flex flex-col items-center">
          <View className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Icon name="shield-check" size={36} className="text-primary" />
          </View>
          <Text className="text-2xl font-bold text-foreground text-center">欢迎来到店有喜</Text>
          <Text className="text-base text-muted-foreground text-center mt-2 leading-relaxed">
            我们重视你的隐私保护，请阅读并同意以下协议
          </Text>
        </View>

        {/* 协议列表 */}
        <View className="px-6 pb-4 flex flex-col gap-3">
          <View className="flex items-center gap-2 py-2"
            onClick={() => Taro.navigateTo({ url: '/pages/agreement/user-agreement/index' })}>
            <Icon name="file-document" size={20} className="text-primary" />
            <Text className="text-base text-primary flex-1">《用户服务协议》</Text>
            <Icon name="chevron-right" size={16} className="text-muted-foreground" />
          </View>
          <View className="flex items-center gap-2 py-2"
            onClick={() => Taro.navigateTo({ url: '/pages/agreement/privacy-policy/index' })}>
            <Icon name="shield-account" size={20} className="text-primary" />
            <Text className="text-base text-primary flex-1">《隐私政策》</Text>
            <Icon name="chevron-right" size={16} className="text-muted-foreground" />
          </View>
        </View>

        {/* 按钮 */}
        <View className="px-6 pb-8 flex flex-col gap-3">
          <Button
            className="w-full rounded-xl bg-primary text-white text-xl font-bold leading-none"
            onClick={handleAgree}
          >
            <View className="py-3">同意并继续</View>
          </Button>
          <Button
            className="w-full rounded-xl bg-muted text-muted-foreground text-base leading-none"
            onClick={handleDisagree}
          >
            <View className="py-3">不同意</View>
          </Button>
        </View>
      </View>
    </View>
  )
}
