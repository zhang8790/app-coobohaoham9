// @title 门店选择底部弹层（多门店发现/切换，Phase 1）
import { View, Text, ScrollView } from '@tarojs/components'
import { NearestStore } from '@/db/api'

/** 超过此距离视为「跨城门店」：首页 pill 不再显示该距离，选择器里也降为灰色小字 */
export const FAR_STORE_KM = 50

interface StorePickerSheetProps {
 open: boolean
 onClose: () => void
 stores: NearestStore[]
 /** 当前生效门店 id（高亮用）：优先首页 selectedStoreId，否则 context currentStore.id */
 currentStoreId?: string | null
 /** 定位中（遮罩内骨架/禁用跟随定位） */
 locating?: boolean
 /** 定位异常提示 */
 locationError?: string | null
 /** 选中某门店：调用方负责 setSelectedStoreId + setStore（context 持久化）并关闭弹层 */
 onSelect: (s: NearestStore) => void
 /** 跟随定位（回到最近门店）：清空手动选择并重新按 GPS 解析 */
 onFollowLocation: () => void
 /** 查看全部精选好店（清空单店锁定，回到平台聚合流） */
 onViewAll: () => void
 /** 无附近门店时的兜底：跳转切城市页 */
 onFallbackCity?: () => void
}

/**
 * 门店选择底部弹层：把原生 showActionSheet 升级为信息完整的卡片列表。
 * 展示：店名 / 距离 / 地址 / 营业状态，高亮当前门店，提供「跟随定位」「查看全部」。
 * 全部数据来自 LocationContext.nearbyStores，不新增任何后端请求。
 */
export default function StorePickerSheet({
 open,
 onClose,
 stores,
 currentStoreId,
 locating,
 locationError,
 onSelect,
 onFollowLocation,
 onViewAll,
 onFallbackCity,
}: StorePickerSheetProps) {
 if (!open) return null

 const hasStores = stores && stores.length > 0

 return (
 <View className="fixed inset-0 z-[1001] sheet-overlay" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onClose} catchMove>
 {/* 底部面板：点击内容不冒泡关闭 */}
 <View
 className="sheet-panel fixed left-0 right-0 bottom-0 bg-card rounded-t-3xl border-t border-border"
 style={{ maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}
 onClick={(e) => { e.stopPropagation?.() }}
 >
 {/* 拖拽指示条 */}
 <View className="flex justify-center pt-2.5 pb-1">
 <View style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
 </View>

 {/* 标题栏 */}
 <View className="flex items-center justify-between px-5 pb-3 pt-1">
 <Text className="text-xl font-bold text-foreground">选择门店</Text>
 <View
 className="w-8 h-8 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"
 hoverClass="none"
 onClick={onClose}
 >
 <Text className="text-base text-muted-foreground">✕</Text>
 </View>
 </View>

 {!hasStores ? (
 // 无附近门店：引导切城市
 <View className="flex-1 flex flex-col items-center justify-center px-8 pb-10">
 <Text style={{ fontSize: '80rpx' }}></Text>
 <Text className="text-lg font-bold text-foreground mt-3 text-center">附近暂无门店</Text>
 <Text className="text-sm text-muted-foreground mt-1 text-center leading-relaxed">
 试试切换城市，发现更多好店
 </Text>
 {onFallbackCity && (
 <View
 className="mt-5 px-6 py-3 rounded-full bg-primary active:scale-95 transition-transform"
 hoverClass="none"
 onClick={() => { onClose(); onFallbackCity() }}
 >
 <Text className="text-base font-bold text-white">切换城市</Text>
 </View>
 )}
 </View>
 ) : (
 <>
 {/* 门店列表 */}
 <ScrollView scrollY className="flex-1 px-4" style={{ paddingBottom: 8 }}>
 {stores.map((s) => {
 const active = s.id === currentStoreId
 const open = s.is_open
 return (
 <View
 key={s.id}
 className={`mb-2 rounded-2xl border p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform ${active ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
 hoverClass="none"
 onClick={() => onSelect(s)}
 >
 {/* 左侧图标 */}
 <View
 className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
 style={{ background: active ? 'hsl(var(--primary) / 0.12)' : 'rgba(0,0,0,0.04)' }}
 >
 <Text style={{ fontSize: '44rpx' }}>{active ? '✓' : ''}</Text>
 </View>
 {/* 中部信息 */}
 <View className="flex-1 min-w-0">
 <View className="flex items-center gap-2">
 <Text className="text-base font-bold text-foreground truncate" style={{ maxWidth: 160 }}>{s.store_name}</Text>
 <Text
 className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${open ? 'text-emerald-600 bg-emerald-50' : 'text-muted-foreground bg-muted'}`}
 >
 {open ? '营业中' : '休息中'}
 </Text>
 </View>
 <Text className="text-xs text-muted-foreground mt-0.5 truncate" numberOfLines={1}>{s.address || '暂无地址'}</Text>
 </View>
 {/* 右侧距离：无坐标的门店显示「距离未知」，绝不能拼出「约nullkm」；
 跨城门店（>50km）降为灰色小字，避免「约1048.05km」被当成亮点指标 */}
 <View className="flex-shrink-0 text-right">
 {typeof s.distance_km === 'number'
 ? (s.distance_km > FAR_STORE_KM
 ? <Text className="text-[11px] text-muted-foreground">约{s.distance_km}km</Text>
 : <Text className="text-sm font-bold text-primary">约{s.distance_km}km</Text>)
 : <Text className="text-[11px] text-muted-foreground">距离未知</Text>}
 </View>
 </View>
 )
 })}
 </ScrollView>

 {/* 底部操作条 */}
 <View className="px-4 pt-2 pb-4 border-t border-border flex gap-2.5" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
 <View
 className="flex-1 py-3 rounded-xl border border-primary flex items-center justify-center gap-1 active:scale-95 transition-transform"
 hoverClass="none"
 onClick={onFollowLocation}
 >
 <Text className="text-sm font-bold text-primary"> 最近门店</Text>
 </View>
 <View
 className="flex-1 py-3 rounded-xl bg-primary flex items-center justify-center active:scale-95 transition-transform"
 hoverClass="none"
 onClick={onViewAll}
 >
 <Text className="text-sm font-bold text-white">查看全部好店</Text>
 </View>
 </View>
 </>
 )}
 </View>
 </View>
 )
}
