import { View, Text } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'

export default function MyBadges() {
  useLoad(() => {
    console.log('[my-badges] loaded')
  })

  return (
    <View className="flex flex-col items-center justify-center min-h-screen px-8 bg-white">
      <Text className="text-6xl mb-4">🏅</Text>
      <Text className="text-lg font-bold text-gray-800 mb-2">我的徽章</Text>
      <Text className="text-sm text-gray-400 text-center leading-relaxed">
        会员徽章体系功能建设中，敬请期待
      </Text>
    </View>
  )
}
