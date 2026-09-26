import { View, Text } from '@tarojs/components'
import type { MutableRefObject } from 'react'
import type { CartConflict } from '@/utils/food-therapy'

export interface CheckoutRiskModalProps {
  riskModal: { conflicts: CartConflict[]; avoidNames: string[] } | null
  setRiskModal: (v: null) => void
  _riskAck: MutableRefObject<boolean>
  handlePay: () => void
}

export default function CheckoutRiskModal(props: CheckoutRiskModalProps) {
  const { riskModal, setRiskModal, _riskAck, handlePay } = props
  return (<>
 {/* 结算风险弹窗（食疗冲突 + 体质禁忌） */}
 {riskModal && (
 <View className="fixed inset-0 z-[1001] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} catchMove>
 <View className="w-10/12 max-h-4/5 bg-card rounded-3xl p-6 overflow-y-auto">
 <Text className="text-2xl font-bold text-foreground text-center block mb-1"> 结算健康小贴士</Text>
 <Text className="text-base text-muted-foreground text-center block mb-4">为你做了食疗冲突与体质适配检测</Text>
 <View className="gap-3 mb-6">
 {riskModal.conflicts.map((c, idx) => (
 <View key={idx} className="p-3 rounded-2xl border" style={{ background: c.level === 'danger' ? '#FEE2E2' : '#FEF3C7', borderColor: c.level === 'danger' ? '#FCA5A5' : '#FDE68A' }}>
 <View className="flex items-center gap-2 mb-1">
 <Text className="text-xl">{c.level === 'danger' ? '' : ''}</Text>
 <Text className="text-base font-bold" style={{ color: c.level === 'danger' ? '#B91C1C' : '#666666' }}>
 {c.type === 'warm_overlap' ? '温性叠加' : c.type === 'cold_hot_clash' ? '寒热对冲' : c.type === 'same_attr_overload' ? '同属性过量' : '相克慎搭'}
 </Text>
 </View>
 <Text className="text-base text-muted-foreground" style={{ display: 'block', lineHeight: '1.5' }}>{c.message}</Text>
 </View>
 ))}
 {riskModal.avoidNames.length > 0 && (
 <View className="p-3 rounded-2xl border" style={{ background: '#FEE2E2', borderColor: '#FCA5A5' }}>
 <View className="flex items-center gap-2 mb-1">
 <Text className="text-xl"></Text>
 <Text className="text-base font-bold" style={{ color: '#B91C1C' }}>体质暂不适宜</Text>
 </View>
 <Text className="text-base text-muted-foreground" style={{ display: 'block', lineHeight: '1.5' }}>
 根据当前所选状态，「{riskModal.avoidNames.join('、')}」属于不建议点范畴，建议替换或少量尝鲜。
 </Text>
 </View>
 )}
 </View>
 <View className="flex gap-3">
 <View className="flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-center text-xl font-bold" onClick={() => setRiskModal(null)}>去调整</View>
 <View className="flex-1 py-3 rounded-2xl bg-primary text-white text-center text-xl font-bold"
 onClick={() => { setRiskModal(null); _riskAck.current = true; handlePay() }}>仍要支付</View>
 </View>
 </View>
 </View>
 )}
</>)
}
