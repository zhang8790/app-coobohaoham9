import type { ReactNode } from 'react'

type Accent = 'primary' | 'herb'

interface SectionTitleProps {
  title: string
  subtitle?: string
  accent?: Accent
  action?: ReactNode
}

/**
 * 区块标题 · 与小程序端 SectionTitle 语义对齐（珊瑚/食养绿 竖线 + 主副标题）。
 * 全站分区标题收口组件，杜绝各页手写 h1/h2 字号字重漂移。
 */
export default function SectionTitle({ title, subtitle, accent = 'primary', action }: SectionTitleProps) {
  const bar = accent === 'herb' ? 'var(--color-herb-500)' : 'var(--primary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ width: 4, height: 18, borderRadius: 2, background: bar, flexShrink: 0 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-bold)', lineHeight: 'var(--leading-tight)', margin: 0 }}>{title}</h2>
        {subtitle && (
          <p style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)', margin: '2px 0 0' }}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}
