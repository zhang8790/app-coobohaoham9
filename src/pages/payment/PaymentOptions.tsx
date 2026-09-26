import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import Icon from '@/components/Icon'
import type { PayMode } from '@/db/types'
import { SERVICE_META } from './payment-utils'
import { haversineKm } from '@/utils/coord-convert'

export interface PayModeOption { key: PayMode; icon: string; label: string; color: string; desc: string; disabled?: boolean }

export interface PaymentOptionsProps {
  availableServiceTypes: Array<'dine_in' | 'delivery'>
  serviceType: 'dine_in' | 'delivery'
  setServiceType: (t: 'dine_in' | 'delivery') => void
  storeFulfillment: Record<string, any>
  selectedAddress: any
  repayMode: boolean
  payModes: PayModeOption[]
  payMode: PayMode
  pureGoldShort: number
  handleModeChange: (m: PayMode) => void
  maxGoldBeans: number
  goldBeansToUse: number
  setGoldBeansToUse: (n: number) => void
  balance: number
}

export default function PaymentOptions(props: PaymentOptionsProps) {
  const { availableServiceTypes, serviceType, setServiceType, storeFulfillment, selectedAddress, repayMode, payModes, payMode, pureGoldShort, handleModeChange, maxGoldBeans, goldBeansToUse, setGoldBeansToUse, balance } = props
  return (<>
 {/* 服务方式选择（Phase 2：按门店能力交集动态渲染） */}
 <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
 <View className="px-4 py-3 border-b border-border">
 <Text className="text-xl font-bold text-foreground">取货方式</Text>
 </View>
 <View className="flex gap-0">
 {availableServiceTypes.map((key, i, arr) => {
 const m = SERVICE_META[key]
 const isSel = serviceType === key
 return (
 <View key={key}
 className={`flex-1 flex flex-col items-center gap-1 py-4 ${i < arr.length - 1 ? 'border-r border-border' : ''} ${isSel ? 'bg-primary/5' : ''}`}
 onClick={() => { if (repayMode) return; setServiceType(key) }}>
 <View className={`${m.icon} text-3xl ${isSel ? 'text-primary' : 'text-muted-foreground'}`} />
 <Text className={`text-xl font-bold ${isSel ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</Text>
 {isSel && <View className="w-5 h-1 rounded-full bg-primary" />}
 </View>
 )
 })}
 </View>
 {/* 配送半径实况（按收货地址坐标硬校验） */}
 {serviceType === 'delivery' && (() => {
 const radii = Object.values(storeFulfillment).map(s => s.delivery_radius).filter((r): r is number => typeof r === 'number' && r > 0)
 if (radii.length === 0) return null
 // 收货地址无坐标：提示重选带定位的地址
 if (!selectedAddress?.lat || !selectedAddress?.lng) {
 return (
 <View className="px-4 py-2 border-t border-border flex items-center gap-2">
 <Icon name="info" size={16} className="text-amber-500" />
 <Text className="text-base text-muted-foreground">请选择带地图定位的收货地址以确认配送范围</Text>
 </View>
 )
 }
 const maxD = Math.max(...Object.values(storeFulfillment).map(f => {
 if (!f.lat || !f.lng) return 0
 return haversineKm(selectedAddress.lat, selectedAddress.lng, f.lat, f.lng)
 }))
 const limit = Math.max(...radii)
 const ok = maxD <= limit
 return (
 <View className="px-4 py-2 border-t border-border flex items-center gap-2">
 <Icon name={ok ? 'check-circle' : 'alert-circle'} size={16} className={ok ? 'text-primary' : 'text-amber-500'} />
 <Text className="text-base text-muted-foreground">
 {ok ? `收货地址在配送范围内（门店限 ${limit} 公里）` : `收货地址超出配送范围（最近门店约 ${maxD.toFixed(1)} 公里）`}
 </Text>
 </View>
 )
 })()}
 </View>

 {/* 地址选择（配送时显示） */}
 {serviceType === 'delivery' && (
 <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
 <View className="px-4 py-3 border-b border-border flex items-center justify-between">
 <Text className="text-xl font-bold text-foreground">收货地址</Text>
 <View onClick={() => Taro.navigateTo({ url: '/pages/mine/address/index' })}>
 <Text className="text-xl text-primary">管理</Text>
 </View>
 </View>
 {selectedAddress ? (
 <View className="px-4 py-4" onClick={() => Taro.navigateTo({ url: '/pages/mine/address/index' })}>
 <View className="flex items-center gap-2 mb-2">
 <Text className="text-xl font-bold text-foreground">{selectedAddress.name}</Text>
 <Text className="text-xl text-muted-foreground">{selectedAddress.phone}</Text>
 {selectedAddress.is_default && (
 <Text className="text-base px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">默认</Text>
 )}
 </View>
 <Text className="text-xl text-foreground">
 {[selectedAddress.province, selectedAddress.city, selectedAddress.district, selectedAddress.detail].filter(Boolean).join(' ')}
 </Text>
 </View>
 ) : (
 <View className="px-4 py-8 flex flex-col items-center gap-2"
 onClick={() => Taro.navigateTo({ url: '/pages/mine/address/index' })}>
 <View className="text-primary"><Icon name="location" size={32} /></View>
 <Text className="text-xl text-primary font-bold">新增收货地址</Text>
 </View>
 )}
 </View>
 )}

 {/* 支付方式选择 */}
 <View className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
 <View className="px-4 py-3 border-b border-border">
 <Text className="text-xl font-bold text-foreground">选择支付方式</Text>
 </View>
 {payModes.map(m => (
 <View key={m.key}
 className={`flex items-center gap-4 px-4 py-4 border-b border-border last:border-0 ${m.disabled ? 'opacity-40' : ''} ${payMode === m.key ? 'bg-primary/5' : ''}`}
 onClick={() => {
 if (repayMode) return // 重付模式：支付方式为订单锁定，不可切换
 if (m.disabled) {
 if (m.key === 'pure_gold') Taro.showToast({ title: `健康豆余额不足，还需 ${pureGoldShort} 健康豆`, icon: 'none' })
 return
 }
 handleModeChange(m.key)
 }}>
 <View className={`${m.icon} text-3xl flex-shrink-0`} style={{ color: m.color }} />
 <View className="flex-1">
 <Text className="text-xl font-bold text-foreground">{m.label}</Text>
 <Text className="text-base text-muted-foreground">{m.desc}</Text>
 </View>
 <View className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${payMode === m.key ? 'border-primary bg-primary' : 'border-border'}`}>
 {payMode === m.key && <Icon name="check" size={12} className="text-white" />}
 </View>
 </View>
 ))}
 </View>

 {/* 混合支付：健康豆抵扣输入 */}
 {payMode === 'hybrid' && balance > 0 && !repayMode && (
 <View className="mx-4 mt-4 p-4 bg-card rounded-2xl border border-border">
 <View className="flex items-center justify-between mb-3">
 <Text className="text-xl font-bold text-foreground">健康豆抵扣数量</Text>
 <Text className="text-xl text-muted-foreground">可用 {maxGoldBeans} 健康豆</Text>
 </View>
 <View className="flex items-center gap-3">
 <View
 className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
 onClick={() => setGoldBeansToUse(Math.max(0, goldBeansToUse - 10))}>
 <Icon name="minus" size={20} className="text-foreground" />
 </View>
 <View className="flex-1 border-2 border-input rounded-xl px-4 py-2 bg-background overflow-hidden">
 <Input
 type="number"
 className="w-full text-2xl font-bold text-center text-foreground bg-transparent outline-none"
 value={String(goldBeansToUse)}
 onInput={(e) => { const ev = e as any; const v = parseFloat(ev.detail?.value ?? ev.target?.value ?? '0'); setGoldBeansToUse(Number.isFinite(v) ? Math.min(maxGoldBeans, Math.max(0, v)) : 0) }} />
 </View>
 <View
 className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
 onClick={() => setGoldBeansToUse(Math.min(maxGoldBeans, goldBeansToUse + 10))}>
 <Icon name="plus" size={20} className="text-foreground" />
 </View>
 <View
 className="flex items-center justify-center leading-none rounded-xl bg-primary/10"
 onClick={() => setGoldBeansToUse(maxGoldBeans)}>
 <View className="py-2 px-3 text-xl text-primary font-bold">全用</View>
 </View>
 </View>
 </View>
 )}
</>)
}
