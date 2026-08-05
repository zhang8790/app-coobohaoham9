// 广告位：首页宣传图片 / 视频轮播区。
// 设计约束：仅展示图片 / 视频素材，不展示任何文字。
// 素材来源：运营在管理后台「首页广告」配置（home_ads 表）。
//   有活跃素材 → 渲染真实图片/视频轮播；为空 → 不渲染（不占空间）。
import { View, Image, Video } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { getActiveHomeAds, type HomeAd } from '@/db/home-ads'

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

  // 无真实广告数据 → 不渲染空色块占位（避免看起来像 UI 坏了）
  if (!ready || ads.length === 0) return null

  // 自动轮播：图片每 3.5s 切换；视频等待播完（onEnded）再进下一张
  useEffect(() => {
    if (ads.length <= 1) return
    const t = setInterval(() => {
      setIdx(i => {
        const cur = ads[i]
        const isVideo = cur?.media_type === 'video'
        if (isVideo) return i // 视频：等 onEnded 推进
        return (i + 1) % ads.length
      })
    }, 3500)
    return () => clearInterval(t)
  }, [ads])

  const ad = ads[idx]

  return (
    <View className="mx-4 mt-4">
      <View
        key={idx}
        className="rounded-2xl overflow-hidden relative"
        style={{ height: 180 }}
        onClick={() => ad && ad.media_url && handleAdTap(ad)}
      >
        {/* 图片素材 */}
        {ad?.media_type === 'image' && (
          <Image src={ad.media_url} mode="aspectFill" className="w-full h-full" />
        )}

        {/* 视频素材：海报 + 原生控件 */}
        {ad?.media_type === 'video' && (
          <Video
            src={ad.media_url}
            poster={ad.poster_url || ''}
            autoplay={false}
            loop={false}
            controls
            muted={false}
            className="w-full h-full"
            onEnded={() => setIdx(i => (i + 1) % ads.length)}
          />
        )}

        {/* 圆点指示器 */}
        {ads.length > 1 && (
          <View
            style={{
              position: 'absolute', right: 12, bottom: 12,
              display: 'flex', flexDirection: 'row', gap: 6,
            }}
          >
            {ads.map((_, i) => (
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
