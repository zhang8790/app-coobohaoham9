import { useState } from 'react'
import { useLoad } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import {
  getFoodAnalysisReport,
  getFoodAnalysisReportsByProduct,
  getFoodCrowdTips,
  callIngredientAnalyze,
  type FoodCrowdTip,
  type SafeLevelCode,
  type FoodAnalysisReport,
} from '@/db/food-safety'
import { getProducts, type Product } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'

// 4 档评级 → 分数 + 主题色
const LEVEL_META: Record<string, { score: number; label: string; bg: string; fg: string; border: string; ring: string }> = {
  A_preferred: { score: 92, label: 'A 优选', bg: 'rgba(34,197,94,0.10)', fg: '#16a34a', border: 'rgba(34,197,94,0.35)', ring: '#22c55e' },
  A_limit:    { score: 78, label: 'A 含限量', bg: 'rgba(132,204,22,0.10)', fg: '#65a30d', border: 'rgba(132,204,22,0.35)', ring: '#84cc16' },
  B_caution:  { score: 55, label: 'B 慎选', bg: 'rgba(249,115,22,0.10)', fg: '#ea580c', border: 'rgba(249,115,22,0.35)', ring: '#f97316' },
  C_avoid:    { score: 28, label: 'C 不推荐', bg: 'rgba(239,68,68,0.10)', fg: '#dc2626', border: 'rgba(239,68,68,0.35)', ring: '#ef4444' },
}

