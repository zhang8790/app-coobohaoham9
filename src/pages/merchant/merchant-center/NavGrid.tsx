// 自营门店中心：功能导航网格
// 分组与条目严格对齐网页版自营后台（admin-web MerchantLayout 的 MERCHANT_NAV_GROUPS），
// 保证「用户端自营门店管理中心」与「网页版管理后台」功能一一对应。
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'

type NavAction = 'vehicles'

interface NavItem {
  key: string
  icon: string
  label: string
  to?: string
  action?: NavAction
}

interface NavGroup {
  title: string
  items: NavItem[]
}

interface NavGridProps {
  storeId?: string | null
  onOpenVehicles?: () => void
}

export default function NavGrid({ storeId, onOpenVehicles }: NavGridProps) {
  const withdrawUrl = storeId
    ? `/pages/trade/withdraw/index?kind=settlement&storeId=${storeId}`
    : '/pages/trade/withdraw/index?kind=settlement'

  // 日常运营（对齐网页版：商品/订单/会员/数据/消息/提现/优惠券/广告/条码/小票）
  // 进阶设置（对齐网页版：流动车/运营成员/店铺设置）
  // 门店专属（小程序端特色能力，网页版无对应项，保留以示差异）
  const GROUPS: NavGroup[] = [
    {
      title: '日常运营',
      items: [
        { key: 'products', icon: 'box', label: '商品管理', to: '/pages/merchant/merchant-products/index' },
        { key: 'orders', icon: 'order', label: '订单管理', to: '/pages/merchant/merchant-orders/index' },
        { key: 'members', icon: 'user', label: '会员管理', to: '/pages/merchant/merchant-members/index' },
        { key: 'analytics', icon: 'chart', label: '数据分析', to: '/pages/merchant/merchant-analytics/index' },
        { key: 'messages', icon: 'bell-outline', label: '消息通知', to: '/pages/merchant/merchant-messages/index' },
        { key: 'withdraw', icon: 'coin', label: '货款提现', to: withdrawUrl },
        { key: 'coupons', icon: 'ticket', label: '优惠券', to: '/pages/merchant/merchant-coupons/index' },
        { key: 'ads', icon: 'bullhorn', label: '广告投放', to: '/pages/merchant/merchant-ads/index' },
        { key: 'barcode', icon: 'barcode-scan', label: '条形码制作', to: '/pages/merchant/merchant-products/index?action=barcode' },
        { key: 'printers', icon: 'receipt-text', label: '小票打印', to: '/pages/merchant/merchant-settings/index?section=printer' },
      ],
    },
    {
      title: '进阶设置',
      items: [
        { key: 'vehicles', icon: 'truck', label: '流动车', action: 'vehicles' },
        { key: 'staff', icon: 'account-group', label: '运营成员', to: '/pages/ext/employee/index' },
        { key: 'settings', icon: 'shop', label: '店铺设置', to: '/pages/merchant/merchant-settings/index' },
      ],
    },
    {
      title: '门店专属',
      items: [
        { key: 'expiry', icon: 'clock-outline', label: '临期预警', to: '/pages/merchant/merchant-expiry/index' },
        { key: 'copy', icon: 'video', label: '食疗文案', to: '/pages/merchant/food-therapy-copy/index' },
      ],
    },
  ]

  const handleTap = (item: NavItem) => {
    if (item.action === 'vehicles') { onOpenVehicles?.(); return }
    if (item.to) Taro.navigateTo({ url: item.to })
  }

  return (
    <View>
      {GROUPS.map(group => (
        <View key={group.title} className="px-4 mt-5">
          <Text className="text-lg font-bold text-foreground">{group.title}</Text>
          <View className="grid grid-cols-4 gap-3 mt-3">
            {group.items.map(item => (
              <View key={item.key} className="flex flex-col items-center gap-2 py-4 px-1 bg-card rounded-2xl border border-border"
                onClick={() => handleTap(item)}>
                <View className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Icon name={item.icon} size={22} className="text-primary" />
                </View>
                <Text className="text-base text-foreground text-center font-bold whitespace-nowrap">{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}
