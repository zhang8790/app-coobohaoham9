import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import { View, Text, Image, Button } from '@tarojs/components'
import { useState, useEffect } from 'react'
import { getProductById, getMyProfile, grantEmotionClaim } from '@/db/api'
import type { Product } from '@/db/types'
import { MOOD_TAGS } from '@/utils/mood-tags'
import './index.scss'

// 30 个标准情绪标签（6 类 × 5），作为确权多选候选
const EMOTION_CANDIDATES = Object.values(MOOD_TAGS).flat()

export default function EmotionClaimPage() {
  const router = useRouter()
  const { orderNo = '', productId = '', storeId = '' } = router.params

  const [product, setProduct] = useState<Product | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [loadError, setLoadError] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [reward, setReward] = useState(0)
  const [badge, setBadge] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [p, prof] = await Promise.all([
          getProductById(productId),
          getMyProfile().catch(() => null),
        ])
        setProduct(p)
        if (prof) setInviteCode((prof as any).invite_code || '')
      } catch (e) {
        console.warn('[emotion-claim] 加载失败', e)
        setLoadError(true)
      }
    })()
  }, [productId])

  // 分享确权卡 → 带邀请码锁客（复用首页进店锁客链路）
  useShareAppMessage(() => ({
    title: `我在来电有喜给「${product?.name || '好物'}」做了情绪确权 🎭`,
    path: `/pages/index/index?inviterCode=${inviteCode || ''}`,
    imageUrl: product?.main_image,
  }))

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
    Taro.reLaunch({ url: '/pages/order-center/index?tab=pending_receive' })
  }

  const handleConfirm = async () => {
    if (selected.length < 1) {
      Taro.showToast({ title: '至少选 1 个情绪', icon: 'none' })
      return
    }
    if (!product) return
    const tongbao = 10 + selected.length * 3
    const badgeText = `${selected[0]}·${product.name}`
    setSubmitting(true)
    const res = await grantEmotionClaim({
      orderNo,
      productId,
      storeId,
      selectedEmotion: selected,
      badgeText,
      tongbao,
    })
    setSubmitting(false)
    if (res.ok) {
      setClaimed(true)
      setReward(res.tongbao || tongbao)
      setBadge(badgeText)
    } else {
      Taro.showToast({ title: '确权失败，稍后再试', icon: 'none' })
    }
  }

  // 加载失败兜底：直接进订单中心，不阻断支付主流程
  if (loadError) {
    return (
      <View className="emo-claim-page emo-fallback">
        <Text className="emo-fallback-text">订单已支付成功</Text>
        <Button className="emo-order-btn" onClick={goOrder}>查看我的订单</Button>
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
          <Text className="emo-section-title">选出此刻最贴近你的情绪（1–6 个）</Text>
          <View className="emo-tags">
            {EMOTION_CANDIDATES.map((t) => {
              const on = selected.includes(t.zh)
              return (
                <View
                  key={t.zh}
                  className={`emo-tag ${on ? 'emo-tag-on' : ''}`}
                  style={{ borderColor: on ? t.color : 'transparent' }}
                  onClick={() => toggle(t.zh)}
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
              className={`emo-confirm-btn ${selected.length ? '' : 'emo-confirm-disabled'}`}
              disabled={!selected.length || submitting}
              onClick={handleConfirm}
            >
              {submitting ? '确权中…' : `确认确权 · 得 ${10 + selected.length * 3} 通宝`}
            </Button>
          </View>
        </View>
      ) : (
        <View className="emo-body">
          {/* 专属确权卡 */}
          <View className="emo-card">
            <View className="emo-card-badge">
              <Text className="emo-card-badge-icon">🎖</Text>
              <Text className="emo-card-badge-text">{badge}</Text>
            </View>
            <Text className="emo-card-sub">情绪确权完成</Text>
            <View className="emo-card-tags">
              {selected.map((s) => (
                <View key={s} className="emo-card-tag"><Text>{s}</Text></View>
              ))}
            </View>
            {product?.main_image && (
              <Image src={product.main_image} className="emo-card-img" mode="aspectFill" />
            )}
            <Text className="emo-card-name">{product?.name}</Text>
            <Text className="emo-card-reward">获得 {reward} 通宝 💎</Text>
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
