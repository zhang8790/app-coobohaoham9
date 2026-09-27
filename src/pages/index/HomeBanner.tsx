// @title 首页轮播广告位
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components'
import { getSiteConfig } from '@/db/api'

/**
 * 首页轮播位 = 全站唯一广告位（首页只留这一个曝光位，不另设占位块）。
 *
 * 数据源：site_configs.home_ad_slots（总后台「首页广告位」维护，热更新，无需发版）。
 * - 后台配置了启用中的广告 → 轮播这些广告（带「广告」合规标识，点击可跳内页/外链）。
 * - 后台未配置 / 全部停用 → 回退内置的品牌价值主张三张（食养主题，无促销、无社会证明、
 *   无「销量/好评/热销」类社会证明文案，符合「拒绝零食内卷」的价值主义红线）。
 *
 * 轮播高度/圆角/指示器与旧版视觉完全一致（首屏骨架不变，改的只是「谁来喂数据」）。
 */
interface AdSlide {
  id: string
  title: string
  sub?: string
  /** 广告图（后台在 Storage 上传后写回）；为空则渲染纯色/渐变底 + 文案 */
  image_url: string | null
  link_url: string
  sort_order: number
  enabled: boolean
  /** 纯文案卡片的底色渐变（仅内置兜底使用，后台广告一般不填） */
  bg?: string
  /** 品牌推荐卡标识：内置兜底卡显示「推荐」角标（真实广告仍显示「广告」合规标识） */
  recommend?: boolean
}

const FALLBACK_SLIDES: AdSlide[] = [
  {
    id: 'default-1',
    title: '药食同源食材｜一口安心轻食',
    sub: '选对原料，吃得明白',
    image_url: null,
    link_url: '',
    sort_order: 0,
    enabled: true,
    recommend: true,
    bg: 'linear-gradient(135deg,#E9EEDF 0%, #F6E9D8 100%)',
  },
  {
    id: 'default-2',
    title: '顺时而食 · 本草食养',
    sub: '按节气与体质，甄选放心零食',
    image_url: null,
    link_url: '',
    sort_order: 1,
    enabled: true,
    recommend: true,
    bg: 'linear-gradient(135deg,#E9EEDF 0%, #F1EBDC 100%)',
  },
  {
    id: 'default-3',
    title: '体质适配 · 九分法甄养',
    sub: '按你的体质，挑不踩雷的好物',
    image_url: null,
    link_url: '',
    sort_order: 2,
    enabled: true,
    recommend: true,
    bg: 'linear-gradient(135deg,#F6E9D8 0%, #E9EEDF 100%)',
  },
]

export default function HomeBanner() {
  // 先渲染内置兜底，配置回来后若有广告再替换：避免首屏出现「空白 Banner」闪一下
  const [slides, setSlides] = useState<AdSlide[]>(FALLBACK_SLIDES)
  const [isAd, setIsAd] = useState(false)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    let alive = true
    getSiteConfig<{ slots?: AdSlide[] }>('home_ad_slots')
      .then((v) => {
        if (!alive) return
        const list = (v?.slots || [])
          .filter((s) => s && s.enabled !== false && (s.title || s.image_url))
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        if (list.length) {
          setSlides(list)
          setIsAd(true)
          setIdx(0)
        }
      })
      .catch(() => { /* 读不到配置就继续用内置兜底，绝不留白 */ })
    return () => { alive = false }
  }, [])

  const handleTap = (s: AdSlide) => {
    const url = (s.link_url || '').trim()
    if (!url) return
    if (url.startsWith('/pages')) {
      Taro.navigateTo({ url }).catch(() => {})
      return
    }
    if (/^https?:\/\//i.test(url)) {
      Taro.navigateTo({ url: `/pages/ext/webview/index?url=${encodeURIComponent(url)}` }).catch(() => {})
      return
    }
    Taro.showToast({ title: '链接格式有误，请检查后台配置', icon: 'none' })
  }

  return (
    <View className="mx-4 mt-3 relative" style={{ height: 104 }}>
      <Swiper
        style={{ height: 104, borderRadius: 16, overflow: 'hidden' }}
        autoplay
        circular
        interval={4000}
        current={idx}
        onChange={(e: any) => setIdx(e.detail.current)}
      >
        {slides.map((s) => (
          <SwiperItem key={s.id}>
            <View
              hoverClass="none"
              onClick={() => handleTap(s)}
              style={{
                height: 104,
                padding: 18,
                position: 'relative',
                overflow: 'hidden',
                background: s.image_url ? 'hsl(var(--primary-soft))' : (s.bg || 'linear-gradient(120deg,#FBEDE7,#FFFCFA)'),
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              {s.image_url ? (
                <Image
                  src={s.image_url}
                  mode="aspectFill"
                  style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 104, zIndex: 0 }}
                />
              ) : null}
              {/* 图片广告压暗遮罩：保证白字在任何素材上都可读（纯文案卡不加） */}
              {s.image_url ? (
                <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.12) 70%)', zIndex: 1 }} />
              ) : null}
              <View style={{ position: 'relative', zIndex: 2, maxWidth: '78%' }}>
                <Text style={{ fontSize: '36rpx', fontWeight: 700, color: s.image_url ? '#fff' : '#2A2A2A' }}>{s.title}</Text>
                {s.sub ? (
                  <Text style={{ fontSize: '24rpx', color: s.image_url ? 'rgba(255,255,255,0.92)' : 'rgba(42,42,42,0.72)', marginTop: 6, lineHeight: '1.45' }}>{s.sub}</Text>
                ) : null}
              </View>
              {/* 广告合规标识：仅真实广告显示，内置品牌卡不标 */}
              {isAd ? (
                <View style={{ position: 'absolute', top: 8, right: 10, zIndex: 3, background: 'rgba(0,0,0,0.32)', borderRadius: 4, padding: '1px 6px' }}>
                  <Text style={{ color: '#fff', fontSize: '20rpx' }}>广告</Text>
                </View>
              ) : null}
              {/* 品牌推荐角标：内置兜底卡显示「推荐」（对齐截图 replica） */}
              {!isAd && s.recommend ? (
                <View style={{ position: 'absolute', top: 8, right: 10, zIndex: 3, background: 'hsl(var(--primary))', borderRadius: 14, padding: '3px 10px' }}>
                  <Text style={{ color: '#fff', fontSize: '20rpx', fontWeight: 700, letterSpacing: 1 }}>推荐</Text>
                </View>
              ) : null}
            </View>
          </SwiperItem>
        ))}
      </Swiper>

      {/* 右下角自定义指示器（与旧版一致：当前=长条，其余=圆点） */}
      {slides.length > 1 ? (
        <View style={{ position: 'absolute', right: 14, bottom: 12, display: 'flex', alignItems: 'center', gap: 5, zIndex: 3, pointerEvents: 'none' }}>
          {slides.map((s, i) => (
            i === idx
              ? <View key={s.id} style={{ width: 16, height: 4, borderRadius: 2, background: '#fff' }} />
              : <View key={s.id} style={{ width: 5, height: 5, borderRadius: 5, background: 'rgba(255,255,255,0.5)' }} />
          ))}
        </View>
      ) : null}
    </View>
  )
}
