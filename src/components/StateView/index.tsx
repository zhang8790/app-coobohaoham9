// 全局统一反馈态组件（单一事实源）：loading / empty / error / success 四态收口。
// 解决「每页自己拼 loading 骨架 / 空态 / 报错」导致视觉与读屏体验不一致的问题。
// 读屏友好：error 态 aria-live=assertive 立即播报，loading 态 aria-live=polite 温和提示，
// 操作按钮带 aria-role/aria-label，杜绝「报错后看不见、读屏读不到」的无障碍黑洞。
import React from 'react'
import { View, Text } from '@tarojs/components'
import type { CSSProperties } from 'react'
import Icon from '@/components/Icon'

export type StateType = 'loading' | 'empty' | 'error' | 'success'

interface StateViewProps {
  type: StateType
  /** 主文案，缺省按态给默认 */
  title?: string
  /** 次要说明 */
  description?: string
  /** error/empty 态的操作按钮文案（如「重新加载」「去逛逛」） */
  actionText?: string
  onAction?: () => void
  /** 占满父容器（列表/整页空态常用），默认 true */
  full?: boolean
  className?: string
  style?: CSSProperties
}

const copy: Record<StateType, { emoji: string; title: string; tint: string; live: 'assertive' | 'polite' | undefined }> = {
  loading: { emoji: '', title: '加载中…', tint: 'hsl(var(--primary))', live: 'polite' },
  empty:   { emoji: '🗂️', title: '暂无内容', tint: 'hsl(var(--muted-foreground))', live: undefined },
  error:   { emoji: '⚠️', title: '加载失败', tint: 'hsl(var(--destructive))', live: 'assertive' },
  success: { emoji: '✅', title: '操作成功', tint: 'var(--color-herb-500)', live: 'polite' },
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '96rpx 48rpx',
  textAlign: 'center',
}
const innerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }

export default function StateView({
  type,
  title,
  description,
  actionText,
  onAction,
  full = true,
  className,
  style,
}: StateViewProps) {
  const c = copy[type]
  const t = title || c.title
  return (
    <View
      className={`${full ? 'w-full' : ''} ${className || ''}`}
      style={{ ...(full ? { minHeight: '60vh' } : {}), ...wrapStyle, ...style }}
      aria-role="alert"
      aria-label={`${t}${description ? '，' + description : ''}`}
      aria-live={c.live}
    >
      <View style={innerStyle}>
        {type === 'loading' ? (
          <Icon name="loading" size={40} className="animate-spin" style={{ color: c.tint }} />
        ) : (
          <Text style={{ fontSize: '72rpx', lineHeight: 1 }}>{c.emoji}</Text>
        )}
        <Text style={{ fontSize: '30rpx', fontWeight: 600, color: 'hsl(var(--foreground))', lineHeight: 1.4 }}>{t}</Text>
        {description ? (
          <Text style={{ fontSize: '24rpx', color: 'hsl(var(--muted-foreground))', lineHeight: 1.5, maxWidth: '520rpx' }}>{description}</Text>
        ) : null}
        {actionText && onAction ? (
          <View
            hoverClass="none"
            aria-role="button"
            aria-label={actionText}
            onClick={onAction}
            style={{
              marginTop: 12,
              padding: '16rpx 40rpx',
              borderRadius: 'var(--radius-md)',
              backgroundColor: type === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#fff' }}>{actionText}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
