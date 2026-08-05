// 按需求找 · 真筛 SKU（食养工具模块 #1 深化）
// ------------------------------------------------------------
// 入口：首页「按需求找」8 大需求标签 → 本页 ?scene=xxx
// 能力：把「需求标签」映射为「预置人群 + 偏好食养功效」，复用食养纯函数分类器
//       classifyProduct（rec/cautious/forbidden_crowds 三档）做权威分档，
//       再以商品 health_tag 命中做需求契合兜底（保证有结果），
//       叠加用户过敏原硬红线（avoid 优先）与体质偏冲（caution）。
//       全程确定性、零 LLM 依赖、不空页；结果按用户画像真实筛选。
// 合规：仅作日常食养参考，不替代医嘱；不含诊疗或功效类医疗宣称。

import { useEffect, useState, useMemo } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from '@/contexts/LocationContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import { getProducts, addToCart } from '@/db/api'
import {
  classifyProduct,
  toFoodTherapyInput,
  type Crowd,
  type FitTier,
  type FoodTherapyInput,
} from '@/utils/food-therapy'
import { CONSTITUTION_TYPES, type ConstitutionType } from '@/utils/constitution-test'
import type { Product, UserHealthProfile } from '@/db/types'
import './index.scss'

// ---------------- 需求定义 ----------------
type SceneKey = 'allergy' | 'immunity' | 'children' | 'sugar' | 'pregnant' | 'sleep' | 'digestion' | 'elderly'

interface NeedDef {
  key: SceneKey
  label: string
  icon: string
  title: string
  subTitle: string
  /** 预置人群（须为 CROWD_OPTIONS 内合法值），驱动分类器三档 */
  crowds: Crowd[]
  /** 偏好食养功效（HEALTH_TAGS 内合法值），命中即视为契合本需求 */
  preferTags: string[]
  /** 额外提示（合规 / 引导） */
  note?: string
}

const toCrowd = (c: string): Crowd => c as Crowd

const NEED_MAP: Record<SceneKey, NeedDef> = {
  allergy: {
    key: 'allergy', label: '过敏体质', icon: '🛡️',
    title: '过敏体质 · 安心之选', subTitle: '避开你标注的过敏原，挑选更安心的好物',
    crowds: [], preferTags: [],
    note: '还没设置过敏原？去「家庭食养档案」补充，筛选更精准',
  },
  immunity: {
    key: 'immunity', label: '日常养护', icon: '💪',
    title: '日常养护 · 体质之选', subTitle: '为日常养护优选温润食养好物',
    crowds: [toCrowd('免疫力低')], preferTags: ['补气养血'],
  },
  children: {
    key: 'children', label: '成长轻养', icon: '👶',
    title: '成长轻养 · 营养之选', subTitle: '为成长发育挑选，注意核对配料表',
    crowds: [], preferTags: ['补气养血', '健脾养胃'],
    note: '成长阶段食养参考，请家长核对配料表与适龄性',
  },
  sugar: {
    key: 'sugar', label: '低糖轻食', icon: '🍬',
    title: '低糖轻食 · 轻负担之选', subTitle: '关注糖分摄入人群，以下为更友好选择',
    crowds: [toCrowd('高血糖')], preferTags: ['利水消肿'],
    note: '关注糖分摄入人群食养参考，具体请遵医嘱',
  },
  pregnant: {
    key: 'pregnant', label: '温润养护', icon: '🤰',
    title: '温润养护 · 温和之选', subTitle: '为孕期哺乳期优选温润食养好物',
    crowds: [], preferTags: ['补气养血', '滋阴润燥'],
    note: '孕期哺乳期食养参考，具体请遵医嘱',
  },
  sleep: {
    key: 'sleep', label: '轻盈舒眠', icon: '😴',
    title: '轻盈舒眠 · 舒心之选', subTitle: '为睡眠不佳人群优选舒缓食养好物',
    crowds: [toCrowd('失眠')], preferTags: ['舒缓安适'],
  },
  digestion: {
    key: 'digestion', label: '温和养护', icon: '🫗',
    title: '温和养护 · 温和之选', subTitle: '为肠胃虚弱人群优选温和食养好物',
    crowds: [toCrowd('肠胃虚弱')], preferTags: ['健脾养胃', '消食化积'],
  },
  elderly: {
    key: 'elderly', label: '长辈关怀', icon: '🧓',
    title: '长辈关怀 · 舒养之选', subTitle: '为长辈优选温和食养好物',
    crowds: [toCrowd('高血压'), toCrowd('高血脂')], preferTags: ['健脾养胃', '补气养血'],
    note: '长辈群体食养参考，长期用药请遵医嘱',
  },
}

const ALL_KEYS = Object.keys(NEED_MAP) as SceneKey[]

