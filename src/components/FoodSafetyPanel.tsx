/**
 * 食品配料安全展示面板（C 端复用组件）
 * - 配料安全：商品挂载的添加剂安全库条目（白/黄/黑风险 + 国标 + 风险说明）
 * - 食材食养：食养成分分析卡片（性味/功效/人群/场景 + 免责声明）
 * 无数据时不渲染，保持页面干净。
 */
import { View, Text } from '@tarojs/components'
import type { FoodAdditive } from '@/db/types'
import type { IngredientEntry } from '@/utils/shiyang-dictionary'
import { SHIYANG_DISCLAIMER } from '@/utils/ingredient-analysis'

const RISK_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  white: { label: '安全', color: '#16A34A', bg: 'rgba(34,197,94,0.10)', icon: '✓' },
  yellow: { label: '限量', color: '#D97706', bg: 'rgba(245,158,11,0.10)', icon: '⚠' },
  black: { label: '慎用', color: '#DC2626', bg: 'rgba(239,68,68,0.10)', icon: '✕' },
}

export default function FoodSafetyPanel({
  foodAdditives,
  shiyangEntries,
}: {
  foodAdditives: FoodAdditive[]
  shiyangEntries: IngredientEntry[]
}) {
  if (!foodAdditives?.length && !shiyangEntries?.length) return null
  return (
    <View className="mx-4 mt-4 rounded-2xl border border-black/5 p-4" style={{ background: '#fff' }}>
      {foodAdditives?.length > 0 && (
        <View>
          <Text className="text-base font-bold text-foreground" style={{ display: 'block', marginBottom: 8 }}>
            🍱 配料安全
          </Text>
          {foodAdditives.map((a) => {
            const m = RISK_META[a.risk_level] || RISK_META.white
            return (
              <View
                key={a.id}
                style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text className="text-sm font-semibold text-foreground">{a.name}</Text>
                  <Text
                    style={{
                      fontSize: 11,
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
        </View>
      )}

      {shiyangEntries?.length > 0 && (
        <View style={{ marginTop: foodAdditives?.length ? 12 : 0 }}>
          <Text className="text-base font-bold text-foreground" style={{ display: 'block', marginBottom: 8 }}>
            🌿 食材食养
          </Text>
          {shiyangEntries.map((e) => (
            <View key={e.zh} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 16 }}>{e.icon}</Text>
                <Text className="text-sm font-semibold text-foreground" style={{ marginLeft: 6 }}>
                  {e.zh}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
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
                功效：{(e.benefits || []).join('、')}
              </Text>
              <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 2, lineHeight: 1.6 }}>
                适合：{(e.audiences || []).join('、')}
              </Text>
              <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 2, lineHeight: 1.6 }}>
                场景：{(e.scenarios || []).join('、')}
              </Text>
            </View>
          ))}
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
