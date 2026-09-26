// 商家中心：快捷操作（新增商品 / 扫码上架，纯展示，零逻辑改动）
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import Icon from '@/components/Icon'

export default function QuickActions() {
  return (
    <View className="px-4 mt-4">
      <Text className="text-lg font-bold text-foreground mb-2">快捷操作</Text>
      <View className="flex gap-3">
        <Button className="!flex-1 !m-0 !p-0 !bg-primary !border-none !rounded-2xl !leading-none"
          onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-products/index?action=add' })}>
          <View className="py-3 flex items-center gap-1">
            <Icon name="plus" size={20} className="text-white" />
            <Text className="text-base font-bold text-white">新增商品</Text>
          </View>
        </Button>
        <Button className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-primary !rounded-2xl !leading-none"
          onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-products/index?action=scan' })}>
          <View className="py-3 flex items-center gap-1">
            <Icon name="barcode-scan" size={20} className="text-primary" />
            <Text className="text-base font-bold text-primary">扫码上架</Text>
          </View>
        </Button>
      </View>
    </View>
  )
}
