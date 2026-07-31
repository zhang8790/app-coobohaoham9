// @title 食安知识图谱
import { useState, useEffect, useMemo } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text, Image, ScrollView, Button } from '@tarojs/components'
import { useFoodKnowledgeStore, type KnowledgeFragment } from '@/store/foodKnowledgeStore'
import { KNOWLEDGE_FRAGMENTS } from '@/utils/knowledge-fragments'
import { ADDITIVE_DICT, matchAdditiveKeys, type AdditiveRisk } from '@/utils/additive-dictionary'

// ==================== 风险图标映射 ====================
const RISK_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  white:  { color: '#16A34A', bg: '#DCFCE7', icon: '🟢', label: '安全' },
  yellow: { color: '#D97706', bg: '#FEF3C7', icon: '🟡', label: '限量关注' },
  black:  { color: '#DC2626', bg: '#FEE2E2', icon: '🔴', label: '应避免' },
}

// 进度环组件
function ProgressRing({ percent, size = 80, stroke = 6 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  return (
    <View className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <View
        className="absolute rounded-full"
        style={{ width: size, height: size, background: '#F3F4F6', opacity: 0.3 }}
      />
      <View
        className="absolute rounded-full origin-center"
        style={{
          width: size,
          height: size,
          border: `${stroke}px solid #16A34A`,
          borderRadius: '50%',
          transform: 'rotate(-90deg)',
          borderTopColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: percent > 50 ? '#16A34A' : 'transparent',
          borderLeftColor: percent > 25 ? '#16A34A' : 'transparent',
          clipPath: percent <= 25 ? 'polygon(50% 50%, 50% 0%, 50% 0%, 50% 50%)' : undefined,
        }}
      />
      <View className="flex flex-col items-center">
        <Text className="text-lg font-bold text-[#1A1A1A]" style={{ lineHeight: 1 }}>{percent}%</Text>
        <Text className="text-[10px] text-[#9A8070] mt-0.5">收录</Text>
      </View>
    </View>
  )
}

// 碎片卡片
function FragmentCard({ fragment, onClick }: { fragment: KnowledgeFragment; onClick: () => void }) {
  const cfg = RISK_CONFIG[fragment.riskLevel] || RISK_CONFIG.white
  return (
    <View
      className="bg-white rounded-2xl p-4 mb-3"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
      onClick={onClick}
    >
      <View className="flex items-start justify-between">
        <View className="flex-1">
          <View className="flex items-center gap-2 mb-1">
            <Text className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.color }}>
              {cfg.icon} {cfg.label}
            </Text>
            <Text className="text-xs text-[#9A8070]">{fragment.category}</Text>
          </View>
          <Text className="text-sm font-bold text-[#1A1A1A] leading-snug">{fragment.name}</Text>
          <Text className="text-xs text-[#6B7280] mt-1 leading-relaxed">{fragment.title}</Text>
        </View>
        <View className="ml-3 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: cfg.bg }}>
          <Text className="text-xl">{fragment.viewed ? '📖' : '✨'}</Text>
        </View>
      </View>
      {fragment.discoveredAt && (
        <Text className="text-[10px] text-[#BFBFBF] mt-2">
          发现于 {new Date(fragment.discoveredAt).toLocaleDateString('zh-CN')}
        </Text>
      )}
    </View>
  )
}

