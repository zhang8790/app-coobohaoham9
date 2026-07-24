import { View } from '@tarojs/components'

export interface SkeletonProps {
  count?: number
  height?: number | string
  rounded?: string
  className?: string
}

/** 统一骨架屏占位：列表首次加载时使用，消除各页散写的"加载中"文案。 */
export default function Skeleton({ count = 1, height = 16, rounded = 'rounded-lg', className = '' }: SkeletonProps) {
  return (
    <View className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          className={`${rounded} mb-3 bg-muted animate-pulse`}
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
        />
      ))}
    </View>
  )
}
