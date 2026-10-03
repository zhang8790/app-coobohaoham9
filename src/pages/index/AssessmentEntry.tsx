// @title 首页「食养评估」入口（身体感受 + 舌象对照 合并入口）
// 去 AI 落地的「标准化体质问卷 + 望舌对照」门面：点击整卡进 /pages/food/tongue
// （合并评估：5 题身体感受 + 8 维舌象对照，本地算法双通道交叉校验，界面零 AI 字样）。
// 复测状态只由 CTA 文案承载（去测一测 / 去复测），卡内不再放说明长句，保持一眼可读。
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

  // 状态由 CTA 承载：未测 → 去测一测；测过 → 去复测
  const cta = retestDays == null ? '去测一测' : '去复测'

  return (
    <View
      className="mx-4 mt-3 flex items-center justify-between active:opacity-90 transition-opacity"
      aria-role="button"
      aria-label="食养评估"
      hoverClass="none"
      onClick={goAssess}
      style={{
        background:
          'linear-gradient(120deg, hsl(var(--primary-soft)) 0%, hsl(var(--primary-soft-deep)) 100%)',
        borderRadius: '28rpx',
        padding: '26rpx 28rpx',
        boxShadow: '0 4rpx 14rpx rgba(94,122,79,0.10)',
      }}
    >
      {/* 左：图标圆底 + 标题（草本绿 leaf 图标，呼应食养主题） */}
      <View className="flex items-center" style={{ gap: '20rpx', minWidth: 0 }}>
        <View
          style={{
            width: '72rpx',
            height: '72rpx',
            borderRadius: '20rpx',
            flexShrink: 0,
            background: 'hsl(var(--card))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image src={BRAND_LINE_ICONS['leaf']} style={{ width: '40rpx', height: '40rpx' }} />
        </View>
        <Text
          style={{
            fontSize: '34rpx',
            fontWeight: 700,
            color: 'hsl(var(--primary-strong))',
            letterSpacing: '0.5rpx',
          }}
        >
          食养评估
        </Text>
      </View>

      {/* 右：CTA 实底绿钮 */}
      <View
        style={{
          flexShrink: 0,
          background: 'hsl(var(--primary))',
          borderRadius: '999rpx',
          padding: '12rpx 28rpx',
        }}
      >
        <Text style={{ color: '#fff', fontSize: '26rpx', fontWeight: 700 }}>{cta} →</Text>
      </View>
    </View>
  )
}
