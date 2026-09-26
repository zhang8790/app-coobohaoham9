import type { ReactNode } from 'react'

type Tone = 'primary' | 'herb' | 'success' | 'info' | 'warning' | 'danger'

interface TrustChipProps {
  label: string
  tone?: Tone
  icon?: ReactNode
}

const TONE: Record<Tone, { bg: string; fg: string; bd: string }> = {
  primary: { bg: 'var(--primary-soft)', fg: 'var(--primary)', bd: 'var(--primary)' },
  herb: { bg: 'var(--color-herb-100)', fg: 'var(--color-herb-600)', bd: 'var(--color-herb-500)' },
  success: { bg: 'var(--success-soft)', fg: 'var(--success-strong)', bd: 'var(--success-strong)' },
  info: { bg: 'var(--info-soft)', fg: 'var(--info-text)', bd: 'var(--info)' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)', bd: 'var(--warning)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)', bd: 'var(--danger)' },
}

/**
 * 状态/语义胶囊 · 与小程序端 TrustChip 语义对齐。
 * 用于资质标、安全评级、场景标签等，统一语气色与形状，杜绝各页散写 pill。
 */
export default function TrustChip({ label, tone = 'primary', icon }: TrustChipProps) {
  const c = TONE[tone]
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        background: c.bg,
        border: `1px solid ${c.bd}`,
        borderRadius: 999,
        color: c.fg,
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--fw-medium)',
        lineHeight: 1.4,
      }}
    >
      {icon != null && <span aria-hidden="true">{icon}</span>}
      {label}
    </span>
  )
}
