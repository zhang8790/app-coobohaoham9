// 共享商品网格卡：两列网格（图上文下），首页主 Feed 与自营页统一复用，保证风格 100% 一致。
import { View, Text, Image, Button } from '@tarojs/components'
import { useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '@/components/Icon'
import AddToCartButton from '@/components/AddToCartButton'
import { type ProductCareInfo, careLevel } from '@/utils/product-care'
import type { FitTier } from '@/utils/food-therapy/types'
import { type ProductTherapyReport, NATURE_FEELING } from '@/utils/food-therapy/product-therapy'

export interface ProductGridCardProps {
  id: string
  name: string
  price: number
  imageUrl?: string | null
  originalPrice?: number
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
  /** 「适合我」三态（基于登录用户画像）：适合我 / 慎吃 / 忌口，传 null 不展示 */
  suitability?: FitTier | null
  onTap?: () => void
  onAddCart?: (id: string) => void
  adding?: boolean
  onShare?: (id: string) => void
  disabled?: boolean
  /** 累计销量（件），传入即渲染「已售 X」 */
  sales?: number
  /** 紧凑模式：首页用，4:3 图 + 更小信息区，纵向占位更短 */
  compact?: boolean
  /** 食疗引擎报告（与详情页/门店卡同源）：传入即渲染整体性味 + 三色预警 */
  therapyReport?: ProductTherapyReport | null
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
  id, name, price, imageUrl, originalPrice, storeName, subtitle,
  matchLabel, care, imageSlot, footerExtra, width = '48%', imageRatio = '1:1',
  suitability, onTap, onAddCart, adding, onShare, disabled, sales, compact, therapyReport,
}: ProductGridCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  // 紧凑模式：首页默认 4:3 短图（除非显式传 1:1）
  const effRatio = compact && imageRatio === '1:1' ? '4:3' : imageRatio
  const ratioPad = effRatio === '4:3' ? '75%' : '100%'

  // 卡片只展示正向「适合我」信号；负向「慎吃/忌口」不在列表卡呈现（不展示不适合人群）
  const suitBadge = suitability === 'recommend'
    ? { text: '适合我', bg: '#16A34A', fg: '#FFFFFF' }
    : null
  // 卡片正向信号：展示「需要/适合的人群」，不展示不适合人群
  const fitChip = therapyReport?.fit_people
    ? therapyReport.fit_people.split(/[、，,]/).slice(0, 2).join('、')
    : ''
  return (
    <View
      className="pg-card relative flex flex-col overflow-hidden"
      style={{ width, marginBottom: compact ? '8px' : '12px' }}
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

      {/* 信息区：紧凑模式(py-1.5 / 更矮 minHeight) 缩短首页卡片纵向占位 */}
      <View className={`flex flex-col gap-1 flex-1 ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}
        style={{ minHeight: care ? (compact ? '128px' : '172px') : (compact ? '84px' : '108px') }}>
        <Text className="text-base font-bold text-foreground leading-tight line-clamp-2">{name}</Text>

        {/* 食疗引擎三色预警（与详情页/门店卡同源）：整体性味 + 红/橙/蓝预警 */}
        {therapyReport && (
          <View className="flex items-center gap-1 flex-wrap" style={{ marginTop: 2 }}>
            {therapyReport.overall_nature_code ? (
              <Text className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: '#F3F4F6', color: NATURE_COLOR[therapyReport.overall_nature_code] ?? '#8C7E6E' }}>
                {NATURE_FEELING[therapyReport.overall_nature_code] || therapyReport.overall_nature_code}
              </Text>
            ) : null}
            {fitChip ? (
              <Text className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: '#DCFCE7', color: '#16A34A', whiteSpace: 'nowrap' }} numberOfLines={1}>
                ✅适合{fitChip}
              </Text>
            ) : null}
            {/* 列表卡片不含过敏原提示，避免信息过载 */}
          </View>
        )}

        {sales != null && (
          <Text className="text-xs text-muted-foreground leading-none">已售 {formatSales(sales)}</Text>
        )}

        {/* 「适合我」三态标签：个性化食养适配，一眼可见 */}
        {suitBadge && (
          <View className="flex items-center" style={{ marginTop: -2 }}>
            <View className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: suitBadge.bg, color: suitBadge.fg }}>
              {suitBadge.text}
            </View>
          </View>
        )}

        {/* 关怀层：食养一句话 + 关怀度 + 食疗标签 + 性味/搭配智能提示 */}
        {care && (
          <View className="flex flex-col gap-1">
            {care.shiyang ? (
              <Text className="text-xs text-secondary leading-snug line-clamp-2">{sanitizeCardCopy(care.shiyang)}</Text>
            ) : null}
            <CareBar score={care.careScore} />
            {/* 食疗标签(赭红)：前台只展示食养维度（过滤含负向词的标签） */}
            <View className="flex items-center gap-1 flex-wrap overflow-hidden" style={{ maxHeight: '44px' }}>
              {care.healthTags.filter((t) => !hasNegativeTag(t)).slice(0, 2).map((t) => (
                <Text key={t} className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/15">{t}</Text>
              ))}
            </View>
            {/* 性味(寒热有色) + 宜搭正向智能提示：商品更懂用户、更科学搭配 */}
            <View className="flex items-center justify-between">
              <Text className="text-xs leading-tight" style={{ color: NATURE_COLOR[care.nature ?? ''] ?? '#8C7E6E' }}>
                {care.nature ? `· ${care.nature}` : '· 性味待补'}
              </Text>
              {care.matchCount > 0 && (
                <Text className="flex-shrink-0 text-xs text-muted-foreground leading-tight">
                  宜搭{care.matchCount}
                </Text>
              )}
            </View>
          </View>
        )}

        {subtitle && (
          <Text className="text-xs text-muted-foreground line-clamp-1">{subtitle}</Text>
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

// 销量数字格式化：>=1万 显示 X.X万，否则原值
function formatSales(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 10000) return `${(Math.floor(n / 1000) / 10).toFixed(1)}万`
  return `${n}`
}

/**
 * 商品卡片文案清洗：商品库里的商家运营文案可能含「过敏/慎/禁忌/不宜/风险/警告/高胆固醇/甲壳」
 * 等负向词，按"只展示正向"原则，截断到首个负向触发词之前，或整句过滤。
 * 保留所有正向食养/搭配/功效描述。
 */
function sanitizeCardCopy(text: string): string {
  if (!text) return ''
  // 负向触发词：截断点（保留前半段正向描述）
  const cutTokens = ['过敏', '慎食', '慎用', '慎搭', '忌口', '禁忌', '不宜', '警告', '风险', '高胆固醇', '甲壳', '海鲜过敏', '痛风', '婴幼儿', '三高', '限量', '少吃']
  for (const tok of cutTokens) {
    const idx = text.indexOf(tok)
    if (idx > 0) {
      const cut = text.slice(0, idx).trim().replace(/[,，。.;；、\s]+$/, '')
      if (cut.length >= 4) return cut + '…'
      // 截断后太短，整句过滤（不渲染）
      return ''
    }
  }
  // 若整句以负向词开头，整句过滤
  if (cutTokens.some((tok) => text.startsWith(tok))) return ''
  return text
}

/** 标签文本是否含负向词（用于过滤 healthTags / 其它 chip） */
const NEGATIVE_TAG_TOKENS = ['过敏', '慎', '忌', '不宜', '禁忌', '风险', '警告', '限量', '少吃', '不可', '请勿']
function hasNegativeTag(t: string): boolean {
  if (!t) return false
  return NEGATIVE_TAG_TOKENS.some((tok) => t.includes(tok))
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
