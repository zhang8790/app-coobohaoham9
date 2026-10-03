// 舌象「全面分析报告」卡片（v2 · 进阶算法）
// ----------------------------------------------------------------------------
// 四行结构化报告：健康状态 / 发生机制 / 关键依据 / 健康指数。
// 算法：utils/food-therapy/tongue-engine-v2.ts（证据融合 + 交互项 + 置信度）。
// 健康指数含置信区间与复测趋势小图（Canvas 2D，零依赖）。
// 合规：文案由 tongue-report/tongue-compliance 统一净化；界面不出现「AI」「诊断」。
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { analyzeTongue, confidenceLabel } from '@/utils/food-therapy/tongue-engine-v2'
import { computeHealthIndex, getMechanism, BAND_META } from '@/utils/food-therapy/tongue-report'
import { pushTongueHistory, saveTongueProfile, type TongueHistoryPoint } from '@/utils/food-therapy/tongue-history'
import TrendChart from '@/components/food/TrendChart'
import {
  getTongueCaseReferences,
  type TongueCaseReferenceSummary,
} from '@/db/tongue-cases'

interface Props {
  /** 8 维选项下标（顺序同 TONGUE_QUESTIONS） */
  answers: number[]
  /** 是否依据照片（拍照留档）做逐项对照得出，仅影响副标题措辞，不出现「AI」 */
  photoBased?: boolean
}

const LABEL_W = 76

/** 分级短标签（用于参考区徽章，避免「状态」二字过长） */
const BAND_SHORT: Record<'low' | 'mid' | 'high', string> = {
  low: '低风险',
  mid: '中风险',
  high: '高风险',
}

// 复测趋势折线已抽到 @/components/food/TrendChart（与「食养画像」页共用）

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex" style={{ padding: '12px 0' }}>
      <View style={{ width: LABEL_W, flexShrink: 0 }}>
        <Text className="text-xs font-bold text-[#6F675C]">{label}</Text>
      </View>
      <View className="flex-1 min-w-0">{children}</View>
    </View>
  )
}

const DIVIDER = { borderTopWidth: 1, borderTopColor: '#ECE6DD', borderStyle: 'solid' as const }

