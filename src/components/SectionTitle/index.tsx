import React from 'react'
import { View, Text } from '@tarojs/components'
import type { CSSProperties } from 'react'
import Icon from '@/components/Icon'

/**
 * 全局统一区块标题（单一事实源）：强调竖线 + 可选图标/emoji + 主标题（16/600）+ 可选副标题。
 * 首页 / 商品详情 / 食疗推荐 / 配料安全报告 共用同一套 DNA，杜绝「同一级标题两屏像两个产品」。
 * 竖线复用 app.scss 的 .section-accent（此前为死类，本组件首次激活），accent 控制强调色。
 */
type Accent = 'primary' | 'herb'

interface SectionTitleProps {
  title: string
  subtitle?: string
  /** 装饰 emoji（如 🍼），与 iconName 互斥可选 */
  emoji?: string
  /** 线性图标名（如 leaf / magnify），与 emoji 互斥可选 */
  iconName?: string
  action?: { label: string; onClick: () => void }
  className?: string
  /** 强调色：primary=柔珊瑚（首页/详情/食养推荐）；herb=草本绿（配料安全报告语义，与全站单一绿一致） */
  accent?: Accent
}

const accentBar: Record<Accent, string> = {
  primary: 'hsl(var(--primary))',
  herb: 'var(--color-herb-500)',
}
const accentTitle: Record<Accent, string> = {
  primary: 'hsl(var(--foreground))',
  herb: 'var(--color-herb-600)',
}

const subStyle: CSSProperties = {
  fontSize: '24rpx',
  fontWeight: 500,
  color: 'hsl(var(--muted-foreground))',
  lineHeight: 1.3,
  marginTop: 2,
}
const actionStyle: CSSProperties = {
  fontSize: '24rpx',
  fontWeight: 700,
  color: 'hsl(var(--primary))',
}

export default function SectionTitle({
  title,
  subtitle,
  emoji,
  iconName,
  action,
  className,
  accent = 'primary',
}: SectionTitleProps) {
  const bar = accentBar[accent]
  const titleColor = accentTitle[accent]
  return (
    <View className={`flex items-center justify-between mb-3 ${className || ''}`}>
      <View className="flex items-center gap-2 min-w-0">
        <View className="section-accent" style={{ background: bar }} />
        {emoji ? <Text style={{ fontSize: '32rpx' }}>{emoji}</Text> : null}
        {iconName ? <Icon name={iconName as any} size={16} className="text-primary" /> : null}
        <View className="min-w-0">
          <Text className="block truncate" style={{ fontSize: '32rpx', fontWeight: 600, color: titleColor, lineHeight: 1.3 }}>{title}</Text>
          {subtitle ? <Text className="block truncate" style={subStyle}>{subtitle}</Text> : null}
        </View>
      </View>
      {action ? (
        <Text
          style={actionStyle}
          className="flex-shrink-0 ml-2"
          hoverClass="none"
          onClick={action.onClick}
        >{action.label}</Text>
      ) : null}
    </View>
  )
}
