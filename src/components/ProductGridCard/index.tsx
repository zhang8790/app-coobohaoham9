// 共享商品网格卡：两列网格（图上文下），首页主 Feed 与探索页统一复用，保证风格 100% 一致。
import { View, Text, Image, Button } from '@tarojs/components'
import type { ReactNode } from 'react'

export interface ProductGridCardProps {
  id: string
  name: string
  price: number
  imageUrl?: string | null
  originalPrice?: number
  moodTags?: string[]
  storeName?: string
  subtitle?: string
  matchLabel?: string
  /** 自定义图片区（探索页可注入 EmotionProductImage / ExploreProductImage 等带特效图） */
  imageSlot?: ReactNode
  /** 价格行上方额外信息（如距离 📍） */
  footerExtra?: ReactNode
  onTap?: () => void
  onAddCart?: (id: string) => void
  adding?: boolean
  onShare?: (id: string) => void
  disabled?: boolean
}

const GRID_MATCH_STYLE: Record<string, string> = {
  '完美契合': 'bg-primary text-white',
  '较好匹配': 'bg-accent text-white',
  '有点匹配': 'bg-muted text-secondary',
}

export default function ProductGridCard({
  id, name, price, imageUrl, originalPrice, moodTags, storeName, subtitle,
  matchLabel, imageSlot, footerExtra, onTap, onAddCart, adding, onShare, disabled,
}: ProductGridCardProps) {
  return (
    <View
      className="bg-card rounded-2xl border border-border relative flex flex-col overflow-hidden"
      style={{ width: '48%', marginBottom: '12px' }}
      onClick={() => { if (!disabled) onTap?.() }}>
      {imageSlot ?? (
        <Image src={imageUrl || ''} mode="aspectFill" className="w-full bg-muted" style={{ height: '150px' }} lazyLoad />
      )}

      {matchLabel && (
        <View className={`absolute top-1.5 left-1.5 z-10 px-2 py-0.5 rounded-full text-xs font-bold ${GRID_MATCH_STYLE[matchLabel] ?? 'bg-muted text-secondary'}`}>
          {matchLabel}
        </View>
      )}

      {onShare && (
        <Button openType="share" className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center leading-none"
          style={{ border: 'none', padding: 0 }}
          onClick={(e) => { e.stopPropagation(); onShare(id) }}>
          <View className="i-mdi-share-variant text-white text-base" />
        </Button>
      )}

      <View className="p-2.5 flex flex-col gap-1.5 flex-1">
        <Text className="text-base font-bold text-foreground leading-tight line-clamp-2">{name}</Text>

        {subtitle && (
          <Text className="text-xs text-muted-foreground line-clamp-1">{subtitle}</Text>
        )}

        {moodTags && moodTags.length > 0 && (
          <View className="flex gap-1 flex-wrap overflow-hidden" style={{ maxHeight: '24px' }}>
            {moodTags.slice(0, 2).map((t) => (
              <Text key={t} className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary">{t}</Text>
            ))}
          </View>
        )}

        {storeName && (
          <Text className="text-xs text-muted-foreground line-clamp-1">{storeName}</Text>
        )}

        {footerExtra}

        <View className="flex items-end justify-between mt-auto pt-1">
          <View className="flex flex-col">
            <Text className="text-lg font-bold text-primary">¥{price}</Text>
            {originalPrice ? <Text className="text-xs text-muted-foreground line-through">¥{originalPrice}</Text> : null}
          </View>
          {onAddCart && (
            <Button type="button"
              className="flex-shrink-0 flex items-center justify-center rounded-full bg-primary"
              style={{ width: '40px', height: '40px', boxShadow: '0 4px 12px rgba(194,65,12,0.35)' }}
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); onAddCart(id) }}>
              {adding
                ? <View className="i-mdi-loading text-white text-lg animate-spin" />
                : <View className="i-mdi-cart-plus text-white text-lg" />}
            </Button>
          )}
        </View>
      </View>
    </View>
  )
}
