import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import { View, Text, Image, Button } from '@tarojs/components'
import { useState, useEffect, useRef } from 'react'
import {
  getProductById, getMyProfile, grantEmotionClaim, getOrderForClaim,
  getEquitySummary, EMOTION_TB_PER_CLAIM} from '@/db/api'
import type { EquitySummary } from '@/db/api'
import type { Product } from '@/db/types'
import { getAllMoodTags } from '@/utils/mood-tags'
import './index.scss'

// 30 个标准情绪标签（6 类 × 5），作为确权多选候选
const EMOTION_CANDIDATES = getAllMoodTags()

/**
 * 从商品数据中自动提取并匹配情绪标签。
 * 匹配优先级：mood_tags(精确) > scene_tags(精确) > emotion_title(模糊) > 默认首条
 */
function autoSelectEmotions(product: Product | null): string[] {
  const selected: string[] = []
  const seen = new Set<string>()

  // 1) 精确匹配 product.mood_tags（商家编译过的情绪标签）
  const moodTags = (product as any)?.mood_tags || (product as any)?.product_emotion?.mood_tags || []
  if (Array.isArray(moodTags)) {
    for (const tag of moodTags) {
      // tag 可能是 zh 字符串或 MoodTag 对象
      const zh = typeof tag === 'string' ? tag : (tag?.zh || '')
      if (!zh) continue
      // 精确命中候选库
      if (EMOTION_CANDIDATES.some(c => c.zh === zh) && !seen.has(zh)) {
        selected.push(zh)
        seen.add(zh)
      }
    }
  }

  // 2) 精确匹配 product.scene_tags（场景标签也映射到情绪）
  const sceneTags = (product as any)?.scene_tags || (product as any)?.product_emotion?.scene_tags || []
  if (Array.isArray(sceneTags)) {
    for (const tag of sceneTags) {
      const zh = typeof tag === 'string' ? tag : (tag?.zh || '')
      if (!zh) continue
      // 场景标签也查情绪候选库（如"约会→浪漫"、"夏日→清爽"）
      if (EMOTION_CANDIDATES.some(c => c.zh === zh) && !seen.has(zh)) {
        selected.push(zh)
        seen.add(zh)
      }
    }
  }

  // 3) 模糊匹配 product_emotion.emotion_title（情绪标题包含的情绪词）
  const title = (product as any)?.product_emotion?.emotion_title || ''
  if (title && selected.length < 3) {
    for (const cand of EMOTION_CANDIDATES) {
      if (title.includes(cand.zh) && !seen.has(cand.zh)) {
        selected.push(cand.zh)
        seen.add(cand.zh)
        if (selected.length >= 3) break
      }
    }
  }

  // 4) 兜底：至少保证有 1 个
  if (selected.length === 0 && EMOTION_CANDIDATES.length > 0) {
    selected.push(EMOTION_CANDIDATES[0].zh)
  }

  return selected.slice(0, 6) // 上限 6 个
}

