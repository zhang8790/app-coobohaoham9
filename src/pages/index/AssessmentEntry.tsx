// @title 首页「3分钟食养评估」入口
// 去 AI 落地的「标准化体质问卷」门面：点击进 /pages/food/constitution-test（5 题规则问卷）。
// 复用首页已算好的 retestDays 显示复测提示，零额外网络。
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { BRAND_LINE_ICONS } from '@/components/brandIcons'

interface Props {
  /** 最近一次体质测试距今天数；null = 游客态/无记录，不提示复测 */
  retestDays: number | null
}

export default function AssessmentEntry({ retestDays }: Props) {
  const go = () => {
    Taro.navigateTo({ url: '/pages/food/constitution-test/index' }).catch(() => {})
  }

  const sub =
    retestDays == null
      ? '测体质 · 挑对适合你的食养好物'
      : `你 ${retestDays} 天前测过，来复测看看变化`

  const cta = retestDays == null ? '去测一测' : '去复测'

  return (
    <View
      hoverClass="none"
      onClick={go}
      className="mx-4 mt-3 flex items-center active:opacity-80 transition-opacity"
      style={{
        background:
          'linear-gradient(120deg, hsl(var(--primary-soft)) 0%, hsl(var(--primary-soft-deep)) 100%)',
        borderRadius: 16,
        padding: '16px',
        gap: 12,
        boxShadow: '0 4px 14px rgba(94,122,79,0.10)',
      }}
    >
      {/* 图标圆底（草本绿 leaf 图标，呼应食养主题） */}
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          flexShrink: 0,
          background: 'hsl(var(--card))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image src={BRAND_LINE_ICONS['leaf']} style={{ width: 26, height: 26 }} />
      </View>

      {/* 文案：主标题 + 动态副标（复测提示） */}
      <View className="flex flex-col flex-1 min-w-0">
        <Text
          style={{
            fontSize: '32rpx',
            fontWeight: 700,
            color: 'hsl(var(--primary-strong))',
            letterSpacing: 0.5,
          }}
        >
          3 分钟食养评估
        </Text>
        <Text
          style={{
            fontSize: '24rpx',
            color: 'hsl(var(--foreground) / 0.72)',
            marginTop: 3,
            lineHeight: '1.4',
          }}
        >
          {sub}
        </Text>
      </View>

      {/* CTA 描边→实底绿钮 */}
      <View
        style={{
          flexShrink: 0,
          background: 'hsl(var(--primary))',
          borderRadius: 20,
          padding: '8px 16px',
        }}
      >
        <Text style={{ color: '#fff', fontSize: '26rpx', fontWeight: 700 }}>{cta} →</Text>
      </View>
    </View>
  )
}
