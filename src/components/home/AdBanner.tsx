// 广告位：首页宣传图片 / 视频轮播区（位于搜索栏下方）。
// 素材来源：运营在管理后台「首页广告」配置（home_ads 表）。
//   有活跃素材 → 渲染真实图片/视频轮播；为空 → 回退莫兰迪渐变演示卡（带标签，非裸色块）。
import { View, Text, Image, Video } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { getActiveHomeAds, type HomeAd } from '@/db/home-ads'

// 演示回退（home_ads 表为空时）：莫兰迪渐变卡 + 素材名标签，明确是「待配置广告位」。
type DemoAd = { type: 'image' | 'video'; label: string; bg: string }
const DEMO_ADS: DemoAd[] = [
  { type: 'image', label: '品牌主视觉', bg: 'linear-gradient(135deg,#BE7E5F,#B0655C)' },
  { type: 'video', label: '新品短片', bg: 'linear-gradient(135deg,#7FA697,#5F8A7C)' },
  { type: 'image', label: '节气食盒', bg: 'linear-gradient(135deg,#C2A263,#A8884C)' },
]

// 跳转链接：仅图片类型可点（视频用原生控件播放）。内部路由以 / 开头。
function handleAdTap(ad: HomeAd) {
  if (ad.media_type !== 'image' || !ad.link_url) return
  const url = ad.link_url.trim()
  if (!url) return
  if (url.startsWith('/')) {
    Taro.navigateTo({ url }).catch(() => {})
  } else {
    Taro.navigateTo({ url: `/pages/webview/index?src=${encodeURIComponent(url)}` }).catch(() => {})
  }
}

export default function AdBanner() {
  const [ads, setAds] = useState<HomeAd[]>([])
  const [idx, setIdx] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    getActiveHomeAds()
      .then(list => { if (alive) { setAds(list); setReady(true) } })
      .catch(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [])

  // 自动轮播：图片每 3.5s 切换；视频等待播完（onEnded）再进下一张。
  const list = ads.length > 0 ? ads : DEMO_ADS
  useEffect(() => {
    if (list.length <= 1) return
    const t = setInterval(() => {
      setIdx(i => {
        const cur = list[i] as any
        const isVideo = cur?.media_type === 'video'
        if (isVideo) return i // 视频：等 onEnded 推进
        return (i + 1) % list.length
      })
    }, 3500)
    return () => clearInterval(t)
  }, [ads, ready])

  const ad = list[idx] as (HomeAd & DemoAd) | undefined
  const isDemo = ads.length === 0

  return (
    <View className="mx-4 mt-4">
      {/* 区块标题：仅在演示态显示，提示这是待配置广告位 */}
      {isDemo && (
        <View className="flex items-center gap-1.5 mb-2">
          <View className="section-accent" />
          <Text className="text-base font-bold text-foreground">广告位</Text>
          <Text className="text-[10px] text-muted-foreground">图片 / 视频</Text>
        </View>
      )}

      <View
        key={idx}
        className="rounded-2xl overflow-hidden relative ad-fade"
        style={{ height: 180 }}
        onClick={() => ad && (ad as HomeAd).media_url && handleAdTap(ad as HomeAd)}
      >
        {/* 真实图片素材 */}
        {ads.length > 0 && ad?.media_type === 'image' && (
          <Image src={ad.media_url} mode="aspectFill" className="w-full h-full" />
        )}

        {/* 真实视频素材：海报 + 原生控件，不自动播放，播完进下一张 */}
        {ads.length > 0 && ad?.media_type === 'video' && (
          <Video
            src={ad.media_url}
            poster={ad.poster_url || ''}
            autoplay={false}
            loop={false}
            controls
            muted={false}
            className="w-full h-full"
            onEnded={() => setIdx(i => (i + 1) % list.length)}
          />
        )}

        {/* 演示回退：渐变背景 + 素材名标签 + 类型角标 + 视频播放键 */}
        {isDemo && (
          <View style={{ width: '100%', height: '100%', background: (ad as DemoAd)?.bg }}>
            {/* 类型角标 */}
            <View
              style={{
                position: 'absolute', left: 12, top: 12,
                background: 'rgba(0,0,0,0.32)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: 'bold' }}>
                {(ad as DemoAd)?.type === 'video' ? '视频' : '图片'}
              </Text>
            </View>
            {/* 视频播放键 */}
            {(ad as DemoAd)?.type === 'video' && (
              <View
                style={{
                  position: 'absolute', left: '50%', top: '50%',
                  transform: 'translate(-50%,-50%)', width: 52, height: 52, borderRadius: 999,
                  background: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22, color: '#fff' }}>▶</Text>
              </View>
            )}
            {/* 素材名标签 */}
            <Text
              style={{ position: 'absolute', left: 12, bottom: 12, color: '#fff', fontSize: 14, fontWeight: 'bold' }}
            >
              {(ad as DemoAd)?.label}
            </Text>
          </View>
        )}

        {/* 圆点指示器 */}
        {list.length > 1 && (
          <View
            style={{
              position: 'absolute', right: 12, bottom: 12,
              display: 'flex', flexDirection: 'row', gap: 6,
            }}
          >
            {list.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === idx ? 16 : 6, height: 6, borderRadius: 999,
                  background: i === idx ? '#fff' : 'rgba(255,255,255,0.45)',
                  transition: 'width 0.3s',
                }}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