// ---------------- 体质解析（本地，支持 activeProfile 家庭成员） ----------------
function constitutionOf(p: UserHealthProfile | null): ConstitutionType | null {
  if (!p || !p.constitution_type) return null
  const ct = p.constitution_type
  if ((CONSTITUTION_TYPES as Record<string, ConstitutionType>)[ct]) return (CONSTITUTION_TYPES as Record<string, ConstitutionType>)[ct]
  const byName = Object.values(CONSTITUTION_TYPES).find((c) => c.name === ct)
  return byName ?? null
}

// ---------------- 需求匹配（纯函数） ----------------
interface MatchResult {
  tier: FitTier
  reasons: string[]
  matchScore: number
}

function matchNeed(p: Product, need: NeedDef, userAllergens: string[], constitution: ConstitutionType | null): MatchResult | null {
  const input: FoodTherapyInput = toFoodTherapyInput(p)
  const pa = (p as any).allergens as string[] | undefined

  // 1) 过敏原硬红线（最高优先级）
  if (userAllergens.length && pa && pa.length) {
    const common = pa.filter((a) => userAllergens.includes(a))
    if (common.length) {
      return { tier: 'avoid', reasons: [`含你标注的过敏原（${common.join('、')}），建议避开`], matchScore: 0 }
    }
  }

  // 过敏体质需求：无冲突即视为安心之选（其余需求不走此分支）
  if (need.key === 'allergy') {
    const reason = userAllergens.length
      ? '未见你标注的过敏原，可安心尝试'
      : '暂未设置过敏原，请核对配料表后食用'
    return { tier: 'recommend', reasons: [reason], matchScore: userAllergens.length ? 12 : 6 }
  }

  // 2) 人群分类器（商品打了 rec/cautious/forbidden_crowds 时权威分档）
  const c = classifyProduct(input, need.crowds, null)
  const reasons: string[] = []
  if (c === 'avoid') {
    return { tier: 'avoid', reasons: ['含本需求下需谨慎/不宜的成分或人群'], matchScore: 0 }
  }
  if (c === 'caution') reasons.push('对本需求人群偏谨慎，适量为宜')
  if (c === 'recommend') reasons.push('契合本需求人群，推荐尝试')

  // 3) 食养功效需求契合
  const tags = ((p.health_tag as string[]) || []).filter(Boolean)
  const hit = tags.filter((t) => need.preferTags.includes(t))
  if (hit.length) {
    reasons.push(`食养功效「${hit.join('、')}」契合本需求`)
  }

  // 4) 体质偏冲
  let constitutionCaution = false
  if (constitution && constitution.avoidNature?.includes((p.overall_nature as string) || '平性')) {
    constitutionCaution = true
    reasons.push(`性味甘平/与你的${constitution.name}偏冲，建议少点`)
  }

  // 最终分档
  let tier: FitTier | null
  if (c === 'recommend') tier = 'recommend'
  else if (c === 'caution' || constitutionCaution) tier = 'caution'
  else if (hit.length) tier = 'recommend'
  else tier = null

  if (tier === null) return null
  if (reasons.length === 0) reasons.push('综合你的画像，日常佐餐可选')

  const matchScore = hit.length * 10 + (c === 'recommend' ? 20 : 0) + (tier === 'recommend' ? 5 : 0)
  return { tier, reasons, matchScore }
}

// ---------------- 页面 ----------------
interface Grouped {
  recommend: { p: Product; m: MatchResult }[]
  caution: { p: Product; m: MatchResult }[]
  avoid: { p: Product; m: MatchResult }[]
}

