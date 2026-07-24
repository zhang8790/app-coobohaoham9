import { View, Text } from '@tarojs/components'
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

/** 统一空状态：图标 + 标题 + 可选描述/操作。所有列表/数据页共用，消除各页散写的空态 JSX。 */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View className="flex flex-col items-center py-16 gap-3">
      {icon}
      <Text className="text-xl text-muted-foreground">{title}</Text>
      {description ? (
        <Text className="text-base text-muted-foreground text-center px-8">{description}</Text>
      ) : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  )
}
