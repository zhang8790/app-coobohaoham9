// 共享商品网格卡：两列网格（图上文下），首页主 Feed 与自营页统一复用，保证风格 100% 一致。
import { View, Text, Image, Button } from '@tarojs/components'
import { useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '@/components/Icon'
import AddToCartButton from '@/components/AddToCartButton'
import { type ProductCareInfo, careLevel } from '@/utils/product-care'

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
  /** 商品「关怀层」信息（食养/情绪/适配），传入即渲染关怀版卡片 */
  care?: ProductCareInfo | null
  /** 自定义图片区（自营页可注入 EmotionProductImage / ExploreProductImage 等带特效图） */
  imageSlot?: ReactNode
  /** 价格行上方额外信息（如距离 📍） */
  footerExtra?: ReactNode
  /** 卡片宽度，默认 48%（两列网格），横向滑动可传 100% 由父容器定宽 */
  width?: string
  /** 图片区比例：'1:1'（默认）或 '4:3'（更小更紧凑），三列网格建议 4:3 */
  imageRatio?: '1:1' | '4:3'
  onTap?: () => void
  onAddCart?: (id: string) => void
  adding?: boolean
  onShare?: (id: string) => void
  disabled?: boolean
}

const GRID_MATCH_STYLE: Record<string, string> = {
  '完美契合': 'bg-primary text-white',
  '较好匹配': 'bg-accent text-white',
  '有点匹配': 'bg-card text-secondary border border-border',
}

// 整体性味 → 颜色（寒凉偏冷蓝、平性中性绿、温热偏暖红），让「寒热属性」一眼可读、更科学
const NATURE_COLOR: Record<string, string> = {
  '大寒': '#0EA5E9', '寒凉': '#0EA5E9',
  '平性': '#10B981',
  '微温': '#F97316', '温热': '#EA580C', '大热': '#DC2626',
}

