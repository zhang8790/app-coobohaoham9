import { useState } from 'react'
import { useLoad } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import {
  getFoodAnalysisReport,
  getFoodAnalysisReportsByProduct,
  getFoodCrowdTips,
  callIngredientAnalyze,
  type FoodCrowdTip,
  type SafeLevelCode,
  type FoodAnalysisReport,
} from '@/db/food-safety'
import { useAuth } from '@/contexts/AuthContext'

// 4 档评级 → 主题色（绿/黄绿/橙/红）
const LEVEL_THEME: Record<string, { bg: string; fg: string; border: string }> = {
  A_preferred: { bg: 'rgba(34,197,94,0.12)', fg: '#16a34a', border: 'rgba(34,197,94,0.4)' },
  A_limit: { bg: 'rgba(132,204,22,0.12)', fg: '#65a30d', border: 'rgba(132,204,22,0.4)' },
  B_caution: { bg: 'rgba(249,115,22,0.12)', fg: '#ea580c', border: 'rgba(249,115,22,0.4)' },
  C_avoid: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626', border: 'rgba(239,68,68,0.4)' },
}

const ADDITIVE_LEVEL: Record<string, { label: string; color: string }> = {
  safe: { label: '安全', color: '#16a34a' },
  limit: { label: '限量', color: '#ca8a04' },
  high_risk: { label: '高风险', color: '#dc2626' },
}

interface RenderReport {
  safe_level: string
  safe_level_code: SafeLevelCode | string
  main_conclusion?: { general: string; children: string; fit_people: string; unfit_people: string } | null
  health_shortboard_tip?: string
  additive_list?: Array<{ name: string; level: string; type: string; desc: string }>
  crowd_tips?: string[]
  parsed_ingredients?: string[]
  matched_additives?: string[]
}

// DB 行（字段多 nullable）→ 渲染接口（字段非 null/可选）的轻量映射
function normalize(row: FoodAnalysisReport): RenderReport {
  return {
    safe_level: row.safe_level ?? '',
    safe_level_code: row.safe_level_code ?? '',
    main_conclusion: row.main_conclusion ?? null,
    health_shortboard_tip: row.health_shortboard_tip ?? undefined,
    additive_list: row.additive_list ?? undefined,
    crowd_tips: row.crowd_tips ?? undefined,
    parsed_ingredients: row.parsed_ingredients ?? undefined,
    matched_additives: undefined,
  }
}

