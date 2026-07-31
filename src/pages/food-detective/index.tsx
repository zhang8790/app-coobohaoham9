// @title 食安侦探局
// 玩法：每个案件=一个真实商品配料表，找出其中的「问题添加剂」(黄/黑风险)
// 目的：训练用户扫配料表的核心能力，顺带解锁食安知识碎片
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import {
  DETECTIVE_CASES,
  TOTAL_CASES,
  evaluateCase,
  difficultyLabel,
  type DetectiveCase,
  type CaseResult,
} from '@/utils/detective-cases'
import { KNOWLEDGE_FRAGMENTS } from '@/utils/knowledge-fragments'
import { useFoodKnowledgeStore } from '@/store/foodKnowledgeStore'
import { useDetectiveStore } from '@/store/detectiveStore'
import { useAuth } from '@/contexts/AuthContext'
import { grantEmotionBadge } from '@/db/api'

// ── 风险色 ────────────────────────────────────────────────────────────────

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

// ── 屏幕定义 ──────────────────────────────────────────────────────────────

type Screen = 'list' | 'case' | 'result'

// ── 主页面 ────────────────────────────────────────────────────────────────

export default function FoodDetectivePage() {
  const [screen, setScreen] = useState<Screen>('list')
  const [activeCase, setActiveCase] = useState<DetectiveCase | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<CaseResult | null>(null)

  const discoverFragment = useFoodKnowledgeStore((s) => s.discoverFragment)
  const solved = useDetectiveStore((s) => s.solved)
  const totalPoints = useDetectiveStore((s) => s.totalPoints)
  const solveCase = useDetectiveStore((s) => s.solveCase)
  const getLevel = useDetectiveStore((s) => s.getLevel)
  const getStats = useDetectiveStore((s) => s.getStats)
  const { profile } = useAuth()

  const level = getLevel()
  const stats = getStats()

  // ── 进入案件 ──
  const openCase = (c: DetectiveCase) => {
    setActiveCase(c)
    setSelected([])
    setScreen('case')
  }

  // ── 标记/取消标记配料 ──
  const toggleIngredient = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    )
  }

  // ── 提交推理 ──
  const submitGuess = () => {
    if (!activeCase) return
    if (selected.length === 0) {
      Taro.showToast({ title: '先标记可疑项', icon: 'none' })
      return
    }
    const res = evaluateCase(activeCase, selected)
    for (const frag of res.newFragments) {
      discoverFragment(frag)
    }
    if (res.passed) {
      solveCase(res, activeCase.points)
      // 破案后同步侦探徽章到后端（userId 从 AuthContext 获取）
      if (profile?.id) {
        const newCount = useDetectiveStore.getState().getSolvedCount() + 1
        if (newCount >= 1) grantEmotionBadge(profile.id, 'detective_1', 'auto').catch(() => {})
        if (newCount >= 5) grantEmotionBadge(profile.id, 'detective_5', 'auto').catch(() => {})
        if (newCount >= TOTAL_CASES) grantEmotionBadge(profile.id, 'detective_all', 'auto').catch(() => {})
      }
    }
    setResult(res)
    setScreen('result')
  }

  // ── 返回列表 ──
  const backToList = () => {
    setScreen('list')
    setActiveCase(null)
    setSelected([])
    setResult(null)
  }

  // ───────────────────────────────────────────────────────────────────────
  // 屏幕1：侦探局首页
  // ───────────────────────────────────────────────────────────────────────
  if (screen === 'list') {
    return (
      <View className="min-h-screen bg-[#FFFBF7]">
        {/* 侦探档案卡 */}
        <View className="px-5 pt-5 pb-3">
          <View
            className="rounded-2xl p-5"
            style={{ background: 'linear-gradient(135deg, #1F2937 0%, #374151 100%)' }}
          >
            <View className="flex items-center justify-between">
              <View className="flex items-center gap-3">
                <Text className="text-3xl">🕵️</Text>
                <View>
                  <Text className="text-white text-lg font-bold">{level.title}</Text>
                  <Text className="text-xs text-white/60">Lv.{level.level} · {stats.solved}/{stats.total} 案破获</Text>
                </View>
              </View>
              <View className="text-right">
                <Text className="text-white text-xl font-bold">{totalPoints}</Text>
                <Text className="text-xs text-white/60">侦探积分</Text>
              </View>
            </View>
            {/* 等级进度条 */}
            <View className="mt-3">
              <View className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <View className="h-full rounded-full" style={{ width: `${level.progress}%`, background: '#FCD34D' }} />
              </View>
              <Text className="text-xs text-white/50 mt-1">
                {level.nextAt !== null ? `距${level.nextAt}分解锁下一等级` : '已达最高等级'}
              </Text>
            </View>
          </View>
        </View>

        {/* 玩法说明 */}
        <View className="px-5 mb-3">
          <View className="rounded-xl px-4 py-3" style={{ background: '#FEF3C7' }}>
            <Text className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
              🔍 每个案件里都藏着「问题添加剂」。把它们全部揪出来，就破获了案件，还能解锁食安知识。
            </Text>
          </View>
        </View>

        {/* 案件列表 */}
        <ScrollView scrollY className="px-5 pb-8" style={{ height: 'calc(100vh - 230px)' }}>
          <Text className="text-sm font-bold text-[#374151] mb-2">📂 待破案件</Text>
          {DETECTIVE_CASES.map((c) => {
            const isSolved = !!solved[c.id]
            const solvedInfo = solved[c.id]
            return (
              <View
                key={c.id}
                className="rounded-2xl p-4 mb-3 bg-white"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', opacity: isSolved ? 0.75 : 1 }}
                onClick={() => openCase(c)}
              >
                <View className="flex items-center justify-between">
                  <View className="flex items-center gap-2 flex-1">
                    <Text className="text-xl">{isSolved ? '✅' : '📋'}</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-bold" style={{ color: '#374151' }}>{c.title}</Text>
                      <Text className="text-xs" style={{ color: '#9CA3AF' }}>{c.productName} · {c.brand}</Text>
                    </View>
                  </View>
                  <View
                    className="px-2 py-1 rounded"
                    style={{ background: c.difficulty === 1 ? '#DCFCE7' : c.difficulty === 2 ? '#FEF3C7' : '#FEE2E2' }}
                  >
                    <Text
                      className="text-[10px] font-medium"
                      style={{ color: c.difficulty === 1 ? '#16A34A' : c.difficulty === 2 ? '#D97706' : '#DC2626' }}
                    >
                      {difficultyLabel(c.difficulty)}
                    </Text>
                  </View>
                </View>
                {isSolved && solvedInfo && (
                  <View className="mt-2 flex items-center gap-3">
                    <Text className="text-[10px] px-2 py-0.5 rounded" style={{ background: '#F3F4F6', color: '#6B7280' }}>
                      得分 {solvedInfo.score}
                    </Text>
                    <Text className="text-[10px]" style={{ color: '#16A34A' }}>
                      +{solvedInfo.points} 积分
                    </Text>
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      </View>
    )
  }

  // ───────────────────────────────────────────────────────────────────────
  // 屏幕2：案件详情（推理中）
  // ───────────────────────────────────────────────────────────────────────
  if (screen === 'case' && activeCase) {
    return (
      <View className="min-h-screen bg-[#FFFBF7]">
        {/* 案情 */}
        <View className="px-5 pt-5 pb-3">
          <View
            className="rounded-2xl p-4"
            style={{ background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)' }}
          >
            <View className="flex items-center gap-2 mb-2">
              <Text className="text-lg">📋</Text>
              <Text className="text-base font-bold" style={{ color: '#991B1B' }}>{activeCase.title}</Text>
            </View>
            <Text className="text-xs leading-relaxed" style={{ color: '#7F1D1D' }}>
              {activeCase.scene}
            </Text>
            <View className="mt-2 px-3 py-2 rounded-lg bg-white/60">
              <Text className="text-xs" style={{ color: '#991B1B' }}>
                🔍 涉案商品：{activeCase.productName}（{activeCase.brand}）
              </Text>
            </View>
          </View>
        </View>

        {/* 配料表（可点击标记） */}
        <View className="px-5 mb-2">
          <Text className="text-sm font-bold text-[#374151] mb-2">
            🧾 配料表（点击标记可疑项）
          </Text>
          <View className="flex flex-wrap gap-2">
            {activeCase.ingredientList.map((ing, i) => {
              const isSel = selected.includes(ing)
              return (
                <View
                  key={i}
                  className="px-3 py-2 rounded-xl"
                  style={{
                    background: isSel ? '#FEE2E2' : '#FFFFFF',
                    border: `1.5px solid ${isSel ? '#DC2626' : '#E5E7EB'}`,
                  }}
                  onClick={() => toggleIngredient(ing)}
                >
                  <View className="flex items-center gap-1">
                    {isSel && <Text className="text-xs" style={{ color: '#DC2626' }}>⚠️</Text>}
                    <Text className="text-sm font-medium" style={{ color: isSel ? '#DC2626' : '#374151' }}>
                      {ing}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>

        {/* 已选提示 */}
        <View className="px-5 mb-2">
          {selected.length > 0 ? (
            <Text className="text-xs" style={{ color: '#9CA3AF' }}>
              已标记 {selected.length} 项：{selected.join('、')}
            </Text>
          ) : (
            <Text className="text-xs" style={{ color: '#D1D5DB' }}>
              还没有标记任何配料
            </Text>
          )}
        </View>

        {/* 底部操作栏 */}
        <View
          className="fixed bottom-0 left-0 right-0 px-5 py-3"
          style={{
            background: 'linear-gradient(0deg, #FFFBF7 60%, transparent)',
            paddingBottom: Taro.getStorageSync('safeAreaBottom') || 20,
          }}
        >
          <View className="flex gap-3">
            <View
              className="rounded-xl py-3 px-5 flex items-center justify-center"
              style={{ background: '#F3F4F6' }}
              onClick={() => { setScreen('list'); setActiveCase(null); setSelected([]) }}
            >
              <Text className="text-sm font-medium text-[#6B7280]">← 案件列表</Text>
            </View>
            <View
              className="flex-1 rounded-xl py-3 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)' }}
              onClick={submitGuess}
            >
              <Text className="text-sm font-semibold text-white">🔍 提交推理</Text>
            </View>
          </View>
        </View>
      </View>
    )
  }

  // ───────────────────────────────────────────────────────────────────────
  // 屏幕3：推理结果
  // ───────────────────────────────────────────────────────────────────────
  if (screen === 'result' && result && activeCase) {
    const case2 = activeCase

    return (
      <View className="min-h-screen bg-[#FFFBF7]">
        <ScrollView scrollY className="px-5 pt-5 pb-24" style={{ height: '100vh' }}>
          {/* 结果横幅 */}
          <View
            className="rounded-2xl p-5 mb-4 text-center"
            style={{
              background: result.passed
                ? 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)'
                : 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
            }}
          >
            <Text className="text-4xl mb-1">{result.passed ? '🎉' : '🤔'}</Text>
            <Text className="text-lg font-bold" style={{ color: result.passed ? '#166534' : '#92400E' }}>
              {result.passed ? '案件破获！' : '差一点点'}
            </Text>
            <Text className="text-sm mt-1" style={{ color: result.passed ? '#166534' : '#92400E' }}>
              推理得分 {result.score} · {result.passed ? `获得 ${case2.points} 积分` : '未通过'}
            </Text>
          </View>

          {/* 配料复盘 */}
          <Text className="text-sm font-bold text-[#374151] mb-2">🔍 配料复盘</Text>
          <View className="mb-4">
            {case2.ingredientList.map((ing, i) => {
              const isCulprit = case2.culprits.includes(ing)
              const isSelected = result.selected.includes(ing)
              const frag = KNOWLEDGE_FRAGMENTS[ing]
              const risk = frag?.riskLevel || 'white'

              let bg = '#FFFFFF'
              let border = '#E5E7EB'
              let label = ''
              let color = '#6B7280'

              if (isCulprit && isSelected) {
                bg = '#DCFCE7'; border = '#16A34A'; label = '✓ 揪出'; color = '#166534'
              } else if (isCulprit && !isSelected) {
                bg = '#FEF3C7'; border = '#D97706'; label = '⚠ 漏掉'; color = '#D97706'
              } else if (!isCulprit && isSelected) {
                bg = '#FEE2E2'; border = '#DC2626'; label = '✗ 误报'; color = '#DC2626'
              } else {
                bg = '#F9FAFB'; border = '#E5E7EB'; label = RISK_LABEL[risk]; color = RISK_COLOR[risk]
              }

              return (
                <View
                  key={i}
                  className="rounded-xl px-3 py-2.5 mb-2 flex items-center justify-between"
                  style={{ background: bg, borderWidth: 1, borderStyle: 'solid', borderColor: border }}
                >
                  <View className="flex items-center gap-2">
                    <Text className="text-sm font-medium" style={{ color: '#374151' }}>{ing}</Text>
                    {frag && (
                      <Text
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: risk === 'white' ? '#DCFCE7' : risk === 'yellow' ? '#FEF3C7' : '#FEE2E2', color: RISK_COLOR[risk] }}
                      >
                        {frag.category}
                      </Text>
                    )}
                  </View>
                  <Text className="text-[10px] font-medium" style={{ color }}>{label}</Text>
                </View>
              )
            })}
          </View>

          {/* 知识讲解 */}
          <Text className="text-sm font-bold text-[#374151] mb-2">📖 案件档案</Text>
          <View className="mb-4">
            {case2.culprits.map((name, i) => {
              const frag = KNOWLEDGE_FRAGMENTS[name]
              if (!frag) return null
              return (
                <View key={i} className="rounded-xl p-4 mb-3 bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <View className="flex items-center gap-2 mb-1">
                    <Text className="text-lg">⚠️</Text>
                    <Text className="text-sm font-bold" style={{ color: RISK_COLOR[frag.riskLevel] }}>{frag.name}</Text>
                    <Text
                      className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background: frag.riskLevel === 'white' ? '#DCFCE7' : frag.riskLevel === 'yellow' ? '#FEF3C7' : '#FEE2E2', color: RISK_COLOR[frag.riskLevel] }}
                    >
                      {RISK_LABEL[frag.riskLevel]}
                    </Text>
                  </View>
                  <Text className="text-xs leading-relaxed" style={{ color: '#4B5563' }}>
                    {frag.description}
                  </Text>
                  {frag.dangerTip && (
                    <View className="mt-2 px-2 py-1.5 rounded" style={{ background: '#FEF2F2' }}>
                      <Text className="text-[11px] leading-relaxed" style={{ color: '#DC2626' }}>
                        ⚠️ {frag.dangerTip}
                      </Text>
                    </View>
                  )}
                  {frag.funFact && (
                    <Text className="text-[11px] leading-relaxed mt-1.5" style={{ color: '#9CA3AF' }}>
                      💡 {frag.funFact}
                    </Text>
                  )}
                </View>
              )
            })}
          </View>

          {/* 行动召唤：去扫真实配料表 */}
          <View
            className="rounded-2xl p-4 mb-4 text-center"
            style={{ background: '#EFF6FF', borderWidth: 1, borderStyle: 'solid', borderColor: '#BFDBFE' }}
            onClick={() => Taro.navigateTo({ url: '/pages/food/food-scan/index' })}
          >
            <Text className="text-sm font-medium" style={{ color: '#1D4ED8' }}>
              📷 学会了吗？去扫一个真实配料表试试 →
            </Text>
          </View>
        </ScrollView>

        {/* 底部操作 */}
        <View
          className="fixed bottom-0 left-0 right-0 px-5 py-3"
          style={{
            background: 'linear-gradient(0deg, #FFFBF7 60%, transparent)',
            paddingBottom: Taro.getStorageSync('safeAreaBottom') || 20,
          }}
        >
          <View
            className="rounded-xl py-3 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1F2937 0%, #374151 100%)' }}
            onClick={backToList}
          >
            <Text className="text-sm font-semibold text-white">返回侦探局</Text>
          </View>
        </View>
      </View>
    )
  }

  return null
}
