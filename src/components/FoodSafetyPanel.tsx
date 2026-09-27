/**
 * 食品配料安全展示面板（C 端复用组件）
 * - 配料安全：商品挂载的添加剂安全库条目（白/黄/黑风险 + 国标 + 风险说明）
 * - 食材食养：食养成分分析卡片（性味/功效/人群/场景 + 免责声明）
 * 无数据时不渲染，保持页面干净。
 */
import { View, Text } from '@tarojs/components'
import type { FoodAdditive } from '@/db/types'
import { type IngredientEntry, analyzeConstitutionFit } from '@/utils/shiyang-dictionary'
import { SHIYANG_DISCLAIMER } from '@/utils/ingredient-analysis'
import { normalizeAdditiveRisk } from '@/utils/additive-dictionary'
import { shieldCopy } from '@/utils/compliance/shield'

const RISK_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
 white: { label: '安全', color: '#15803D', bg: 'rgba(34,197,94,0.10)', icon: '✓' },
 yellow: { label: '限量', color: '#B45309', bg: 'rgba(245,158,11,0.10)', icon: '' },
 black: { label: '慎用', color: '#DC2626', bg: 'rgba(239,68,68,0.10)', icon: '✕' },
}

// 配料安全段免责声明：基于国标整理、仅供选购参考，不替代专业判断
const ADDITIVE_DISCLAIMER =
 '以上配料安全信息依据国家食品添加剂使用标准（GB）整理，仅供选购参考，实际请以产品包装标识为准。'

export default function FoodSafetyPanel({
 foodAdditives,
 shiyangEntries,
 showShiyang = true,
}: {
 foodAdditives: FoodAdditive[]
 shiyangEntries: IngredientEntry[]
 /** 详情页已用合规中性化的「核心食材表」单独承载食材清单，故此处仅保留添加剂安全分级；扫码页仍传 true 展示完整食养成分 */
 showShiyang?: boolean
}) {
 const hasAdditives = foodAdditives?.length > 0
 const hasShiyang = showShiyang && shiyangEntries?.length > 0
 if (!hasAdditives && !hasShiyang) return null
 return (
 <View className="mx-4 mt-4 rounded-2xl border border-black/5 p-4" style={{ background: '#fff' }}>
 {foodAdditives?.length > 0 && (
 <View>
 <Text className="text-base font-bold text-foreground" style={{ display: 'block', marginBottom: 8 }}>
 配料安全
 </Text>
{foodAdditives.map((a) => {
// DB 风险码已迁移为 L1-L4（迁移 00224），必须经 normalizeAdditiveRisk 归一到 white/yellow/black，
// 否则 L4（反式脂肪/亚硝酸盐/明矾）会落到 RISK_META['L4']=undefined → 回退 white → 误显「安全/绿」。
const m = RISK_META[normalizeAdditiveRisk(a.risk_level)] || RISK_META.white
 return (
 <View
 key={a.id}
 style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}
 >
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
 <Text className="text-sm font-semibold text-foreground">{a.name}</Text>
 <Text
 style={{
 fontSize: '22rpx',
 color: m.color,
 backgroundColor: m.bg,
 padding: '2px 8px',
 borderRadius: 999,
 overflow: 'hidden',
 }}
 >
 {m.icon} {m.label}
 </Text>
 </View>
 <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 3 }}>
 {a.category ? `${a.category} · ` : ''}
 {a.gb_std ? `国标 ${a.gb_std}` : '暂无国标依据'}
 </Text>
 {a.risk_desc && (
 <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 4, lineHeight: 1.6 }}>
 {a.risk_desc}
 </Text>
 )}
 {a.age_limit ? (
 <Text className="text-xs" style={{ display: 'block', marginTop: 3, color: m.color }}>
 适用年龄：{a.age_limit} 个月及以上
 </Text>
 ) : null}
 </View>
 )
 })}
 <Text
 className="text-[11px] text-muted-foreground"
 style={{ display: 'block', marginTop: 4, lineHeight: 1.6, opacity: 0.8 }}
 >
 {ADDITIVE_DISCLAIMER}
 </Text>
 </View>
 )}

 {showShiyang && shiyangEntries?.length > 0 && (
 <View style={{ marginTop: foodAdditives?.length ? 12 : 0 }}>
 <Text className="text-base font-bold text-foreground" style={{ display: 'block', marginBottom: 8 }}>
 食材食养
 </Text>
{shiyangEntries.map((e) => (
 <View key={e.zh} style={{ marginBottom: 10 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center' }}>
 <Text style={{ fontSize: '32rpx' }}>{e.icon}</Text>
 <Text className="text-sm font-semibold text-foreground" style={{ marginLeft: 6 }}>
 {e.zh}
 </Text>
 <Text
 style={{
 fontSize: '22rpx',
 color: e.color || '#999',
 borderWidth: 1,
 borderColor: e.color || '#999',
 borderRadius: 999,
 padding: '1px 8px',
 marginLeft: 6,
 overflow: 'hidden',
 }}
 >
 性{e.nature}
 </Text>
 </View>
 <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 3, lineHeight: 1.6 }}>
 功效：{shieldCopy((e.benefits || []).join('、')).safe}
 </Text>
 <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 2, lineHeight: 1.6 }}>
 场景：{shieldCopy((e.scenarios || []).join('、')).safe}
 </Text>
 </View>
))}
{shiyangEntries.length > 1 && (() => {
 const fit = analyzeConstitutionFit(shiyangEntries)
 if (!fit) return null
 return (
 <View
 style={{
 marginTop: 4,
 padding: 10,
 borderRadius: 10,
 background: 'rgba(94,122,79,0.06)',
 borderWidth: 1,
 borderColor: 'rgba(94,122,79,0.18)',
 }}
 >
 <Text style={{ fontSize: '24rpx', fontWeight: 600, color: 'hsl(var(--primary-deep))', display: 'block' }}>
 综合食养建议
 </Text>
 <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 4, lineHeight: 1.7 }}>
 共识别 {fit.total} 种食养食材，性以「{fit.dominant}」为主（{fit.dominantCount}/{fit.total}），更适合 {fit.suitable.join('、')}。
 </Text>
 {fit.avoid.length > 0 && (
 <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 3, lineHeight: 1.7 }}>
 其中 {fit.avoid.join('、')} 人群建议适量、少食。
 </Text>
 )}
 </View>
 )
})()}
 <Text
 className="text-[11px] text-muted-foreground"
 style={{ display: 'block', marginTop: 4, lineHeight: 1.6, opacity: 0.8 }}
 >
 {SHIYANG_DISCLAIMER}
 </Text>
 </View>
 )}
 </View>
 )
}
