// L1 品牌价值主张：首页第一屏建立「我们是谁、为何不同」的心智，
// 普通零食电商没有的差异化叙事。占位文案，真实战略表述由运营替换。
// 2026-08-04: 背景图支持管理后台配置（site_configs.home_brand_hero_bg.image_url）
import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { getSiteConfig } from '@/db/api'

const VALUES = [
  { icon: '👨‍👩‍👧', t: '家庭档案', d: '一人一档' },
]

const FALLBACK_BG = 'linear-gradient(135deg, hsl(152 24% 38%) 0%, hsl(19 57% 42%) 100%)'

export default function BrandHero() {
  const [bgImage, setBgImage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    getSiteConfig<{ image_url?: string | null }>('home_brand_hero_bg').then((cfg) => {
      if (!mounted) return
      const url = cfg?.image_url
      if (typeof url === 'string' && url.trim()) {
        setBgImage(url.trim())
      }
    })
    return () => { mounted = false }
  }, [])

  const containerStyle: React.CSSProperties = {
    color: '#fff',
    background: bgImage ? `${FALLBACK_BG}` : FALLBACK_BG,
    position: 'relative',
    overflow: 'hidden',
  }

  // 有配置图时叠加在渐变之上（保留文字可读性），无图时纯渐变
  return (
    <View
      className="mx-4 mt-4 rounded-2xl p-4 relative overflow-hidden"
      style={containerStyle}
    >
      {bgImage && (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.55,
            zIndex: 0,
          }}
        />
      )}
      {/* 暗角遮罩，确保任何底图下文字都清晰 */}
      <View
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.35) 100%)',
          zIndex: bgImage ? 1 : 0,
          pointerEvents: 'none',
        }}
      />

      {/* 古金柔光晕，呼应 L0 Hero 的国潮装饰语言 */}
      <View style={{ position: 'absolute', right: -28, top: -28, width: 120, height: 120, borderRadius: '50%', background: 'rgba(232,198,107,0.18)', zIndex: 1 }} />

      <View style={{ position: 'relative', zIndex: 2 }}>
        <Text className="text-xs block" style={{ letterSpacing: 2, opacity: 0.9, fontWeight: 600 }}>顺时而食 · 智慧食养零售</Text>
        <View className="mt-1.5">
          <Text className="text-2xl font-extrabold leading-tight block">不只是零食</Text>
          <Text className="text-2xl font-extrabold leading-tight block">是懂你身体的好物</Text>
        </View>
        <Text className="text-xs block mt-2" style={{ opacity: 0.9, lineHeight: 1.6 }}>
          为每个家庭建立专属健康食养档案，把"吃什么对身体好"变成可执行的日常选择。
        </Text>
        <View className="flex gap-2 mt-4">
          {VALUES.map((v) => (
            <View
              key={v.t}
              className="flex-1 rounded-xl p-2.5"
              style={{ background: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backdropFilter: 'blur(4px)' }}
            >
              <Text className="text-base block">{v.icon}</Text>
              <Text className="text-xs font-bold block mt-1">{v.t}</Text>
              <Text className="text-[10px] block mt-0.5" style={{ opacity: 0.9 }}>{v.d}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
