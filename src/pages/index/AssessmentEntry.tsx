// @title 首页「食养评估」入口（身体感受 + 舌象对照 合并入口）
// 去 AI 落地的「标准化体质问卷 + 望舌对照」门面：点击主行进 /pages/food/tongue
// （合并评估：5 题身体感受 + 8 维舌象对照，本地算法双通道交叉校验，界面零 AI 字样）。
// 复用首页已算好的 retestDays 显示复测提示，零额外网络。
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { BRAND_LINE_ICONS } from '@/components/brandIcons'

interface Props {
  /** 最近一次体质测试距今天数；null = 游客态/无记录，不提示复测 */
  retestDays: number | null
}

export default function AssessmentEntry({ retestDays }: Props) {
  const goAssess = () => {
    Taro.navigateTo({ url: '/pages/food/tongue/index' }).catch(() => {})
  }

  const sub =
    retestDays == null
      ? '身体感受 + 舌象对照，一次测全 · 本地算法给出食养倾向'
      : `你 ${retestDays} 天前测过，来复测看看变化`

  const cta = retestDays == null ? '去测一测' : '去复测'

  return (
    <View
      className="mx-4 mt-3"
      style={{
        background:
          'linear-gradient(120deg, hsl(var(--primary-soft)) 0%, hsl(var(--primary-soft-deep)) 100%)',
        borderRadius: 16,
        padding: 16,
        boxShadow: '0 4px 14px rgba(94,122,79,0.10)',
      }}
    >
      {/* 主行：图标 + 文案 + CTA（点击进合并食养评估，全站唯一评估入口） */}
      <View
        hoverClass="none"
        onClick={goAssess}
        className="flex items-center active:opacity-80 transition-opacity"
        style={{ gap: 12 }}
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

        {/* 文案：主标题 + 动态副标（复测提示 / 合并说明） */}
        <View className="flex flex-col flex-1 min-w-0">
          <Text
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: 'hsl(var(--primary-strong))',
              letterSpacing: 0.5,
            }}
          >
            食养评估
          </Text>
          <Text
            style={{
              fontSize: 24,
              color: 'hsl(var(--foreground) / 0.72)',
              marginTop: 3,
              lineHeight: 1.4,
            }}
          >
            {sub}
          </Text>
        </View>

        {/* CTA 实底绿钮 */}
        <View
          style={{
            flexShrink: 0,
            background: 'hsl(var(--primary))',
            borderRadius: 20,
            padding: '8px 16px',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: 700 }}>{cta} →</Text>
        </View>
      </View>
    </View>
  )
}
