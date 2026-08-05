// 广告位：首页纯图片 / 视频承载区。
// 设计约束（首页改版 2026-08-04）：仅展示图片 / 视频素材，不展示任何文字、不展示家庭档案。
// 素材由运营在后台配置（后续可接 home_ads 表按门店/城市下发），此处先用莫兰迪渐变卡演示版式与轮播交互。
import { View, Text } from '@tarojs/components'
import { useEffect, useState } from 'react'

type AdItem = { type: 'image' | 'video'; bg: string }

const ADS: AdItem[] = [
  { type: 'image', bg: 'linear-gradient(135deg,#BE7E5F,#B0655C)' },
  { type: 'video', bg: 'linear-gradient(135deg,#7FA697,#5F8A7C)' },
  { type: 'image', bg: 'linear-gradient(135deg,#C2A263,#A8884C)' },
]

export default function AdBanner() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (ADS.length <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % ADS.length), 3500)
    return () => clearInterval(t)
  }, [])

  const ad = ADS[idx]

  return (
    <View className="mx-4 mt-4">
      <View
        key={idx}
        className="rounded-2xl overflow-hidden relative ad-fade"
        style={{ height: 136, background: ad.bg }}
      >
        {/* 视频播放态：居中播放按钮（仅图标，无文字） */}
        {ad.type === 'video' && (
          <View
            style={{
              position: 'absolute', left: '50%', top: '50%',
              transform: 'translate(-50%,-50%)', width: 46, height: 46, borderRadius: 999,
              background: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: '#fff' }}>▶</Text>
          </View>
        )}

        {/* 圆点指示 */}
        <View
          style={{
            position: 'absolute', right: 12, bottom: 12,
            display: 'flex', flexDirection: 'row', gap: 5,
          }}
        >
          {ADS.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === idx ? 14 : 6, height: 6, borderRadius: 999,
                background: i === idx ? '#fff' : 'rgba(255,255,255,0.45)',
                transition: 'width 0.3s',
              }}
            />
          ))}
        </View>
      </View>
    </View>
  )
}
