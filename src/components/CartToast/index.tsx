// 全局加购成功提示条：加购后底部居中弹「已加入购物车 · 去结算 ›」，
// 点「去结算」直达购物车结算页（cart 是 tabBar 页 → switchTab）。
// 挂载于 App 根（app.tsx），由 cartToast store 驱动，单实例全局生效。
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import Icon from '@/components/Icon'
import { useCartToast, hideCartToast } from '@/utils/cartToast'

export default function CartToast() {
  const { visible, message } = useCartToast()
  if (!visible) return null
  return (
    <View
      onClick={() => {
        hideCartToast()
        // cart 是 tabBar 页，必须用 switchTab（navigateTo 会失败）
        Taro.switchTab({ url: '/pages/cart/index' })
      }}
      className="fixed left-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-white shadow-2xl"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        transform: 'translateX(-50%)',
      }}
    >
      <Icon name="check-circle" size={22} className="text-white" />
      <Text className="text-base font-bold">{message}</Text>
      <View className="flex items-center pl-2 ml-1 border-l border-white/30">
        <Text className="text-base font-bold">去结算</Text>
        <Text className="text-base font-bold ml-1">›</Text>
      </View>
    </View>
  )
}
