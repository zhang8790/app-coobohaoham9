// 商家中心：功能导航网格（纯展示，导航项本地维护，零逻辑改动）
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'

// 仪表盘导航项（统一主题清新绿淡底，消除多色彩虹网格）
const NAV_ITEMS = [
  { to: '/pages/merchant/merchant-products/index', icon: 'box', label: '商品管理', color: 'bg-primary/10', key: 'products' },
  { to: '/pages/merchant/merchant-orders/index', icon: 'order', label: '订单管理', color: 'bg-primary/10', key: 'orders' },
  { to: '/pages/merchant/merchant-members/index', icon: 'user', label: '会员管理', color: 'bg-primary/10', key: 'members' },
  { to: '/pages/merchant/merchant-coupons/index', icon: 'ticket', label: '优惠券', color: 'bg-primary/10', key: 'coupons' },
  { to: '/pages/merchant/merchant-analytics/index', icon: 'chart', label: '数据分析', color: 'bg-primary/10', key: 'analytics' },
  { to: '/pages/merchant/merchant-settings/index', icon: 'shop', label: '店铺设置', color: 'bg-primary/10', key: 'settings' },
  { to: '/pages/trade/withdraw/index', icon: 'coin', label: '货款提现', color: 'bg-primary/10', key: 'withdraw' },
  { to: '/pages/merchant/merchant-expiry/index', icon: 'bell-outline', label: '临期预警', color: 'bg-primary/10', key: 'expiry' },
  { to: '/pages/merchant/food-therapy-copy/index', icon: 'video', label: '食疗文案', color: 'bg-primary/10', key: 'copy' },
]

export default function NavGrid() {
  return (
    <View className="grid grid-cols-4 gap-3 px-4 mt-4">
      {NAV_ITEMS.map((item) => (
        <View key={item.key} className="flex flex-col items-center gap-2 py-4 px-1 bg-card rounded-2xl border border-border"
          onClick={() => Taro.navigateTo({ url: item.to })}>
          <View className={`w-11 h-11 rounded-2xl ${item.color} flex items-center justify-center`}>
            <Icon name={item.icon} size={22} className="text-primary" />
          </View>
          <Text className="text-base text-foreground text-center font-bold whitespace-nowrap">{item.label}</Text>
        </View>
      ))}
    </View>
  )
}
