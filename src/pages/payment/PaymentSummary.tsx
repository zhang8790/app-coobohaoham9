import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'
import type { PayMode } from '@/db/types'

export interface SummaryInvalidItem { product_id: string; name: string; reason: string }
export interface MinOrderError { storeId: string; storeName: string; min: number; current: number; shortfall: number }
export interface DeliveryRadiusError { storeId: string; storeName: string; radius: number; distance: number }

export interface PaymentSummaryProps {
  countdownDisplay: string
  orderNo: string
  totalAmount: number
  deliveryFee: number
  deductYuan: number
  actualGoldBeansUsed: number
  wxpayAmount: number
  payMode: PayMode
  balance: number
  serviceType: 'dine_in' | 'delivery'
  invalid: SummaryInvalidItem[]
  minOrderErrors: MinOrderError[]
  repayMode: boolean
  deliveryRadiusErrors: DeliveryRadiusError[]
}

export default function PaymentSummary(props: PaymentSummaryProps) {
  const { countdownDisplay, orderNo, totalAmount, deliveryFee, deductYuan, actualGoldBeansUsed, wxpayAmount, payMode, balance, serviceType, invalid, minOrderErrors, repayMode, deliveryRadiusErrors } = props
  return (<>
 <View className="mx-4 mt-6 p-5 rounded-2xl bg-card border border-border flex flex-col items-center">
 <Icon name="clock-outline" size={36} className="text-primary mb-2" />
 <Text className="text-xl text-muted-foreground">请在以下时间内完成支付</Text>
 <Text className="text-4xl font-bold text-primary mt-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{countdownDisplay}</Text>
 {orderNo && <Text className="text-base text-muted-foreground mt-2">订单号：{orderNo}</Text>}
 </View>

 {/* 金额汇总卡 */}
 <View className="mx-4 mt-4 p-4 rounded-2xl bg-card border-2 border-primary">
 <View className="flex items-center justify-between">
 <Text className="text-xl font-bold text-foreground">商品金额</Text>
 <Text className="text-2xl font-bold text-foreground">¥{totalAmount.toFixed(2)}</Text>
 </View>
 {deliveryFee > 0 && (
 <View className="flex items-center justify-between mt-2">
 <Text className="text-xl text-muted-foreground">配送费</Text>
 <Text className="text-xl font-bold text-foreground">¥{deliveryFee.toFixed(2)}</Text>
 </View>
 )}
 {serviceType === 'delivery' && deliveryFee === 0 && (
 <View className="flex items-center justify-between mt-2">
 <Text className="text-xl text-muted-foreground">配送费</Text>
 <Text className="text-xl font-bold text-primary">已免配送费</Text>
 </View>
 )}
 {deductYuan > 0 && (
 <View className="flex items-center justify-between mt-2">
 <Text className="text-xl text-muted-foreground">健康豆抵扣（{actualGoldBeansUsed}健康豆）</Text>
 <Text className="text-xl font-bold text-primary">-¥{deductYuan.toFixed(2)}</Text>
 </View>
 )}
 <View className="h-px bg-border mt-3 mb-3" />
 <View className="flex items-center justify-between">
 <Text className="text-xl font-bold text-foreground">实付金额</Text>
 <Text className="text-3xl font-bold text-primary">
 {payMode === 'pure_gold' ? `${actualGoldBeansUsed} 健康豆` : `¥${wxpayAmount.toFixed(2)}`}
 </Text>
 </View>
 {balance > 0 && (
 <View className="flex items-center gap-2 mt-2">
 <Icon name="star-circle" size={20} />
 <Text className="text-xl text-muted-foreground">健康豆余额：<Text className="font-bold text-foreground">{balance} 健康豆</Text></Text>
 </View>
 )}
 </View>

 {/* 失效商品警示（下单前预校验拦截，避免点到 createOrderV2 才报 INVALID_PRODUCT） */}
 {invalid.length > 0 && (
 <View className="mx-4 mt-4 p-4 rounded-2xl border-2 border-destructive/40 bg-destructive/5">
 <View className="flex items-center gap-2 mb-2">
 <Icon name="alert-circle" size={24} className="text-red-500" />
 <Text className="text-xl font-bold text-red-500">部分商品无法购买</Text>
 </View>
 {invalid.map((it, idx) => (
 <View key={idx} className="flex items-center gap-2 py-1">
 <Text className="text-base text-red-500/70">•</Text>
 <Text className="text-base text-foreground flex-shrink-0">{it.name}</Text>
 <Text className="text-base text-red-500 flex-1 text-right">{it.reason}</Text>
 </View>
 ))}
 <Text className="text-base text-muted-foreground mt-2">请移除失效商品或联系门店处理后再支付</Text>
 </View>
 )}

 {/* 起送价校验警示（每店独立校验，任一家不达标则拦截） */}
 {minOrderErrors.length > 0 && !repayMode && (
 <View className="mx-4 mt-4 p-4 rounded-2xl border-2 border-destructive/40 bg-destructive/5">
 <View className="flex items-center gap-2 mb-2">
 <Icon name="alert-circle" size={24} className="text-red-500" />
 <Text className="text-xl font-bold text-red-500">未达门店起送价</Text>
 </View>
 {minOrderErrors.map((e, idx) => (
 <View key={idx} className="flex items-center gap-2 py-1">
 <Text className="text-base text-red-500/70">•</Text>
 <Text className="text-base text-foreground flex-shrink-0">{e.storeName}</Text>
 <Text className="text-base text-red-500 flex-1 text-right">还差 ¥{e.shortfall.toFixed(2)}（起送 ¥{e.min.toFixed(2)}）</Text>
 </View>
 ))}
 <Text className="text-base text-muted-foreground mt-2">请增加该门店商品或分开结算</Text>
 </View>
 )}

 {/* 配送半径硬校验警示（收货地址超出门店配送范围则拦截） */}
 {deliveryRadiusErrors.length > 0 && !repayMode && (
 <View className="mx-4 mt-4 p-4 rounded-2xl border-2 border-destructive/40 bg-destructive/5">
 <View className="flex items-center gap-2 mb-2">
 <Icon name="alert-circle" size={24} className="text-red-500" />
 <Text className="text-xl font-bold text-red-500">超出门店配送范围</Text>
 </View>
 {deliveryRadiusErrors.map((e, idx) => (
 <View key={idx} className="flex items-center gap-2 py-1">
 <Text className="text-base text-red-500/70">•</Text>
 <Text className="text-base text-foreground flex-shrink-0">{e.storeName}</Text>
 <Text className="text-base text-red-500 flex-1 text-right">距店约 {e.distance.toFixed(1)}km（限 {e.radius}km）</Text>
 </View>
 ))}
 <Text className="text-base text-muted-foreground mt-2">请重选配送范围内的收货地址</Text>
 </View>
 )}
</>)
}
