/**
 * 隐私协议弹窗组件
 * 首次进入小程序时弹出，用户同意后才能正常使用
 */
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'

export default function PrivacyModal() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 检查是否已经同意过
    const agreed = Taro.getStorageSync('privacyAgreed')
    if (!agreed) {
      // 延迟 500ms 弹出，让首屏先渲染
      setTimeout(() => setVisible(true), 500)
    }
  }, [])

  const handleAgree = () => {
    Taro.setStorageSync('privacyAgreed', '1')
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
        onClick={handleDisagree}
      />
      {/* 弹窗内容 */}
      <View className="relative w-80 rounded-2xl bg-white overflow-hidden">
        {/* 标题 */}
        <View className="px-6 pt-8 pb-4 flex flex-col items-center">
          <View className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <View className="i-mdi-shield-check text-4xl text-primary" />
          </View>
          <Text className="text-2xl font-bold text-foreground text-center">欢迎来到店有喜</Text>
          <Text className="text-base text-muted-foreground text-center mt-2 leading-relaxed">
            我们重视你的隐私保护，请阅读并同意以下协议
          </Text>
        </View>

        {/* 协议列表 */}
        <View className="px-6 pb-4 flex flex-col gap-3">
          <View className="flex items-center gap-2 py-2"
            onClick={() => Taro.navigateTo({ url: '/pages/user-agreement/index' })}>
            <View className="i-mdi-file-document text-xl text-primary" />
            <Text className="text-base text-primary flex-1">《用户服务协议》</Text>
            <View className="i-mdi-chevron-right text-base text-muted-foreground" />
          </View>
          <View className="flex items-center gap-2 py-2"
            onClick={() => Taro.navigateTo({ url: '/pages/privacy-policy/index' })}>
            <View className="i-mdi-shield-account text-xl text-primary" />
            <Text className="text-base text-primary flex-1">《隐私政策》</Text>
            <View className="i-mdi-chevron-right text-base text-muted-foreground" />
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