export default function NeedFindPage() {
  const router = useRouter()
  const scene = (router.params.scene as SceneKey) || 'digestion'
  const need = NEED_MAP[ALL_KEYS.includes(scene) ? scene : 'digestion']

  const { user } = useAuth()
  const { currentStore } = useLocation()
  const { activeProfile, userAllergens, hasHealthProfile, familyMembers, selectedMemberId } = useFoodTherapy()

  const [loading, setLoading] = useState(true)
  const [grouped, setGrouped] = useState<Grouped>({ recommend: [], caution: [], avoid: [] })
  const [total, setTotal] = useState(0)

  const targetName = useMemo(() => {
    if (selectedMemberId === 'self') return '本人'
    return familyMembers.find((m) => m.id === selectedMemberId)?.name || '本人'
  }, [selectedMemberId, familyMembers])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      const list = await getProducts({ storeId: currentStore?.id, limit: 60, platformFilter: 'only' }).catch(() => [] as Product[])
      if (cancelled) return
      const con = constitutionOf(activeProfile)
      const matched = list
        .map((p) => {
          const m = matchNeed(p, need, userAllergens, con)
          return m ? { p, m } : null
        })
        .filter((x): x is { p: Product; m: MatchResult } => x !== null)
      const g: Grouped = { recommend: [], caution: [], avoid: [] }
      for (const item of matched) {
        if (item.m.tier === 'recommend') g.recommend.push(item)
        else if (item.m.tier === 'caution') g.caution.push(item)
        else g.avoid.push(item)
      }
      g.recommend.sort((a, b) => b.m.matchScore - a.m.matchScore)
      g.caution.sort((a, b) => b.m.matchScore - a.m.matchScore)
      g.avoid.sort((a, b) => b.m.matchScore - a.m.matchScore)
      if (!cancelled) {
        setGrouped(g)
        setTotal(matched.length)
        setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
    // activeProfile/userAllergens 变化时重算（画像加载完成后过敏原/体质生效）
  }, [currentStore?.id, activeProfile, userAllergens, need, scene])

  const handleAdd = (p: Product) => {
    if (!p.id) return
    addToCart(p.id, p.store_id, 1, null)
      .then(() => Taro.showToast({ title: '已加入购物车', icon: 'success' }))
      .catch(() => Taro.showToast({ title: '加购失败', icon: 'none' }))
  }

  const goProduct = (id?: string) => {
    if (!id) return
    Taro.navigateTo({ url: `/pages/product/index?id=${id}` })
  }

  const renderSection = (tier: FitTier, title: string, items: { p: Product; m: MatchResult }[]) => {
    if (!items.length) return null
    const tierClass = tier === 'recommend' ? 'nf-sec--rec' : tier === 'caution' ? 'nf-sec--cau' : 'nf-sec--avo'
    const badge = tier === 'recommend' ? '五星推荐' : tier === 'caution' ? '谨慎食用' : '不建议点'
    return (
      <View className={`nf-sec ${tierClass}`}>
        <View className="nf-sec-head">
          <Text className="nf-sec-title">{title}</Text>
          <Text className="nf-sec-badge">{badge} · {items.length}</Text>
        </View>
        {items.map(({ p, m }) => (
          <View key={p.id} className="nf-card" hoverClass="none" onClick={() => goProduct(p.id)}>
            <Image src={(p as any).image_url || ''} className="nf-card-img" mode="aspectFill" />
            <View className="nf-card-body">
              <Text className="nf-card-name" numberOfLines={2}>{p.name}</Text>
              <View className="nf-card-tags">
                {p.overall_nature ? <Text className="nf-chip nf-chip--nature">{p.overall_nature}</Text> : null}
                {((p.health_tag as string[]) || []).slice(0, 3).map((t, i) => (
                  <Text key={i} className="nf-chip">{t}</Text>
                ))}
              </View>
              <Text className="nf-card-reason" numberOfLines={2}>{m.reasons[0]}</Text>
              <View className="nf-card-bottom">
                <Text className="nf-price">¥{(p.price || 0).toFixed(2)}</Text>
                <View className="nf-add" hoverClass="none" onClick={(e: any) => { e.stopPropagation(); handleAdd(p) }}>
                  <Text className="nf-add-text">加购</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    )
  }

  const noResult = !loading && total === 0

  return (
    <View className="nf-page">
      {/* 头部 */}
      <View className="nf-header">
        <View className="nf-header-top">
          <Text className="nf-header-icon">{need.icon}</Text>
          <View className="nf-header-text">
            <Text className="nf-header-title">{need.title}</Text>
            <Text className="nf-header-sub">{need.subTitle}</Text>
          </View>
        </View>
        <View className="nf-header-meta">
          <Text className="nf-meta-item">🎯 为「{targetName}」筛选</Text>
          <Text className="nf-meta-item">🏪 {currentStore?.name || '门店'}</Text>
        </View>
        {need.note ? <Text className="nf-note">ⓘ {need.note}</Text> : null}
        {!hasHealthProfile ? (
          <Text className="nf-note nf-note--warn">完善「家庭食养档案」后，过敏原与体质红线会更精准 →</Text>
        ) : null}
      </View>

      {/* 结果 */}
      {loading ? (
        <View className="nf-loading"><Text className="nf-loading-text">正在按你的画像筛选好物…</Text></View>
      ) : noResult ? (
        <View className="nf-empty">
          <Text className="nf-empty-text">当前门店暂无匹配「{need.label}」的商品</Text>
          <Text className="nf-empty-sub">换个需求或切换门店再试试～</Text>
        </View>
      ) : (
        <View className="nf-list">
          {renderSection('recommend', '为你优选', grouped.recommend)}
          {renderSection('caution', '可以少量尝试', grouped.caution)}
          {renderSection('avoid', '暂时不建议', grouped.avoid)}
        </View>
      )}

      {/* 合规脚注 */}
      <View className="nf-footer">
        <Text className="nf-footer-text">
          以上为基于你食养画像的日常参考，不替代医嘱；具体饮食与健康状况请遵医嘱。
        </Text>
      </View>
    </View>
  )
}
