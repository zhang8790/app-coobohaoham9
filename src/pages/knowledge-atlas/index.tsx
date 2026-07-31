// @title 食安知识图谱
// 入口：扫描结果页 → 收录配料
// 展示：已收集碎片进度 + 按类别浏览 + 未发现提示
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { useFoodKnowledgeStore, type KnowledgeFragment } from '@/store/foodKnowledgeStore'
import { KNOWLEDGE_FRAGMENTS } from '@/utils/knowledge-fragments'

// ── 常量 ───────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  white: '#16A34A',
  yellow: '#D97706',
  black: '#DC2626',
}
const RISK_LABEL: Record<string, string> = {
  white: '安全',
  yellow: '限量',
  black: '避免',
}
const ALL_CATEGORIES = [
  { key: '防腐剂', icon: '🧪', color: '#3B82F6' },
  { key: '甜味剂', icon: '🍬', color: '#EC4899' },
  { key: '色素', icon: '🎨', color: '#8B5CF6' },
  { key: '增稠剂', icon: '🫙', color: '#F59E0B' },
  { key: '抗氧化剂', icon: '⚡', color: '#10B981' },
  { key: '品质改良剂', icon: '🔧', color: '#6B7280' },
]

// ── 进度环 ────────────────────────────────────────────────────────────────

function ProgressRing({ percent, size = 96 }: { percent: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - percent / 100)
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View
        style={{
          width: size, height: size,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.04)',
        }}
      />
      <View
        style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          background: `conic-gradient(#92400E ${percent}%, transparent 0%)`,
          mask: 'radial-gradient(transparent 58%, black 59%)',
          WebkitMask: 'radial-gradient(transparent 58%, black 59%)',
        }}
      />
      <View
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text className="text-sm font-bold" style={{ color: '#78350F' }}>{percent}%</Text>
      </View>
    </View>
  )
}

// ── 碎片详情底部弹窗 ──────────────────────────────────────────────────────

