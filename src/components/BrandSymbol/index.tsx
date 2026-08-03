// 超级符号：放大镜查配料 —— 全站品牌视觉锤（Brand Super-Symbol）
// 全站统一心智："来电有喜 = 帮你看懂儿童零食配料表的那一个 App"。
// 植入点：个人中心 hero、查配料入口、分享卡片角标、商品配料结论角标、启动闪现。
// 其余增长支柱（社交裂变 / 会员定价 / 触发唤醒）均复用此组件作为视觉母体。
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'

export const BRAND_SLOGAN = '放大镜查配料，孩子吃得更明白'

export interface BrandSymbolProps {
  size?: number
  withSlogan?: boolean
  sloganClassName?: string
  className?: string
  style?: Record<string, any>
}

export default function BrandSymbol({
  size = 24,
  withSlogan = false,
  sloganClassName = '',
  className = '',
  style,
}: BrandSymbolProps) {
  return (
    <View className={`flex items-center gap-2 ${className}`} style={style}>
      <Icon name="brand-detect" size={size} className="text-primary" />
      {withSlogan && (
        <Text className={`text-base font-bold text-primary ${sloganClassName}`}>
          {BRAND_SLOGAN}
        </Text>
      )}
    </View>
  )
}
