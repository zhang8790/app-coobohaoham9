import { View, Text } from '@tarojs/components'
import type { ReactNode } from 'react'
import BrandMark from '../BrandMark'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

/** 统一空状态：图标 + 标题 + 可选描述/操作。所有列表/数据页共用，消除各页散写的空态 JSX。
 *  未传 icon 时默认渲染「福袋」品牌符号（柔绿），让空状态也露出品牌图腾。 */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View className="flex flex-col items-center py-16 gap-3">
      {icon ?? <BrandMark size={92} tone="soft" />}
      <Text className="text-xl text-muted-foreground">{title}</Text>
      {description ? (
        <Text className="text-base text-muted-foreground text-center px-8">{description}</Text>
      ) : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  )
}