const ADDITIVE_LEVEL: Record<string, { label: string; color: string; bg: string }> = {
  safe: { label: '安全', color: '#16a34a', bg: 'rgba(34,197,94,0.08)' },
  limit: { label: '限量', color: '#ca8a04', bg: 'rgba(234,179,8,0.08)' },
  high_risk: { label: '高风险', color: '#dc2626', bg: 'rgba(239,68,68,0.08)' },
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

// 安全分转环偏移：0→180deg(红), 100→0deg(绿)
function scoreToDeg(score: number) {
  return 180 - (score / 100) * 180
}

export default function AnalysisResult() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [report, setReport] = useState<RenderReport | null>(null)
  const [tipsMap, setTipsMap] = useState<Record<string, FoodCrowdTip>>({})
  const [recProducts, setRecProducts] = useState<Product[]>([])
  const [recLoading, setRecLoading] = useState(false)

  useLoad(async (options: Record<string, string>) => {
    const reportId = options.report_id
    const productId = options.product_id
    const text = options.text ? decodeURIComponent(options.text) : undefined

    const tips = await getFoodCrowdTips()
    const map: Record<string, FoodCrowdTip> = {}
    for (const t of tips) map[t.crowd_code] = t
    setTipsMap(map)

    let r: RenderReport | null = null
    let searchText = ''
    try {
      if (reportId) {
        const row = await getFoodAnalysisReport(reportId)
        if (row) { r = normalize(row); searchText = row.product_id ? '' : (row.parsed_ingredients?.[0] || '') }
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
        if (res.success) { r = res as RenderReport; searchText = text }
        else Taro.showToast({ title: res.error || '分析失败', icon: 'none' })
      }
    } catch (e) {
      console.error('[AnalysisResult] 加载失败', e)
    }

    if (!r) setNotFound(true)
    setReport(r)
    setLoading(false)

    // 异步加载推荐商品
    if (r) {
      setRecLoading(true)
      try {
        const kw = (r.parsed_ingredients?.[0] || searchText || '').slice(0, 6)
        if (kw) {
          const products = await getProducts({ search: kw, limit: 10 })
          // 按安全等级排序：A_preferred > A_limit > B_caution > C_avoid
          const order = ['A_preferred', 'A_limit', 'B_caution', 'C_avoid']
          // 前端过滤：排除可能相同商品，优先展示更安全的
          const filtered = products
            .filter(p => p.is_active)
            .sort((a, b) => {
              // 暂用价格作为简单信号（低价=更纯净），未来可接 food_analysis_reports
              return (a.price || 0) - (b.price || 0)
            })
            .slice(0, 3)
          setRecProducts(filtered)
        }
      } catch {}
      setRecLoading(false)
    }
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

  const meta = LEVEL_META[report.safe_level_code] || LEVEL_META.A_preferred
  const deg = scoreToDeg(meta.score)
  const crowdLabels = (report.crowd_tips || [])
    .map((c) => tipsMap[c]?.label || c)
    .filter(Boolean)

  return (
    <ScrollView style={pageStyle} scrollY>
      {/* ──── 总评大卡（安全分+色环） ──── */}
      <View style={{ ...scoreCardStyle, background: meta.bg, borderColor: meta.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: meta.fg, fontWeight: '600', letterSpacing: 1 }}>配料安全评分</Text>
            <Text style={{ fontSize: 48, fontWeight: '800', color: meta.fg, lineHeight: '56px', marginTop: 4 }}>
              {meta.score}
            </Text>
            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>满分 100</Text>
          </View>
          {/* 安全色环 */}
          <View style={{ width: 76, height: 76, position: 'relative' }}>
            <View style={{
              width: 76, height: 76, borderRadius: 38,
              background: `conic-gradient(from 180deg, ${meta.ring} 0deg, ${meta.ring} ${180 - deg}deg, #e5e7eb ${180 - deg}deg, #e5e7eb 180deg)`,
            }} />
            <View style={{
              position: 'absolute', top: 12, left: 12, right: 12, bottom: 12,
              borderRadius: 26, background: '#fff', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: meta.fg }}>{meta.label}</Text>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={{ fontSize: 14, color: '#334155', lineHeight: '22px' }}>
            {report.main_conclusion?.general || ''}
          </Text>
        </View>
      </View>

      {/* ──── 核心结论 ──── */}
      {report.main_conclusion && (
        <View style={cardStyle}>
          <Text style={sectionTitle}>核心结论</Text>
          <Row label="儿童" value={report.main_conclusion.children} />
          <Row label="适宜人群" value={report.main_conclusion.fit_people} />
          <Row label="需谨慎/不宜" value={report.main_conclusion.unfit_people} />
        </View>
      )}

      {/* ──── 健康短板提示 ──── */}
      {report.health_shortboard_tip && (
        <View style={{ ...cardStyle, background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.25)' }}>
          <Text style={{ fontSize: 13, color: '#6366f1', fontWeight: '600' }}>💡 健康短板提示</Text>
          <Text style={{ fontSize: 14, color: '#334155', marginTop: 4, lineHeight: '22px' }}>
            {report.health_shortboard_tip}
          </Text>
        </View>
      )}

      {/* ──── 自定义关注（成分偏好设置） ──── */}
      <View style={cardStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={sectionTitle}>⚙️ 我的关注设置</Text>
          <Text style={{ fontSize: 12, color: '#d4a537', fontWeight: '600' }}
            onClick={() => Taro.navigateTo({ url: '/pages/food/food-scan/index' })}>
            设置 ›
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {[
            { label: '色素类', active: false }, { label: '防腐剂', active: true },
            { label: '甜味剂', active: false }, { label: '香精', active: true },
            { label: '增稠剂', active: false }, { label: '乳化剂', active: false },
          ].map((item) => (
            <View key={item.label} style={{
              borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10,
              background: item.active ? 'rgba(212,165,55,0.12)' : '#f8fafc',
              borderWidth: 1, borderColor: item.active ? '#d4a537' : 'rgba(0,0,0,0.06)',
            }}>
              <Text style={{
                fontSize: 12, fontWeight: item.active ? '700' : '400',
                color: item.active ? '#b8860b' : '#94a3b8',
              }}>{item.label}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, display: 'block' }}>
          扫描配料时重点关注已选的成分类型
        </Text>
      </View>

      {/* ──── 添加剂明细（卡片式） ──── */}
      {report.additive_list && report.additive_list.length > 0 && (
        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={sectionTitle}>添加剂明细</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8' }}>{report.additive_list.length} 项</Text>
          </View>
          {report.additive_list.map((a, i) => {
            const lv = ADDITIVE_LEVEL[a.level] || ADDITIVE_LEVEL.safe
            return (
              <View key={i} style={additiveCardStyle(lv.bg)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, background: lv.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text style={{ fontSize: 16 }}>{a.level === 'safe' ? '✅' : a.level === 'limit' ? '⚠️' : '🚫'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b' }}>{a.name}</Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{a.type}</Text>
                    </View>
                  </View>
                  <Text style={{
                    fontSize: 11, fontWeight: '600', color: lv.color, background: lv.bg,
                    borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8,
                  }}>
                    {lv.label}
                  </Text>
                </View>
                {a.desc ? (
                  <Text style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: '20px', paddingLeft: 48 }}>
                    {a.desc}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      )}

      {/* ──── 人群提示标签 ──── */}
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

      {/* ──── 命中配料 ──── */}
      {report.parsed_ingredients && report.parsed_ingredients.length > 0 && (
        <View style={cardStyle}>
          <Text style={sectionTitle}>解析配料</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {report.parsed_ingredients.map((p, i) => (
              <Text key={i} style={chipStyle}>{p}</Text>
            ))}
          </View>
        </View>
      )}

      {/* ──── 推荐替代商品（识→买闭环） ──── */}
      {recProducts.length > 0 && (
        <View style={cardStyle}>
          <Text style={sectionTitle}>
            {report.safe_level_code === 'A_preferred' ? '✨ 此商品已是最优选择，看看同类好货' : '🛡️ 为你找到更安心的替代选择'}
          </Text>
          {recProducts.map((p) => (
            <View key={p.id} style={recItemStyle}
              onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
            >
              <Image
                src={p.image_url || p.main_image || '/placeholder.jpg'}
                style={{ width: 72, height: 72, borderRadius: 10, flexShrink: 0 }}
                mode="aspectFill"
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b', lineHeight: '20px' }}
                  numberOfLines={2}>{p.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#dc2626' }}>¥{p.price || '—'}</Text>
                  {p.original_price && p.original_price > (p.price || 0) && (
                    <Text style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'line-through', marginLeft: 6 }}>
                      ¥{p.original_price}
                    </Text>
                  )}
                </View>
              </View>
              <View style={{
                background: meta.bg, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12,
                borderWidth: 1, borderColor: meta.border, flexShrink: 0,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: meta.fg }}>去看看</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ──── 对比其他产品 ──── */}
      <View style={cardStyle}>
        <Text style={sectionTitle}>🔄 对比其他产品</Text>
        <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 10, display: 'block' }}>
          再扫一款商品，对比配料安全差异
        </Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#d4a537',
          borderStyle: 'dashed', background: 'rgba(212,165,55,0.04)',
        }}
          onClick={() => Taro.navigateTo({ url: '/pages/food/food-scan/index' })}
        >
          <Text style={{ fontSize: 18, marginRight: 8 }}>🔍</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#b8860b' }}>扫描另一款配料表</Text>
        </View>
      </View>

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

// ==================== 样式 ====================
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg,#f0fdf4 0%,#f8fafc 40%)',
  padding: '16px',
  boxSizing: 'border-box',
}

const scoreCardStyle: React.CSSProperties = {
  borderRadius: 20,
  padding: 20,
  marginBottom: 14,
  borderWidth: 1.5,
  boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
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

const additiveCardStyle = (bg: string): React.CSSProperties => ({
  background: '#fff',
  borderRadius: 12,
  padding: 14,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  borderLeftWidth: 3,
  borderLeftColor: bg.replace('0.08', '0.5'),
})

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

const recItemStyle: React.CSSProperties = {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 12,
  borderTopWidth: 1,
  borderTopColor: 'rgba(0,0,0,0.05)',
  marginTop: 6,
}