export default function TongueReport({ answers, photoBased }: Props) {
  const [history, setHistory] = useState<TongueHistoryPoint[]>([])
  const [refs, setRefs] = useState<TongueCaseReferenceSummary | null>(null)
  const [refState, setRefState] = useState<'loading' | 'done' | 'offline'>('loading')
  const pushed = useRef(false)

  // 纯本地分析：问卷/拍照对照的答案经 v2 规则引擎出体质倾向，不依赖任何云端视觉识别
  const analysis = useMemo(() => analyzeTongue(answers, { source: 'manual' }), [answers])
  const index = computeHealthIndex(analysis, analysis.confidence)
  const mechanism = getMechanism(analysis.primary?.key || 'pinghe')
  const primary = analysis.primary
  const secondary = analysis.secondary
  const topEvidence = analysis.evidence.slice(0, 4)

  // 进入结果页只记一次复测历史（同日可重复，对应「当天复测」）
  useEffect(() => {
    if (pushed.current) return
    pushed.current = true
    setHistory(pushTongueHistory(index.score))
    // 沉淀最近一次食养画像（本地，不回写库、不存个人信息）
    saveTongueProfile({
      updatedAt: Date.now(),
      primaryKey: analysis.primary.key,
      primaryName: analysis.primary.name,
      primaryColor: analysis.primary.color,
      primaryEmoji: analysis.primary.emoji,
      secondaryKey: analysis.secondary?.key,
      secondaryName: analysis.secondary?.name,
      healthIndex: index.score,
      band: index.band,
      bandLabel: index.bandLabel,
      confidence: analysis.confidence,
      answers,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 用案例库佐证：拿 8 维问卷/识别答案去比对库内案例，输出相似分布。
  // 失败/离线/超时均降级为「本地分析为准」，绝不阻断报告渲染。
  useEffect(() => {
    let alive = true
    setRefState('loading')
    getTongueCaseReferences(answers, { primaryKey: analysis.primary?.key, limit: 3 })
      .then((s) => {
        if (!alive) return
        setRefs(s)
        setRefState('done')
      })
      .catch(() => {
        if (alive) setRefState('offline')
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers])

  return (
    <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <View className="flex items-center justify-between">
        <Text className="text-sm font-bold text-[#2A2A2A]">食养分析报告</Text>
        <View className="rounded-full px-2 py-0.5" style={{ background: 'rgba(217,169,120,0.16)' }}>
          <Text className="text-[10px]" style={{ color: '#B45309' }}>
            置信度 · {confidenceLabel(analysis.confidence)}
          </Text>
        </View>
      </View>
      <Text className="text-xs text-[#6F675C] mt-1 block">
        {photoBased
          ? '依据你的舌部照片逐项对照整理的舌象特征'
          : '依据你逐项对照填写的舌象特征整理'}
      </Text>

      <View className="mt-2">
        {/* ① 健康状态 */}
        <View style={DIVIDER}>
          <Row label="健康状态">
            <View className="flex items-center flex-wrap" style={{ gap: 8 }}>
              <Text className="text-base font-bold" style={{ color: primary.color }}>
                {primary.name}
              </Text>
              {secondary ? (
                <View className="rounded-full px-2 py-0.5" style={{ background: 'rgba(217,169,120,0.16)' }}>
                  <Text className="text-[10px]" style={{ color: '#B45309' }}>
                    兼有 · {secondary.name}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="text-xs text-[#3F3A34] mt-1.5 block" style={{ lineHeight: 1.7 }}>
              {primary.description}
            </Text>
          </Row>
        </View>

        {/* ② 发生机制 */}
        <View style={DIVIDER}>
          <Row label="发生机制">
            <Text className="text-xs text-[#3F3A34] block" style={{ lineHeight: 1.7 }}>
              {mechanism.general}
            </Text>
            <View className="mt-2 flex flex-col" style={{ gap: 6 }}>
              {mechanism.items.map((s, i) => (
                <View key={i} className="flex" style={{ gap: 6 }}>
                  <Text className="text-xs font-bold" style={{ color: '#B45309' }}>
                    {i + 1}.
                  </Text>
                  <Text className="text-xs text-[#3F3A34] flex-1" style={{ lineHeight: 1.7 }}>
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          </Row>
        </View>

        {/* ③ 关键依据（证据链 + 交互项） */}
        <View style={DIVIDER}>
          <Row label="关键依据">
            <View className="flex flex-wrap" style={{ gap: 6 }}>
              {topEvidence.map((e) => (
                <View key={e.dim} className="rounded-lg px-2 py-1" style={{ background: '#F7F3E9' }}>
                  <Text className="text-[10px] text-[#6F675C]">
                    {e.dimLabel} · {e.label}
                  </Text>
                </View>
              ))}
            </View>
            {analysis.interactions.length > 0 ? (
              <View className="mt-2 flex flex-col" style={{ gap: 4 }}>
                {analysis.interactions.map((t, i) => (
                  <Text key={i} className="text-[10px]" style={{ color: '#15803D', lineHeight: 1.6 }}>
                    ✦ {t}
                  </Text>
                ))}
              </View>
            ) : (
              <Text className="text-[10px] text-[#9A9388] mt-2 block" style={{ lineHeight: 1.6 }}>
                共 {analysis.informativeDims} 项特征有指向性，其余 {analysis.neutralDims} 项偏中性
              </Text>
            )}
          </Row>
        </View>

        {/* ④ 健康指数 */}
        <View style={DIVIDER}>
          <Row label="健康指数">
            <View className="flex items-baseline" style={{ gap: 6 }}>
              <Text className="text-3xl font-bold" style={{ color: index.color }}>
                {index.score.toFixed(1)}
              </Text>
              <Text className="text-xs text-[#6F675C]">分</Text>
              <View className="rounded-full px-2 py-0.5 ml-1" style={{ background: `${index.color}1A` }}>
                <Text className="text-[10px] font-semibold" style={{ color: index.color }}>
                  {index.bandLabel}
                </Text>
              </View>
            </View>
            <Text className="text-xs text-[#3F3A34] mt-1.5 block" style={{ lineHeight: 1.7 }}>
              {index.advice}
            </Text>
            <Text className="text-[10px] text-[#9A9388] mt-1 block">
              置信区间 {index.ci[0].toFixed(1)} – {index.ci[1].toFixed(1)}（越窄越稳定）
            </Text>
            {history.length > 0 ? <TrendChart points={history} color={index.color} /> : null}
          </Row>
        </View>

        {/* ⑤ 数据库参考（案例库佐证，离线/超时优雅降级） */}
        <View style={DIVIDER}>
          <Row label="数据库参考">
            {refState === 'loading' ? (
              <Text className="text-[10px] text-[#9A9388] block">正在比对本地舌象案例库…</Text>
            ) : refState === 'offline' ? (
              <Text className="text-[10px] text-[#9A9388] block">
                本地案例库暂不可用（不影响本地分析）
              </Text>
            ) : refs && refs.matched > 0 ? (
              <View>
                <Text className="text-xs text-[#3F3A34] block" style={{ lineHeight: 1.7 }}>
                  在 {refs.total} 例同类舌象案例中，{refs.matched} 例与你的特征高度相近（
                  {refs.bestMatch} 维吻合）；其中 {refs.samePrimary} 例主倾向同为「{primary.name}」。
                </Text>
                <View className="mt-2 flex flex-wrap" style={{ gap: 6 }}>
                  {(['low', 'mid', 'high'] as const).map((b) => (
                    <View
                      key={b}
                      className="rounded-full px-2 py-0.5"
                      style={{ background: `${BAND_META[b].color}1A` }}
                    >
                      <Text className="text-[10px] font-semibold" style={{ color: BAND_META[b].color }}>
                        {BAND_SHORT[b]} {refs.bandDist[b]}
                      </Text>
                    </View>
                  ))}
                </View>
                <View className="mt-2 flex flex-col" style={{ gap: 6 }}>
                  {refs.top.map((c) => (
                    <View key={c.case_no} className="rounded-lg p-2" style={{ background: '#F7F3E9' }}>
                      <View className="flex items-center justify-between">
                        <Text className="text-[10px] text-[#6F675C]">{c.case_no} · 参考案例（去标识）</Text>
                        <View
                          className="rounded-full px-1.5 py-0.5"
                          style={{ background: `${BAND_META[c.band].color}1A` }}
                        >
                          <Text className="text-[10px] font-semibold" style={{ color: BAND_META[c.band].color }}>
                            {BAND_SHORT[c.band]} · {c.health_index.toFixed(1)}分
                          </Text>
                        </View>
                      </View>
                      {c.expert_note ? (
                        <Text className="text-[10px] text-[#6F675C] mt-1 block" style={{ lineHeight: 1.6 }}>
                          {c.expert_note}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <Text className="text-[10px] text-[#9A9388] block">
                库内暂无以完全相同特征组合的案例，本次以本地辨证为准。
              </Text>
            )}
          </Row>
        </View>
      </View>

      <Text className="text-[10px] text-[#9A9388] mt-1 block" style={{ lineHeight: 1.6 }}>
        指数与分级为食养参考，会随你的舌象变化而波动，不代表身体检查结论。
      </Text>

      {/* 跳转我的食养画像（本地聚合，不存个人信息） */}
      <View
        onClick={() => Taro.navigateTo({ url: '/pages/food/profile/index' })}
        className="mt-3 flex items-center justify-between rounded-xl px-3 py-2.5"
        style={{ background: '#F7F3E9' }}
      >
        <Text className="text-xs font-semibold text-[#3F3A34]">查看我的食养画像</Text>
        <Text style={{ color: '#C9C0B4', fontSize: 16 }}>›</Text>
      </View>
    </View>
  )
}
