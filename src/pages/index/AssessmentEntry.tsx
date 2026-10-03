// @title 首页「3分钟食养评估」入口（合并舌象自检）
// 去 AI 落地的「标准化体质问卷」门面：点击主行进 /pages/food/constitution-test（5 题规则问卷，落库入口）；
// 卡内并置舌象自检次级入口（👁 拍张舌头 · 智能识别倾向），点进 /pages/food/tongue（双轨：弱网/失败规则引擎兜底，界面零 AI 字样）。
// 主行与次级入口为兄弟节点，各自独立绑定 onClick，互不嵌套，避免冒泡误触。
// 复用首页已算好的 retestDays 显示复测提示，零额外网络。
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { BRAND_LINE_ICONS } from '@/components/brandIcons'

interface Props {
  /** 最近一次体质测试距今天数；null = 游客态/无记录，不提示复测 */
  retestDays: number | null
}

export default function AssessmentEntry({ retestDays }: Props) {
  const goQuestionnaire = () => {
    Taro.navigateTo({ url: '/pages/food/constitution-test/index' }).catch(() => {})
  }

  const goTongue = () => {
    Taro.navigateTo({ url: '/pages/food/tongue/index' }).catch(() => {})
  }

  const sub =
    retestDays == null
      ? '测体质 · 挑对适合你的食养好物'
      : `你 ${retestDays} 天前测过，来复测看看变化`

  const cta = retestDays == null ? '去测一测' : '去复测'

  return (
    <View
      className="mx-4 mt-3"
      style={{
        background:
          'linear-gradient(120deg, hsl(var(--primary-soft)) 0%, hsl(var(--primary-soft-deep)) 100%)',
        borderRadius: 16,
        padding: '16px',
        boxShadow: '0 4px 14px rgba(94,122,79,0.10)',
      }}
    >
      {/* 主行：图标 + 文案 + CTA（点击进标准化体质问卷，全站唯一落库入口） */}
      <View
        hoverClass="none"
        onClick={goQuestionnaire}
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

        {/* CTA 实底绿钮 */}
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

      {/* 分隔线 */}
      <View
        style={{
          height: 1,
          background: 'hsl(var(--foreground) / 0.12)',
          margin: '14px 0 12px',
        }}
      />

      {/* 舌象自检次级入口（兄弟节点，独立绑定，不触发主行问卷跳转） */}
      <View
        hoverClass="none"
        onClick={goTongue}
        className="flex items-center justify-between active:opacity-70 transition-opacity"
      >
        <Text
          style={{
            fontSize: '26rpx',
            color: 'hsl(var(--primary-strong))',
            fontWeight: 600,
          }}
        >
          👁 或拍张舌头照片 · 智能识别倾向
        </Text>
        <Text style={{ fontSize: '26rpx', color: 'hsl(var(--primary-strong))', fontWeight: 700 }}>
          →
        </Text>
      </View>
    </View>
  )
}
