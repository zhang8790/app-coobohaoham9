import { View, Text } from '@tarojs/components'
import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  left?: ReactNode
  right?: ReactNode
  className?: string
}

/** 统一页头：标题 + 可选左/右操作。各页头部导航模式不一，可逐步接入以统一返回/标题栏。 */
export default function PageHeader({ title, left, right, className = '' }: PageHeaderProps) {
  return (
    <View
      className={`flex items-center justify-between px-4 h-12 bg-background border-b border-border ${className}`}
    >
      <View className="flex items-center gap-2 min-w-0">
        {left}
        <Text className="text-lg font-semibold text-foreground truncate">{title}</Text>
      </View>
      {right ? <View className="flex items-center gap-2">{right}</View> : null}
    </View>
  )
}
