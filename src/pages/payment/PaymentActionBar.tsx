import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import type { PayMode } from '@/db/types'

export interface PaymentActionBarProps {
  payBtnText: string
  productCheck: { loading: boolean; invalid: Array<{ product_id: string; name: string; reason: string }> }
  repayMode: boolean
  minOrderErrors: Array<{ storeId: string; storeName: string; min: number; current: number; shortfall: number }>
  deliveryRadiusErrors: Array<{ storeId: string; storeName: string; radius: number; distance: number }>
  paying: boolean
  handlePay: () => void
  handleCancel: () => void
}

export default function PaymentActionBar(props: PaymentActionBarProps) {
  const { payBtnText, productCheck, repayMode, minOrderErrors, deliveryRadiusErrors, paying, handlePay, handleCancel } = props
  return (<>
 {/* 底部留白：避免固定操作栏遮挡最后一张卡片 */}
 <View style={{ height: '180px' }} />

 {/* 操作按钮：固定底部栏，永远可见可点，不被长内容 / 弹窗遮挡 */}
 <View
 className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t-2 border-border px-4 pt-3 flex flex-col gap-3"
 style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
 <View
 className={`w-full flex items-center justify-center leading-none rounded-2xl ${productCheck.loading || productCheck.invalid.length > 0 || (!repayMode && (minOrderErrors.length > 0 || deliveryRadiusErrors.length > 0)) ? 'bg-muted opacity-50' : (paying ? 'bg-primary/50' : 'bg-primary')}`}
 onClick={handlePay}>
 <View className="py-4 text-2xl font-bold text-white">{payBtnText}</View>
 </View>
 <View
 className="w-full flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card"
 onClick={handleCancel}>
 <View className="py-4 text-xl text-muted-foreground">取消支付</View>
 </View>
 <View
 className="flex items-center justify-center py-1"
 onClick={() => Taro.navigateTo({ url: '/pages/agreement/trade-rules/index' })}>
 <Text className="text-base text-muted-foreground text-center">支付即视为同意<Text className="text-primary">《来店有喜交易规则》</Text></Text>
 </View>
 </View>
</>)
}