function FragmentDetail({ frag, onClose }: { frag: KnowledgeFragment; onClose: () => void }) {
  const riskColor = RISK_COLOR[frag.riskLevel] || '#9CA3AF'

  return (
    <View
      className="fixed inset-0 z-50 flex flex-col items-center justify-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <View
        className="w-full rounded-t-3xl p-6"
        style={{
          background: '#FFFBF7',
          paddingBottom: (Taro.getStorageSync('safeAreaBottom') || 20) + 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭线 */}
        <View className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: '#E5E7EB' }} />

        {/* 标题行 */}
        <View className="flex items-start gap-3 mb-3">
          <View
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: frag.riskLevel === 'white' ? '#DCFCE7' : frag.riskLevel === 'yellow' ? '#FEF3C7' : '#FEE2E2' }}
          >
            <Text className="text-2xl">🏷️</Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold" style={{ color: '#374151' }}>{frag.name}</Text>
            <View className="flex items-center gap-2 mt-0.5">
              <Text className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: riskColor + '22', color: riskColor }}>
                {RISK_LABEL[frag.riskLevel]}
              </Text>
              <Text className="text-[10px]" style={{ color: '#9CA3AF' }}>{frag.category}</Text>
            </View>
          </View>
        </View>

        {/* 描述 */}
        <View className="px-4 py-3 rounded-xl mb-3" style={{ background: '#F9FAFB' }}>
          <Text className="text-sm leading-relaxed" style={{ color: '#4B5563' }}>{frag.description}</Text>
        </View>

        {/* 风险提示 */}
        {frag.dangerTip && (
          <View className="px-4 py-3 rounded-xl mb-3" style={{ background: '#FEF2F2' }}>
            <Text className="text-sm leading-relaxed" style={{ color: '#DC2626' }}>⚠️ {frag.dangerTip}</Text>
          </View>
        )}

        {/* 趣味知识 */}
        {frag.funFact && (
          <View className="px-4 py-3 rounded-xl mb-4" style={{ background: '#EFF6FF' }}>
            <Text className="text-sm leading-relaxed" style={{ color: '#1D4ED8' }}>💡 {frag.funFact}</Text>
          </View>
        )}

        {/* 安全限量 */}
        {frag.safeLimit && (
          <View className="px-4 py-3 rounded-xl mb-4" style={{ background: '#F0FDF4' }}>
            <Text className="text-xs leading-relaxed" style={{ color: '#16A34A' }}>
              📏 安全限量：{frag.safeLimit}
            </Text>
          </View>
        )}

        {/* 常见食品 */}
        {frag.foundIn && frag.foundIn.length > 0 && (
          <View className="mb-4">
            <Text className="text-xs font-medium mb-2 block" style={{ color: '#9CA3AF' }}>常见于</Text>
            <View className="flex flex-wrap gap-1.5">
              {frag.foundIn.map((food, i) => (
                <View key={i} className="px-2.5 py-1 rounded-full" style={{ background: '#F3F4F6' }}>
                  <Text className="text-xs" style={{ color: '#6B7280' }}>{food}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 行动召唤 */}
        <View
          className="rounded-xl py-3 text-center"
          style={{ background: '#78350F' }}
          onClick={() => { onClose(); Taro.navigateTo({ url: '/pages/food/food-scan/index' }) }}
        >
          <Text className="text-sm font-semibold text-white">📷 扫描配料表收录更多</Text>
        </View>
      </View>
    </View>
  )
}

// ── 新发现弹窗 ────────────────────────────────────────────────────────────

function NewDiscoveryPopup({ frag, onClose }: { frag: KnowledgeFragment; onClose: () => void }) {
  useEffect(() => {
    // 3秒后自动关闭
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <View
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <View
        className="mx-5 rounded-3xl p-6 text-center"
        style={{ background: '#FFFBF7', width: 280 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Text className="text-5xl mb-2 block">🆕</Text>
        <Text className="text-sm font-bold mb-1 block" style={{ color: '#78350F' }}>发现新知识碎片！</Text>
        <Text className="text-2xl font-bold mb-2 block" style={{ color: RISK_COLOR[frag.riskLevel] }}>{frag.name}</Text>
        <View className="px-4 py-2 rounded-xl mb-4" style={{ background: frag.riskLevel === 'white' ? '#DCFCE7' : frag.riskLevel === 'yellow' ? '#FEF3C7' : '#FEE2E2' }}>
          <Text className="text-xs leading-relaxed block" style={{ color: '#4B5563' }}>{frag.description.substring(0, 80)}{frag.description.length > 80 ? '…' : ''}</Text>
        </View>
        <Text className="text-[10px]" style={{ color: '#D1D5DB' }}>点击任意处关闭</Text>
      </View>
    </View>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────

type Tab = 'collected' | 'unknown'

export default function KnowledgeAtlasPage() {
  const [tab, setTab] = useState<Tab>('collected')
  const [selectedFrag, setSelectedFrag] = useState<KnowledgeFragment | null>(null)
  const [newFrag, setNewFrag] = useState<KnowledgeFragment | null>(null)

  const collected = useFoodKnowledgeStore((s) => s.collected)
  const newDiscovery = useFoodKnowledgeStore((s) => s.newDiscovery)
  const totalFragments = useFoodKnowledgeStore((s) => s.totalFragments)
  const markViewed = useFoodKnowledgeStore((s) => s.markViewed)
  const clearNewDiscovery = useFoodKnowledgeStore((s) => s.clearNewDiscovery)
  const getCollectionStats = useFoodKnowledgeStore((s) => s.getCollectionStats)

  const stats = getCollectionStats()
  const collectedList = Object.values(collected)

  // 首次出现新发现时弹出
  useEffect(() => {
    if (newDiscovery && collected[newDiscovery]) {
      setNewFrag(collected[newDiscovery])
      markViewed(newDiscovery)
    }
  }, [newDiscovery])

  // 按类别分组
  const byCategory: Record<string, KnowledgeFragment[]> = {}
  for (const f of collectedList) {
    if (!byCategory[f.category]) byCategory[f.category] = []
    byCategory[f.category].push(f)
  }

  // 未收录的类别（探索未知）
  const unknownCategories = ALL_CATEGORIES.filter(
    (cat) => !byCategory[cat.key] || byCategory[cat.key].length === 0,
  )

  const handleFragClick = (frag: KnowledgeFragment) => {
    markViewed(frag.additiveKey)
    setSelectedFrag(frag)
  }

  return (
    <View className="min-h-screen bg-[#FFFBF7]">
      {/* 顶部进度卡 */}
      <View className="px-5 pt-5 pb-4">
        <View
          className="rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, #78350F 0%, #92400E 100%)' }}
        >
          <View className="flex items-center gap-4">
            <ProgressRing percent={stats.percent} />
            <View className="flex-1">
              <Text className="text-white text-lg font-bold">{collectedList.length} / {stats.total}</Text>
              <Text className="text-white/60 text-xs mt-0.5">知识碎片已收录</Text>
              {stats.percent >= 100 ? (
                <View className="mt-2 px-2 py-1 rounded-full inline-block" style={{ background: '#FCD34D' }}>
                  <Text className="text-[10px] font-bold" style={{ color: '#78350F' }}>🎓 食安博士</Text>
                </View>
              ) : (
                <Text className="text-white/40 text-[10px] mt-1">扫描更多配料表来解锁</Text>
              )}
            </View>
          </View>

          {/* 类别进度条 */}
          <View className="mt-3 flex flex-wrap gap-2">
            {ALL_CATEGORIES.map((cat) => {
              const catStats = stats.categories[cat.key]
              const pct = catStats ? Math.round((catStats.collected / catStats.total) * 100) : 0
              return (
                <View key={cat.key} className="flex items-center gap-1">
                  <Text className="text-xs">{cat.icon}</Text>
                  <View className="h-1 w-10 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <View className="h-full rounded-full" style={{ width: `${pct}%`, background: cat.color }} />
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      </View>

      {/* Tab切换 */}
      <View className="px-5 mb-3 flex gap-3">
        {([['collected', '已收录'], ['unknown', '探索未知']] as const).map(([t, label]) => (
          <View
            key={t}
            className="px-4 py-2 rounded-full"
            style={{ background: tab === t ? '#78350F' : '#F3F4F6' }}
            onClick={() => setTab(t)}
          >
            <Text
              className="text-xs font-medium"
              style={{ color: tab === t ? '#FFFFFF' : '#6B7280' }}
            >
              {label}
              {t === 'unknown' && unknownCategories.length > 0 && ` (${unknownCategories.length})`}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView scrollY className="px-5 pb-8" style={{ height: 'calc(100vh - 250px)' }}>
        {/* 已收录视图 */}
        {tab === 'collected' && (
          <>
            {collectedList.length === 0 ? (
              <View className="py-16 text-center">
                <Text className="text-4xl mb-3">🔍</Text>
                <Text className="text-sm font-medium" style={{ color: '#9CA3AF' }}>还没有收录任何知识</Text>
                <Text className="text-xs mt-1" style={{ color: '#D1D5DB' }}>扫描配料表时会自动收录哦</Text>
                <View
                  className="mt-5 mx-auto px-5 py-3 rounded-xl"
                  style={{ background: '#78350F' }}
                  onClick={() => Taro.navigateTo({ url: '/pages/food/food-scan/index' })}
                >
                  <Text className="text-sm font-semibold text-white">去扫描 →</Text>
                </View>
              </View>
            ) : (
              Object.entries(byCategory).map(([category, frags]) => {
                const catDef = ALL_CATEGORIES.find((c) => c.key === category)
                return (
                  <View key={category} className="mb-5">
                    <View className="flex items-center gap-2 mb-2">
                      <Text className="text-base">{catDef?.icon || '🏷️'}</Text>
                      <Text className="text-sm font-bold" style={{ color: '#374151' }}>{category}</Text>
                      <Text className="text-[10px]" style={{ color: '#9CA3AF' }}>{frags.length}个</Text>
                    </View>
                    <View className="flex flex-wrap gap-2">
                      {frags.map((frag) => {
                        const riskColor = RISK_COLOR[frag.riskLevel] || '#9CA3AF'
                        return (
                          <View
                            key={frag.additiveKey}
                            className="px-3 py-2.5 rounded-xl flex items-center gap-2"
                            style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                            onClick={() => handleFragClick(frag)}
                          >
                            <View
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: riskColor }}
                            />
                            <Text className="text-xs font-medium" style={{ color: '#374151' }}>
                              {frag.name}
                            </Text>
                            {!frag.viewed && <Text className="text-[8px]">🆕</Text>}
                          </View>
                        )
                      })}
                    </View>
                  </View>
                )
              })
            )}
          </>
        )}

        {/* 探索未知视图 */}
        {tab === 'unknown' && (
          <>
            {unknownCategories.length === 0 ? (
              <View className="py-16 text-center">
                <Text className="text-4xl mb-3">🎉</Text>
                <Text className="text-sm font-medium" style={{ color: '#78350F' }}>太棒了，所有类别都有收录！</Text>
                <Text className="text-xs mt-1" style={{ color: '#9CA3AF' }}>继续扫描发现更多成分</Text>
              </View>
            ) : (
              <View className="mb-4">
                <View className="px-4 py-3 rounded-xl mb-4" style={{ background: '#FEF3C7' }}>
                  <Text className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
                    🔬 扫描含有这些类别的商品，就能解锁对应的知识碎片。每一个未知背后都藏着值得了解的真相。
                  </Text>
                </View>
                {unknownCategories.map((cat) => (
                  <View
                    key={cat.key}
                    className="rounded-xl p-4 mb-3 flex items-center gap-3"
                    style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                  >
                    <View
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: cat.color + '22' }}
                    >
                      <Text className="text-xl">{cat.icon}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium" style={{ color: '#374151' }}>{cat.key}</Text>
                      <Text className="text-[10px]" style={{ color: '#9CA3AF' }}>扫描相关商品即可解锁</Text>
                    </View>
                    <View
                      className="px-3 py-1.5 rounded-full"
                      style={{ background: cat.color + '22' }}
                      onClick={() => Taro.navigateTo({ url: '/pages/food/food-scan/index' })}
                    >
                      <Text className="text-xs font-medium" style={{ color: cat.color }}>去扫描</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* 碎片详情弹窗 */}
      {selectedFrag && (
        <FragmentDetail frag={selectedFrag} onClose={() => setSelectedFrag(null)} />
      )}

      {/* 新发现弹窗 */}
      {newFrag && (
        <NewDiscoveryPopup
          frag={newFrag}
          onClose={() => {
            clearNewDiscovery()
            setNewFrag(null)
          }}
        />
      )}
    </View>
  )
}
