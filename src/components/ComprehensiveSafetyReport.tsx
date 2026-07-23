/**
 * 全面食品安全分析面板（C 端复用）
 * ------------------------------------------------------------------
 * 在 FoodSafetyPanel（添加剂安全 + 食养成分）之外，补齐「全面安全分析」维度：
 *   🛡 总评级（S/A/C/D + 0~100 分）
 *   🚨 致敏原（GB 7718 八大类 + 芝麻，儿童重点）
 *   🥗 营养成分（高糖/高钠/高脂/反式脂肪评估）
 *   👶 适宜人群 / 警示（婴幼儿、过敏人群）
 *   🏷 标签合规（完整标签语境下展示缺失项）
 * 无内容时不渲染。
 */
import { View, Text } from '@tarojs/components'
import type { ComprehensiveSafetyReport } from '@/utils/safety-analysis'
import { FOOD_THERAPY_DISCLAIMER, shieldCopy } from '@/utils/compliance/shield'

const FLAG_COLOR: Record<string, string> = {
  high: '#D97706',
  extreme: '#DC2626',
  trans: '#DC2626',
}

export default function ComprehensiveSafetyReport({
  report,
  fullLabel = false,
}: {
  report: ComprehensiveSafetyReport
  fullLabel?: boolean
}) {
  if (!report?.hasContent) return null

  const { overall, allergens, nutrition, label, ageSuitability, warnings } = report

  return (
    <View className="mx-4 mt-4 rounded-2xl border border-black/5 p-4" style={{ background: '#fff' }}>
      {/* 总评级 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text className="text-base font-bold text-foreground" style={{ display: 'block' }}>
          🛡 全面安全分析
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: overall.color,
              backgroundColor: overall.color + '14',
              padding: '2px 10px',
              borderRadius: 999,
              marginRight: 6,
              overflow: 'hidden',
            }}
          >
            {overall.grade} · {overall.label}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: overall.color }}>{overall.score}</Text>
        </View>
      </View>

      {/* 致敏原 */}
      <View style={{ marginTop: 12 }}>
        <Text className="text-sm font-semibold text-foreground" style={{ display: 'block', marginBottom: 6 }}>
          🚨 致敏原
        </Text>
        {allergens.contains ? (
          allergens.detected.map((a) => {
            const c = a.severity === 'high' ? '#DC2626' : '#D97706'
            return (
              <View
                key={a.key}
                style={{
                  marginBottom: 8,
                  padding: 8,
                  borderRadius: 12,
                  backgroundColor: c + '0F',
                  borderWidth: 1,
                  borderColor: c + '33',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: c }}>{a.name}</Text>
                  <Text style={{ fontSize: 10, color: c, backgroundColor: '#fff', padding: '1px 6px', borderRadius: 999, overflow: 'hidden' }}>
                    {a.category}
                  </Text>
                </View>
                <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 3, lineHeight: 1.6 }}>
                  {a.note}
                </Text>
              </View>
            )
          })
        ) : (
          <Text className="text-xs text-muted-foreground" style={{ display: 'block', lineHeight: 1.6, color: '#16A34A' }}>
            ✅ 未识别到常见致敏原（GB 7718 八大类 + 芝麻）
          </Text>
        )}
      </View>

      {/* 营养成分 */}
      {nutrition?.available && (
        <View style={{ marginTop: 12 }}>
          <Text className="text-sm font-semibold text-foreground" style={{ display: 'block', marginBottom: 6 }}>
            🥗 营养成分
            <Text style={{ fontSize: 12, fontWeight: 'normal', color: '#6B7280' }}>
              {nutrition.basis === 'perServing' && nutrition.servingNote ? `（${nutrition.servingNote}）` : '（每 100g）'}
            </Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {nutrition.items.map((it) => {
              const c = it.flag ? FLAG_COLOR[it.flag] : '#374151'
              const childPct = it.childDailyPct
              const childColor = childPct == null ? null : childPct >= 50 ? '#DC2626' : childPct >= 25 ? '#D97706' : '#16A34A'
              return (
                <View
                  key={it.key}
                  style={{
                    minWidth: '30%',
                    padding: 8,
                    borderRadius: 12,
                    backgroundColor: it.flag ? c + '0F' : '#F8F8F8',
                    borderWidth: it.flag ? 1 : 0,
                    borderColor: it.flag ? c + '33' : 'transparent',
                  }}
                >
                  <Text className="text-xs text-muted-foreground" style={{ display: 'block' }}>{it.label}</Text>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: c }}>
                    {it.value}
                    <Text style={{ fontSize: 10, fontWeight: 'normal' }}> {it.unit}</Text>
                  </Text>
                  {(it.nrvPct != null || it.childDailyPct != null) && (
                    <Text style={{ fontSize: 10, color: '#6B7280', display: 'block', marginTop: 2 }}>
                      {it.nrvPct != null ? `NRV ${it.nrvPct}%` : ''}
                      {it.nrvPct != null && it.childDailyPct != null ? ' · ' : ''}
                      {it.childDailyPct != null ? `儿童每日 ${it.childDailyPct}%` : ''}
                    </Text>
                  )}
                  {childPct != null && (
                    <View style={{ height: 4, borderRadius: 999, backgroundColor: '#EEE', marginTop: 4, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${Math.min(100, childPct)}%`, backgroundColor: childColor! }} />
                    </View>
                  )}
                </View>
              )
            })}
          </View>
          <Text style={{ display: 'block', marginTop: 6, fontSize: 10, color: '#9CA3AF', lineHeight: 1.5 }}>
            NRV% = 占每日营养素参考值（GB 28050）；儿童每日% = 该 100g 占儿童每日推荐上限（糖 25g / 钠 1200mg / 能量 6000kJ）
          </Text>
          {nutrition.flags.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {nutrition.flags.map((f, i) => (
                <Text key={i} className="text-xs" style={{ display: 'block', color: '#DC2626', lineHeight: 1.6 }}>
                  ⚠ {f}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 适宜人群 / 警示 */}
      {(ageSuitability.notes.length > 0 || warnings.length > 0) && (
        <View style={{ marginTop: 12 }}>
          <Text className="text-sm font-semibold text-foreground" style={{ display: 'block', marginBottom: 6 }}>
            👶 适宜人群 / 警示
          </Text>
          {ageSuitability.infantSafe ? (
            <Text className="text-xs" style={{ display: 'block', color: '#16A34A', lineHeight: 1.6 }}>
              ✓ 未发现婴幼儿禁用成分
            </Text>
          ) : (
            <Text className="text-xs" style={{ display: 'block', color: '#DC2626', lineHeight: 1.6 }}>
              ✕ 含婴幼儿不宜成分，3 岁以下不建议食用
            </Text>
          )}
          {[...ageSuitability.notes, ...warnings].map((w, i) => (
            <Text key={i} className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 3, lineHeight: 1.6 }}>
              · {shieldCopy(w).safe}
            </Text>
          ))}
        </View>
      )}

      {/* 标签合规（完整标签语境才严格展示缺失） */}
      {fullLabel ? (
        <View style={{ marginTop: 12 }}>
          <Text className="text-sm font-semibold text-foreground" style={{ display: 'block', marginBottom: 6 }}>
            🏷 标签合规完整度 {label.score}%
          </Text>
          <View style={{ height: 6, borderRadius: 999, backgroundColor: '#EEE', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${label.score}%`, backgroundColor: label.score >= 80 ? '#16A34A' : label.score >= 50 ? '#D97706' : '#DC2626' }} />
          </View>
          {label.missing.length > 0 && (
            <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 6, lineHeight: 1.6 }}>
              缺失：{label.missing.join('、')}
            </Text>
          )}
        </View>
      ) : label.score >= 30 ? (
        <View style={{ marginTop: 12 }}>
          <Text className="text-xs text-muted-foreground" style={{ display: 'block', lineHeight: 1.6 }}>
            🏷 已识别标签信息完整度 {label.score}%（粘贴完整标签可获更全的合规分析）
          </Text>
        </View>
      ) : null}

      {/* 免责声明（合规红线，全站分析卡强制展示，禁止硬编码） */}
      <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 14, lineHeight: 1.7 }}>
        {FOOD_THERAPY_DISCLAIMER}
      </Text>
    </View>
  )
}
