// 体质倾向深度分析（九种体质得分排序 + 证据链 + 主/次兼夹说明）
// ----------------------------------------------------------------------------
// 复用 tongue-engine-v2 的 deepConstitutionAnalysis：把 v2 引擎的 scores + evidence
// 展开成可回放的「九种体质得分排序」，每种体质回溯其舌象证据来源。
// 结果页（食养分析报告）与画像页（我的食养画像）共用，避免两套 UI 漂移。
// 合规：不出现「诊断」字样；以「望舌辨证 · 食养参考」口径呈现。
import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import { deepConstitutionAnalysis, type DeepAnalysisInput } from '@/utils/food-therapy/tongue-engine-v2'

const S = {
  background_rgba_217_169_120_0_18: { background: 'rgba(217,169,120,0.18)' },
  color_b45309: { color: '#B45309' },
} as const

interface Props {
  /** 舌象单通道分析 或 身体+舌象综合辨证，皆可 */
  analysis: DeepAnalysisInput
}

export default function ConstitutionDeepAnalysis({ analysis }: Props) {
  const deep = useMemo(() => deepConstitutionAnalysis(analysis), [analysis])

  return (
    <View>
      <Text className="text-xs text-[#3F3A34] block" style={{ lineHeight: 1.7 }}>
        {deep.note}
      </Text>
      <View className="mt-3 flex flex-col" style={{ gap: 10 }}>
        {deep.ranked.map((r, i) => {
          const active = r.score > 0
          return (
            <View key={r.key}>
              <View className="flex items-center" style={{ gap: 8 }}>
                <Text className="text-[10px] text-[#9A9388]" style={{ width: 16, flexShrink: 0 }}>
                  {i + 1}
                </Text>
                <Text style={{ fontSize: 15 }}>{r.emoji}</Text>
                <Text
                  className="text-xs font-semibold"
                  style={{ color: r.isPrimary ? r.color : '#3F3A34', minWidth: 60, flexShrink: 0 }}
                >
                  {r.name}
                </Text>
                {r.isPrimary ? (
                  <View className="rounded-full px-1.5 py-0.5" style={S.background_rgba_217_169_120_0_18}>
                    <Text className="text-[9px]" style={S.color_b45309}>
                      主
                    </Text>
                  </View>
                ) : null}
                {r.isSecondary ? (
                  <View className="rounded-full px-1.5 py-0.5" style={S.background_rgba_217_169_120_0_18}>
                    <Text className="text-[9px]" style={S.color_b45309}>
                      兼
                    </Text>
                  </View>
                ) : null}
                <View className="flex-1 rounded-full" style={{ height: 8, background: '#ECE6DD', overflow: 'hidden' }}>
                  <View
                    className="rounded-full"
                    style={{
                      height: 8,
                      width: `${Math.max(active ? 6 : 0, Math.round(r.ratio * 100))}%`,
                      background: active
                        ? r.isPrimary || r.isSecondary
                          ? '#15803D'
                          : 'rgba(21,128,61,0.45)'
                        : '#ECE6DD',
                    }}
                  />
                </View>
                <Text className="text-[10px] text-[#6F675C]" style={{ width: 22, textAlign: 'right', flexShrink: 0 }}>
                  {r.score}
                </Text>
              </View>
              {r.contributions.length > 0 ? (
                <View className="mt-1.5 flex flex-wrap" style={{ gap: 4, marginLeft: 39 }}>
                  {r.contributions.slice(0, 3).map((c, ci) => (
                    <View key={ci} className="rounded px-1.5 py-0.5" style={{ background: '#F7F3E9' }}>
                      <Text className="text-[9px] text-[#6F675C]">
                        {c.dimLabel}·{c.label} +{c.points}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
      <Text className="text-[10px] text-[#9A9388] mt-2 block" style={{ lineHeight: 1.6 }}>
        共 {deep.biasCount} 种偏颇质呈现倾向；以上为九种体质的食养参考得分排序，供你了解自身倾向。
      </Text>
    </View>
  )
}