export default function ProductGridCard({
  id, name, price, imageUrl, originalPrice, moodTags, storeName, subtitle,
  matchLabel, care, imageSlot, footerExtra, width = '48%', imageRatio = '1:1',
  onTap, onAddCart, adding, onShare, disabled,
}: ProductGridCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const ratioPad = imageRatio === '4:3' ? '75%' : '100%'
  return (
    <View
      className="pg-card relative flex flex-col overflow-hidden"
      style={{ width, marginBottom: '12px' }}
      hoverClass="pg-hover"
      onClick={() => { if (!disabled) onTap?.() }}>
      {/* 图片区：1:1 / 4:3 自适应；自定义 imageSlot（探索页特效图）用 absolute inset-0
          绝对填满比例框，避免「比例框 + slot 各自撑一次高度」导致卡片被拉成 2:1 巨高 */}
      <View className="relative w-full overflow-hidden" style={{ paddingTop: ratioPad }}>
        {imageSlot ? (
          <View className="absolute inset-0 overflow-hidden">{imageSlot}</View>
        ) : (
          imageUrl && !imgFailed ? (
            <Image
              src={imageUrl}
              mode="aspectFill"
              className="pg-img"
              lazyLoad
              onError={() => setImgFailed(true)} />
          ) : (
            <View className="flex flex-col items-center justify-center bg-muted" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <View className="text-4xl text-muted-foreground">🖼</View>
              <Text className="text-xs text-muted-foreground mt-1">暂无图片</Text>
            </View>
          )
        )}
        {/* 顶部暗化蒙版，让角标/分享清晰 */}
        <View className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />

        {matchLabel && (
          <View className={`pg-badge absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-xs font-bold border ${GRID_MATCH_STYLE[matchLabel] ?? 'bg-card text-secondary border-border'}`}>
            {matchLabel}
          </View>
        )}

        {onShare && (
          <Button openType="share" className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full pg-badge bg-black/40 flex items-center justify-center leading-none"
            style={{ border: 'none', padding: 0 }}
            onClick={(e) => { e.stopPropagation(); onShare(id) }}>
            <Icon name="share-variant" size={16} className="text-white" />
          </Button>
        )}
      </View>

      {/* 信息区：标准化垂直节奏（py-2 / gap-1），3 列窄卡更紧凑 */}
      <View className="px-2.5 py-2 flex flex-col gap-1 flex-1">
        <Text className="text-base font-bold text-foreground leading-tight line-clamp-2">{name}</Text>

        {/* 关怀层：食养一句话 + 关怀度 + 食疗/情绪双色标签 + 性味/搭配智能提示 */}
        {care && (
          <View className="flex flex-col gap-1">
            {care.shiyang && (
              <Text className="text-xs text-secondary leading-snug line-clamp-2">{care.shiyang}</Text>
            )}
            <CareBar score={care.careScore} />
            {/* 食疗标签(赭红) 与 情绪配对(玫红) 双色并排，一眼读懂「食疗+情绪」 */}
            <View className="flex items-center gap-1 flex-wrap overflow-hidden" style={{ maxHeight: '44px' }}>
              {care.healthTags.slice(0, 2).map((t) => (
                <Text key={t} className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/15">{t}</Text>
              ))}
              {care.emotionTags.slice(0, 2).map((t) => (
                <Text key={t} className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-xs border"
                  style={{ color: '#DB2777', background: 'rgba(244,63,94,0.10)', borderColor: 'rgba(244,63,94,0.20)' }}>♡ {t}</Text>
              ))}
            </View>
            {/* 性味(寒热有色) + 宜搭/慎搭智能提示：商品更懂用户、更科学搭配 */}
            <View className="flex items-center justify-between">
              <Text className="text-xs leading-tight" style={{ color: NATURE_COLOR[care.nature ?? ''] ?? '#8C7E6E' }}>
                {care.nature ? `· ${care.nature}` : '· 性味待补'}
              </Text>
              {(care.matchCount > 0 || care.conflictCount > 0) && (
                <Text className="flex-shrink-0 text-xs text-muted-foreground leading-tight">
                  {care.matchCount > 0 ? `宜搭${care.matchCount} ` : ''}{care.conflictCount > 0 ? `· 慎搭${care.conflictCount}` : ''}
                </Text>
              )}
            </View>
            {care.auxRemind && (
              <Text className="text-xs leading-snug line-clamp-1" style={{ color: '#B45309' }}>⚠ {care.auxRemind}</Text>
            )}
          </View>
        )}

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
          <Text className="text-xs text-muted-foreground line-clamp-1">🏪 {storeName}</Text>
        )}

        {footerExtra}

        <View className="flex items-end justify-between mt-auto pt-1">
          <View className="flex items-baseline gap-0.5">
            <Text className="text-xs text-primary font-bold leading-none">¥</Text>
            <Text className="text-xl font-extrabold text-primary leading-none">{price}</Text>
            {originalPrice ? <Text className="text-xs text-muted-foreground line-through ml-1">¥{originalPrice}</Text> : null}
          </View>
          {onAddCart && (
            <AddToCartButton onAdd={() => onAddCart(id)} adding={adding} disabled={disabled} size={32} />
          )}
        </View>
      </View>
    </View>
  )
}

// 关怀度进度条（游戏化：分数越高越被「悉心照看」）
function CareBar({ score }: { score: number }) {
  const lvl = careLevel(score)
  const color =
    lvl.tone === 'high' ? 'hsl(var(--primary))'
      : lvl.tone === 'mid' ? 'hsl(var(--brand-gold))'
        : 'hsl(var(--muted-foreground))'
  return (
    <View className="flex items-center gap-1.5">
      <Text className="text-primary text-xs leading-none">♥</Text>
      <View className="care-bar flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
        <View className="care-bar-fill h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </View>
      <Text className="text-xs font-bold leading-none" style={{ color }}>{score}·{lvl.label}</Text>
    </View>
  )
}