// 碎片详情弹窗
function FragmentDetail({ fragment, onClose }: { fragment: KnowledgeFragment; onClose: () => void }) {
  const cfg = RISK_CONFIG[fragment.riskLevel] || RISK_CONFIG.white
  const { markViewed } = useFoodKnowledgeStore()

  useEffect(() => {
    markViewed(fragment.additiveKey)
  }, [])

  return (
    <View className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <View className="absolute inset-0 bg-black/40" />
      <View
        className="relative w-full rounded-t-3xl bg-[#FFFBF7] px-5 pt-5 pb-8 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部拖动条 */}
        <View className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        {/* 标题区 */}
        <View className="flex items-center gap-3 mb-4">
          <View
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg }}
          >
            <Text className="text-2xl">{cfg.icon}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-[#1A1A1A]">{fragment.name}</Text>
            <View className="flex items-center gap-2 mt-1">
              <Text
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                {cfg.label}
              </Text>
              <Text className="text-xs text-[#9A8070]">{fragment.category}</Text>
            </View>
          </View>
        </View>

        {/* 核心知识 */}
        <View className="mb-4">
          <Text className="text-sm font-bold text-[#1A1A1A] mb-2">📖 安全说明</Text>
          <View className="bg-white rounded-xl p-4" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Text className="text-sm text-[#374151] leading-relaxed">{fragment.description}</Text>
          </View>
        </View>

        {/* 冷知识 */}
        <View className="mb-4">
          <Text className="text-sm font-bold text-[#1A1A1A] mb-2">🧠 有趣冷知识</Text>
          <View
            className="rounded-xl p-4"
            style={{ background: 'linear-gradient(135deg, #FEF9EF 0%, #FEF3E2 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
          >
            <Text className="text-sm text-[#92400E] leading-relaxed">{fragment.funFact}</Text>
          </View>
        </View>

        {/* 食用参考：了解食材特性，吃得更安心 */}
        {fragment.dangerTip && (
          <View className="mb-4">
            <Text className="text-sm font-bold text-[#78350F] mb-2">📌 食用参考</Text>
            <View
              className="rounded-xl p-4"
              style={{ background: '#FEF3C7', boxShadow: '0 2px 8px rgba(120,53,15,0.06)' }}
            >
              <Text className="text-sm text-[#78350F] leading-relaxed">{fragment.dangerTip}</Text>
            </View>
          </View>
        )}

        {/* 常见食品 */}
        {fragment.foundIn && fragment.foundIn.length > 0 && (
          <View className="mb-4">
            <Text className="text-sm font-bold text-[#1A1A1A] mb-2">🏪 常见于</Text>
            <View className="flex flex-wrap gap-2">
              {fragment.foundIn.map((food) => (
                <Text
                  key={food}
                  className="text-xs px-3 py-1.5 rounded-full bg-white border border-gray-100 text-[#374151]"
                  style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                >
                  {food}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* 安全限量 */}
        {fragment.safeLimit && (
          <View className="mb-6">
            <Text className="text-sm font-bold text-[#1A1A1A] mb-2">📋 法规限量</Text>
            <View className="bg-white rounded-xl p-4" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text className="text-xs text-[#6B7280] leading-relaxed">{fragment.safeLimit}</Text>
            </View>
          </View>
        )}

        {/* 关闭按钮 */}
        <Button
          className="w-full py-3 rounded-xl text-sm font-medium text-[#FFFBF7]"
          style={{ background: '#1A1A1A' }}
          onClick={onClose}
        >
          我知道了
        </Button>
      </View>
    </View>
  )
}

// 新碎片发现弹窗
function DiscoveryModal({ fragment, onClose }: { fragment: KnowledgeFragment; onClose: () => void }) {
  const cfg = RISK_CONFIG[fragment.riskLevel] || RISK_CONFIG.white
  return (
    <View className="fixed inset-0 z-50 flex items-center justify-center">
      <View className="absolute inset-0 bg-black/50" />
      <View
        className="relative mx-6 bg-[#FFFBF7] rounded-3xl p-6 text-center"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        {/* 爆炸星星效果 */}
        <View className="absolute -top-6 left-1/2 -translate-x-1/2">
          <Text className="text-5xl">✨</Text>
        </View>

        <Text className="text-xs text-[#9A8070] mt-2 mb-1">发现新知识碎片</Text>
        <Text className="text-xl font-bold text-[#1A1A1A] mb-4">{fragment.name}</Text>

        <View
          className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: cfg.bg }}
        >
          <Text className="text-4xl">{cfg.icon}</Text>
        </View>

        <Text className="text-sm text-[#6B7280] leading-relaxed mb-1">{fragment.title}</Text>
        <Text className="text-xs text-[#BFBFBF]">{fragment.category}</Text>

        <Button
          className="mt-5 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: '#16A34A' }}
          onClick={onClose}
        >
          收入图谱 ✦
        </Button>
        <Button
          className="mt-2 py-2.5 rounded-xl text-sm text-[#9A8070]"
          onClick={onClose}
        >
          先看看
        </Button>
      </View>
    </View>
  )
}

// 探索页：未收集的碎片
function ExploreTab({ onDiscover }: { onDiscover: (key: string) => void }) {
  const allKeys = Object.keys(KNOWLEDGE_FRAGMENTS)
  const collected = useFoodKnowledgeStore((s) => Object.keys(s.collected))
  const collectedSet = useMemo(() => new Set(collected), [collected])

  const uncollected = allKeys.filter((k) => !collectedSet.has(k))

  // 按分类分组
  const categories = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const key of uncollected) {
      const info = ADDITIVE_DICT[key]
      if (!info) continue
      const cat = info.category
      if (!map[cat]) map[cat] = []
      map[cat].push(key)
    }
    return map
  }, [uncollected])

  if (uncollected.length === 0) {
    return (
      <View className="flex flex-col items-center justify-center py-16">
        <Text className="text-4xl mb-4">🎉</Text>
        <Text className="text-base font-bold text-[#1A1A1A]">图谱已收录完毕！</Text>
        <Text className="text-xs text-[#9A8070] mt-2">你是真正的食安大师</Text>
      </View>
    )
  }

  return (
    <ScrollView scrollY className="flex-1 px-4 pb-6">
      <View className="mb-4 mt-2">
        <Text className="text-sm font-bold text-[#1A1A1A]">未探索的成分</Text>
        <Text className="text-xs text-[#9A8070] mt-0.5">
          共 {uncollected.length} 种，继续扫描解锁
        </Text>
      </View>

      {Object.entries(categories).map(([cat, keys]) => (
        <View key={cat} className="mb-5">
          <Text className="text-xs font-bold text-[#9A8070] mb-2 uppercase tracking-wider">{cat}</Text>
          <View className="flex flex-wrap gap-2">
            {keys.map((key) => {
              const info = ADDITIVE_DICT[key]
              if (!info) return null
              const cfg = RISK_CONFIG[info.risk_level] || RISK_CONFIG.white
              return (
                <View
                  key={key}
                  className="px-3 py-2 rounded-xl border border-dashed flex items-center gap-1.5 cursor-pointer"
                  style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }}
                  onClick={() => onDiscover(key)}
                >
                  <Text className="text-sm">{cfg.icon}</Text>
                  <Text className="text-xs text-[#6B7280]">{key}</Text>
                  <Text className="text-[10px] text-[#BFBFBF]">❓</Text>
                </View>
              )
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

export default function KnowledgeAtlasPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'collection' | 'explore'>('collection')
  const [selectedFragment, setSelectedFragment] = useState<KnowledgeFragment | null>(null)
  const [showDiscovery, setShowDiscovery] = useState<KnowledgeFragment | null>(null)

  const { collected, newDiscovery, clearNewDiscovery, getCollection, getCollectionStats, discoverFragment, markViewed } =
    useFoodKnowledgeStore()

  // 检查新发现
  useEffect(() => {
    if (newDiscovery && KNOWLEDGE_FRAGMENTS[newDiscovery]) {
      const fragment = {
        ...KNOWLEDGE_FRAGMENTS[newDiscovery],
        additiveKey: newDiscovery,
        discoveredAt: new Date().toISOString(),
        viewed: false,
      }
      setShowDiscovery(fragment)
    }
  }, [newDiscovery])

  // 如果从扫描页传入的成分key，直接解锁
  useEffect(() => {
    const additiveKey = router.params.keyword
    if (additiveKey) {
      discoverFragment(additiveKey)
    }
  }, [])

  const stats = useMemo(() => getCollectionStats(), [collected])
  const collectionList = useMemo(() => getCollection(), [collected])

  // 未读优先
  const sortedCollection = useMemo(() => {
    return [...collectionList].sort((a, b) => {
      if (a.viewed !== b.viewed) return a.viewed ? 1 : -1
      return 0
    })
  }, [collectionList])

  // TabBar 切换
  const switchTab = (tab: 'collection' | 'explore') => {
    setActiveTab(tab)
  }

  const handleCloseDiscovery = () => {
    setShowDiscovery(null)
    clearNewDiscovery()
  }

  const handleDiscover = (key: string) => {
    discoverFragment(key)
    const fragment = {
      ...KNOWLEDGE_FRAGMENTS[key],
      additiveKey: key,
      discoveredAt: new Date().toISOString(),
      viewed: false,
    }
    setShowDiscovery(fragment)
  }

  return (
    <View className="min-h-screen bg-[#F9F7F4] flex flex-col">
      {/* 顶部头部 */}
      <View className="bg-[#FFFBF7] px-4 pt-4 pb-3">
        <View className="flex items-center justify-between mb-4">
          <View>
            <Text className="text-lg font-bold text-[#1A1A1A]">食安知识图谱</Text>
            <Text className="text-xs text-[#9A8070] mt-0.5">解锁你的食安超能力</Text>
          </View>
          <ProgressRing percent={stats.percent} size={64} stroke={5} />
        </View>

        {/* 进度条 */}
        <View className="bg-gray-100 rounded-full h-2 mb-1 overflow-hidden">
          <View
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${stats.percent}%`,
              background: 'linear-gradient(90deg, #16A34A 0%, #22C55E 100%)',
            }}
          />
        </View>
        <Text className="text-xs text-[#9A8070]">
          已收录 {stats.collected} / 总计 {stats.total} 种成分
        </Text>

        {/* Tab切换 */}
        <View className="flex gap-3 mt-4">
          {(['collection', 'explore'] as const).map((tab) => (
            <View
              key={tab}
              className="px-4 py-2 rounded-full cursor-pointer transition-all"
              style={{
                background: activeTab === tab ? '#1A1A1A' : 'transparent',
              }}
              onClick={() => switchTab(tab)}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: activeTab === tab ? '#FFFBF7' : '#9A8070' }}
              >
                {tab === 'collection' ? `📚 我的收藏 (${stats.collected})` : '🔍 探索未知'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* 内容区 */}
      {activeTab === 'collection' ? (
        sortedCollection.length === 0 ? (
          <View className="flex-1 flex flex-col items-center justify-center py-16 px-6">
            <Text className="text-5xl mb-4">🔬</Text>
            <Text className="text-base font-bold text-[#1A1A1A] mb-2">图谱还是空的</Text>
            <Text className="text-xs text-[#9A8070] text-center leading-relaxed mb-6">
              去扫描食品配料表{'\n'}每发现一种成分就会自动收录到这里
            </Text>
            <Button
              className="py-2.5 px-6 rounded-full text-sm font-medium text-[#FFFBF7]"
              style={{ background: '#16A34A' }}
              onClick={() => setActiveTab('explore')}
            >
              先去看看有哪些
            </Button>
          </View>
        ) : (
          <ScrollView scrollY className="flex-1 px-4 pt-4 pb-6">
            {sortedCollection.map((fragment) => (
              <FragmentCard
                key={fragment.additiveKey}
                fragment={fragment}
                onClick={() => {
                  setSelectedFragment(fragment)
                  markViewed(fragment.additiveKey)
                }}
              />
            ))}
          </ScrollView>
        )
      ) : (
        <ExploreTab onDiscover={handleDiscover} />
      )}

      {/* 碎片详情弹窗 */}
      {selectedFragment && (
        <FragmentDetail
          fragment={selectedFragment}
          onClose={() => setSelectedFragment(null)}
        />
      )}

      {/* 新发现弹窗 */}
      {showDiscovery && (
        <DiscoveryModal
          fragment={showDiscovery}
          onClose={handleCloseDiscovery}
        />
      )}
    </View>
  )
}