export default function AnalysisResult() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [report, setReport] = useState<RenderReport | null>(null)
  const [tipsMap, setTipsMap] = useState<Record<string, FoodCrowdTip>>({})

  useLoad(async (options: Record<string, string>) => {
    const reportId = options.report_id
    const productId = options.product_id
    const text = options.text ? decodeURIComponent(options.text) : undefined

    // 人群文案 map（crowd_code → label）
    const tips = await getFoodCrowdTips()
    const map: Record<string, FoodCrowdTip> = {}
    for (const t of tips) map[t.crowd_code] = t
    setTipsMap(map)

    let r: RenderReport | null = null
    try {
      if (reportId) {
        const row = await getFoodAnalysisReport(reportId)
        if (row) r = normalize(row)
      } else if (productId) {
        const rows = await getFoodAnalysisReportsByProduct(productId)
        if (rows.length) r = normalize(rows[0])
      } else if (text) {
        const res = await callIngredientAnalyze({
          text,
          product_id: productId,
          user_id: user?.id,
          source: 'manual',
        })
        if (res.success) r = res as RenderReport
        else Taro.showToast({ title: res.error || '分析失败', icon: 'none' })
      }
    } catch (e) {
      console.error('[AnalysisResult] 加载失败', e)
    }

    if (!r) setNotFound(true)
    setReport(r)
    setLoading(false)
  })

  if (loading) {
    return (
      <View style={pageStyle}>
        <View style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <Text>报告生成中…</Text>
        </View>
      </View>
    )
  }

  if (notFound || !report) {
    return (
      <View style={pageStyle}>
        <View style={cardStyle}>
          <Text style={{ color: '#64748b' }}>未找到安全分析报告。请先在「配料识别」中分析配料或绑定商品。</Text>
        </View>
      </View>
    )
  }

  const theme = LEVEL_THEME[report.safe_level_code] || LEVEL_THEME.A_preferred
  const crowdLabels = (report.crowd_tips || [])
    .map((c) => tipsMap[c]?.label || c)
    .filter(Boolean)

  return (
    <ScrollView style={pageStyle} scrollY>
      {/* 评级大卡 */}
      <View style={{ ...cardStyle, background: theme.bg, borderColor: theme.border }}>
        <Text style={{ fontSize: 13, color: theme.fg }}>安全评级</Text>
        <Text style={{ fontSize: 26, fontWeight: '700', color: theme.fg, marginTop: 4 }}>
          {report.safe_level}
        </Text>
        <Text style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
          {report.main_conclusion?.general || ''}
        </Text>
      </View>

      {/* 核心结论 */}
      {report.main_conclusion && (
        <View style={cardStyle}>
          <Text style={sectionTitle}>核心结论</Text>
          <Row label="儿童" value={report.main_conclusion.children} />
          <Row label="适宜人群" value={report.main_conclusion.fit_people} />
          <Row label="需谨慎/不宜" value={report.main_conclusion.unfit_people} />
        </View>
      )}

      {/* 健康短板提示（个性化） */}
      {report.health_shortboard_tip && (
        <View style={{ ...cardStyle, background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.3)' }}>
          <Text style={{ fontSize: 13, color: '#6366f1', fontWeight: '600' }}>健康短板提示</Text>
          <Text style={{ fontSize: 14, color: '#334155', marginTop: 4, lineHeight: '22px' }}>
            {report.health_shortboard_tip}
          </Text>
        </View>
      )}

      {/* 添加剂明细 */}
      {report.additive_list && report.additive_list.length > 0 && (
        <View style={cardStyle}>
          <Text style={sectionTitle}>添加剂明细（{report.additive_list.length}）</Text>
          {report.additive_list.map((a, i) => {
            const lv = ADDITIVE_LEVEL[a.level] || ADDITIVE_LEVEL.safe
            return (
              <View key={i} style={itemStyle}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, background: lv.color, marginRight: 8 }} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>{a.name}</Text>
                  <Text style={{ fontSize: 11, color: lv.color, marginLeft: 8, borderWidth: 1, borderColor: lv.color, borderRadius: 4, paddingVertical: 1, paddingHorizontal: 5 }}>
                    {lv.label}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{a.type}</Text>
                {a.desc ? <Text style={{ fontSize: 13, color: '#475569', marginTop: 3, lineHeight: '20px' }}>{a.desc}</Text> : null}
              </View>
            )
          })}
        </View>
      )}

      {/* 人群提示标签 */}
      {crowdLabels.length > 0 && (
        <View style={cardStyle}>
          <Text style={sectionTitle}>食养人群提示</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {crowdLabels.map((l, i) => (
              <Text key={i} style={tagStyle}>{l}</Text>
            ))}
          </View>
        </View>
      )}

      {/* 命中配料原文 */}
      {report.parsed_ingredients && report.parsed_ingredients.length > 0 && (
        <View style={cardStyle}>
          <Text style={sectionTitle}>解析配料（{report.parsed_ingredients.length}）</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {report.parsed_ingredients.map((p, i) => (
              <Text key={i} style={chipStyle}>{p}</Text>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 24 }} />
      <Text style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingBottom: 20 }}>
        以上为食养/膳食参考，不替代医嘱
      </Text>
    </ScrollView>
  )
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 8 }}>
      <Text style={{ fontSize: 13, color: '#94a3b8', width: 84 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: '#334155', flex: 1, lineHeight: '20px' }}>{value || '—'}</Text>
    </View>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg,#f0fdf4 0%,#f8fafc 40%)',
  padding: '16px',
  boxSizing: 'border-box',
}
const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 16,
  padding: 16,
  marginBottom: 14,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.06)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
}
const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: '700',
  color: '#0f172a',
  marginBottom: 6,
}
const itemStyle: React.CSSProperties = {
  paddingVertical: 10,
  borderTopWidth: 1,
  borderTopColor: 'rgba(0,0,0,0.06)',
}
const tagStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#0369a1',
  background: 'rgba(3,105,161,0.08)',
  borderRadius: 8,
  paddingVertical: 4,
  paddingHorizontal: 10,
  marginRight: 8,
  marginBottom: 8,
}
const chipStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#475569',
  background: '#f1f5f9',
  borderRadius: 8,
  paddingVertical: 4,
  paddingHorizontal: 10,
  marginRight: 8,
  marginBottom: 8,
}