export default function EmotionClaimPage() {
  const router = useRouter()
  const { orderNo = '', productId = '', storeId = '', productName = '' } = router.params

  const [product, setProduct] = useState<Product | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [loadError, setLoadError] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [tb, setTb] = useState(0)
  const [cv, setCv] = useState(0)
  const [badgeName, setBadgeName] = useState('')
  const [badgeIcon, setBadgeIcon] = useState('')
  const [equity, setEquity] = useState<EquitySummary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [orderUsed, setOrderUsed] = useState<boolean | null>(null)
  const [autoConfirming, setAutoConfirming] = useState(false)   // 自动确权进行中
  const autoTriggered = useRef(false)                            // 防止重复自动触发
  const selectedRef = useRef<string[]>([])                       // 最新 selected 镜像，避免闭包过期
  useEffect(() => { selectedRef.current = selected }, [selected])

  useEffect(() => {
    ;(async () => {
      try {
        const [p, prof, ord, eq] = await Promise.all([
          productId ? getProductById(productId).catch(() => null) : Promise.resolve(null),
          getMyProfile().catch(() => null),
          orderNo ? getOrderForClaim(orderNo).catch(() => null) : Promise.resolve(null),
          getEquitySummary().catch(() => null),
        ])
        // product 降级：API 失败或 productId 为空时，用 URL 参数构造最小对象
        let finalProduct = p
        if (!finalProduct && productName) {
          finalProduct = { id: productId || '', name: decodeURIComponent(productName), main_image: null } as any
        }
        setProduct(finalProduct || null)
        if (prof) setInviteCode((prof as any).invite_code || '')
        setOrderUsed(ord ? !!ord.verified_at : null)
        if (eq) setEquity(eq)
        // 自动按商品标签匹配情绪（mood_tags > scene_tags > emotion_title > 兜底）
        const autoSelected = autoSelectEmotions(finalProduct)
        setSelected(autoSelected)
        // 仅当「本人订单且已核销」才自动确权；未核销或查询失败都不自动确权（防盗刷 + 防误发）
        if (!ord || !ord.verified_at) {
          setAutoConfirming(false)
          return
        }
        // 自动确权：匹配完成即立即提交，不再人为延迟 800ms（消除感知卡顿的反人类流程）
        if (!autoTriggered.current && autoSelected.length > 0) {
          autoTriggered.current = true
          setAutoConfirming(true)
          submitClaim(autoSelected, finalProduct?.name, eq)
        }
      } catch (e) {
        console.warn('[emotion-claim] 加载失败', e)
        setLoadError(true)
      }
    })()
  }, [productId, orderNo])

  // 分享确权卡 → 带邀请码归属（复用首页进店归属链路）
  useShareAppMessage(() => ({
    title: `我在来电有喜给「${product?.name || '好物'}」做了情绪确权 🎭`,
    path: `/pages/index/index?inviterCode=${inviteCode || ''}`,
    imageUrl: product?.main_image ?? undefined}))

  const toggle = (zh: string) => {
    setSelected((prev) => {
      if (prev.includes(zh)) return prev.filter((x) => x !== zh)
      if (prev.length >= 6) {
        Taro.showToast({ title: '最多选 6 个', icon: 'none' })
        return prev
      }
      return [...prev, zh]
    })
  }

  const goOrder = () => {
    // reLaunch 清空栈，避免支付页残留在栈底
    Taro.reLaunch({ url: '/pages/order-center/index?tab=pending_review' })
  }

  const fmtPct = (r: number) => {
    const s = (r * 100).toFixed(4)
    return parseFloat(s).toString() + '%'
  }
  const fmtNum = (n: number) => (n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })

  async function submitClaim(emotions: string[], productNameOverride?: string, equityOverride?: EquitySummary) {
    if (emotions.length < 1) {
      Taro.showToast({ title: '至少选 1 个情绪', icon: 'none' })
      return
    }
    // product 加载失败时用降级文案，不再静默退出
    const fallbackName = productNameOverride || product?.name || '好物'
    if (!product && !productNameOverride) {
      console.warn('[emotion-claim] product 为空，使用降级模式确权')
    }
    // orderUsed 为 null 时放行（可能是网络抖动导致查询失败），由后端 verified_at 校验兜底
    if (orderUsed === false) {
      Taro.showToast({ title: '请先在使用商品后再确权', icon: 'none' })
      return
    }
    const badgeText = `${emotions[0]}·${fallbackName}`
    setSubmitting(true)
    setAutoConfirming(false)
    const equityIn = equityOverride || equity || undefined
    const res = await grantEmotionClaim({
      orderNo,
      productId,
      storeId,
      selectedEmotion: emotions,
      badgeText,
      equity: equityIn, // 透传页面已加载的权益概览，避免确权时再跑一次全平台聚合
    })
    setSubmitting(false)
    if (res.ok) {
      setClaimed(true)
      setSkipped(!!res.skipped)
      setTb(res.skipped ? 0 : (res.tb || 0))
      setCv(res.skipped ? 0 : (res.cv || 0))
      setBadgeName(res.badgeName || '情绪徽章')
      setBadgeIcon(res.badgeIcon || '🎭')
      // 确权卡立即展示最新成长值（本地累加，省去一次全平台聚合查询）
      if (equityIn && !res.skipped) {
        setEquity({ ...equityIn, myCv: Math.round((equityIn.myCv + (res.cv || 0)) * 100) / 100 })
      } else if (res.equity) {
        setEquity(res.equity)
      }
    } else {
      Taro.showToast({ title: '确权失败，稍后再试', icon: 'none' })
    }
  }

  const handleConfirm = () => submitClaim(selectedRef.current)

  // 加载失败兜底：直接进订单中心，不阻断支付主流程
  if (loadError) {
    return (
      <View className="emo-claim-page emo-fallback">
        <Text className="emo-fallback-text">订单已支付成功</Text>
        <Button className="emo-order-btn" onClick={goOrder}>查看我的订单</Button>
      </View>
    )
  }

  // 确权闸门：未使用商品不可确权
  if (orderUsed === false) {
    return (
      <View className="emo-claim-page emo-fallback">
        <Text className="emo-fallback-text">请先使用商品后再确权</Text>
        <Text className="emo-fallback-sub">确权是对「已使用好物」的情绪确认，标记使用后即可确权</Text>
        <Button className="emo-order-btn" onClick={goOrder}>去订单中心标记使用</Button>
      </View>
    )
  }

  return (
    <View className="emo-claim-page">
      {/* 氛围头：商品情绪翻译 */}
      <View className="emo-hero">
        {product?.main_image && (
          <Image src={product.main_image} className="emo-hero-img" mode="aspectFill" />
        )}
        <View className="emo-hero-mask" />
        <View className="emo-hero-content">
          <Text className="emo-hero-label">这次消费，情绪被接住了吗</Text>
          <Text className="emo-hero-title">
            {product?.product_emotion?.emotion_title || `「${product?.name || '这件好物'}」给你的片刻`}
          </Text>
        </View>
      </View>

      {!claimed ? (
        <View className="emo-body">
          {/* 我的会员贡献概览（轻量，确权前即可见） */}
          {equity && (
            <View className="emo-equity-mini">
              <Text className="emo-equity-mini-label">我的会员贡献值</Text>
              <Text className="emo-equity-mini-val">{fmtNum(equity.myCv)}</Text>
              <Text className="emo-equity-mini-sub">
                全平台成长占比 {fmtPct(equity.shareRatio)} · 年度成长回馈约 {fmtNum(equity.dividendEstimate)} 金豆
              </Text>
            </View>
          )}
          <Text className="emo-section-title">
            {autoConfirming
              ? `正在按「${product?.name || '商品'}」的标签匹配情绪…`
              : `已为你匹配 ${selected.length} 个情绪（基于商品标签自动选取）`}
          </Text>
          <View className="emo-tags">
            {EMOTION_CANDIDATES.map((t) => {
              const on = selected.includes(t.zh)
              // 自动确权模式下只展示已匹配项；完整列表在 autoConfirming=false 时仍可看
              return (
                <View
                  key={t.zh}
                  className={`emo-tag ${on ? 'emo-tag-on' : ''} ${autoConfirming ? 'emo-tag-auto' : ''}`}
                  style={{ borderColor: on ? t.color : 'transparent', opacity: on ? 1 : autoConfirming ? 0.3 : 0.5 }}
                >
                  <Text className="emo-tag-icon">{t.icon}</Text>
                  <Text className="emo-tag-text" style={{ color: on ? t.color : undefined }}>{t.zh}</Text>
                </View>
              )
            })}
          </View>

          <View className="emo-footer">
            <Button className="emo-skip-btn" onClick={goOrder}>稍后确权</Button>
            <Button
              className={`emo-confirm-btn ${selected.length ? '' : 'emo-confirm-disabled'} ${autoConfirming ? 'emo-confirm-auto' : ''}`}
              disabled={!selected.length || submitting || autoConfirming}
              onClick={handleConfirm}
            >
              {submitting || autoConfirming
                ? `${autoConfirming ? '自动' : ''}确权中…`
                : `确认确权 · 得 ${EMOTION_TB_PER_CLAIM} 金豆`
              }
            </Button>
          </View>
        </View>
      ) : (
        <View className="emo-body">
          {/* 专属确权卡（会员权益版） */}
          <View className="emo-card emo-card--v2">
            <View className="emo-card-head">
              <Text className="emo-card-title">情绪确权完成</Text>
            </View>

            <View className="emo-card-badge">
              <Text className="emo-card-badge-icon">{badgeIcon}</Text>
              <View className="emo-card-badge-text">
                <Text className="emo-card-badge-name">「{badgeName}」徽章</Text>
                <Text className="emo-card-badge-tb">+ {tb} 金豆</Text>
              </View>
            </View>

            <View className="emo-card-divider" />

            {skipped ? (
              <View className="emo-card-line">
                <Text className="emo-card-line-text">本单净收益较低，仅授予情绪徽章（不产生成长负债）</Text>
              </View>
            ) : (
              <>
                <View className="emo-card-line">
                  <Text className="emo-card-line-icon">📈</Text>
                  <Text className="emo-card-line-text">你的会员贡献值 <Text className="emo-card-line-hl">+{cv}</Text></Text>
                </View>
                <View className="emo-card-line">
                  <Text className="emo-card-line-text">当前总贡献值：<Text className="emo-card-line-hl">{fmtNum(equity?.myCv || 0)}</Text></Text>
                </View>
                <View className="emo-card-line">
                  <Text className="emo-card-line-text">全平台成长占比：<Text className="emo-card-line-hl">{fmtPct(equity?.shareRatio || 0)}</Text></Text>
                </View>
                <View className="emo-card-line">
                  <Text className="emo-card-line-text">年度成长回馈：约 <Text className="emo-card-line-hl">{fmtNum(equity?.dividendEstimate || 0)} 金豆</Text></Text>
                </View>
                <View className="emo-card-line">
                  <Text className="emo-card-line-text">平台本月新增用户：<Text className="emo-card-line-hl">{fmtNum(equity?.newUsersThisMonth || 0)} 人</Text></Text>
                </View>

                <View className="emo-card-grow">你的成长值又提升了 ✨</View>
              </>
            )}
          </View>

          <View className="emo-footer">
            <Button className="emo-share-btn" openType="share">分享我的确权卡</Button>
            <Button className="emo-order-btn" onClick={goOrder}>查看我的订单</Button>
          </View>
        </View>
      )}
    </View>
  )
}
