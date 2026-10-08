import type { CSSProperties, ReactNode } from 'react'
import { NavIcon } from '@/components/icons'

/* ============================================================================
 * 彩色卡片设计系统 · 来店有喜管理端
 * 统一色调（tone）→ 软底卡 + 圆角图标芯片 + 同色系深色字，保证「每张卡都有色且协调」。
 * 所有色值走 index.css token（*-soft 底 + *-strong/-text 字），对比度达 AA，CI 安全。
 * ==========================================================================*/

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export const TONE: Record<Tone, { soft: string; strong: string; chipColor: string }> = {
  primary: { soft: 'var(--primary-soft)', strong: 'var(--primary-strong)', chipColor: 'var(--primary-strong)' },
  success: { soft: 'var(--success-soft)', strong: 'var(--success-strong)', chipColor: 'var(--success)' },
  warning: { soft: 'var(--warning-soft)', strong: 'var(--warning)', chipColor: 'var(--warning)' },
  danger: { soft: 'var(--danger-soft)', strong: 'var(--danger-strong)', chipColor: 'var(--danger)' },
  info: { soft: 'var(--info-soft)', strong: 'var(--info-text)', chipColor: 'var(--info)' },
  accent: { soft: 'var(--accent-soft)', strong: 'var(--accent-text)', chipColor: 'var(--accent)' },
}

/* ---------- 圆角图标芯片 ---------- */
export function IconChip({ name, tone = 'primary', size = 40, iconSize = 20 }: { name: string; tone?: Tone; size?: number; iconSize?: number }) {
  const t = TONE[tone]
  return (
    <span style={{ width: size, height: size, borderRadius: 10, background: t.chipColor ? 'var(--surface)' : 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
      <NavIcon name={name} size={iconSize} style={{ color: t.chipColor }} />
    </span>
  )
}

/* ---------- 指标卡 StatCard（彩色软底 + 图标芯片 + 同色值） ---------- */
interface StatCardProps {
  tone?: Tone
  icon?: string
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  onClick?: () => void
}
export function StatCard({ tone = 'primary', icon, label, value, sub, onClick }: StatCardProps) {
  const t = TONE[tone]
  return (
    <div
      onClick={onClick}
      style={{
        background: t.soft, border: '1px solid var(--border)', borderRadius: 14,
        padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: onClick ? 'var(--shadow-sm)' : 'none',
        cursor: onClick ? 'pointer' : 'default', transition: 'transform var(--motion-fast) var(--ease-out)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {icon ? <IconChip name={icon} tone={tone} /> : <span />}
        <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{label}</span>
      </div>
      <div>
        <p style={{ color: t.strong, fontSize: 26, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>{value}</p>
        {sub && <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4, margin: 0 }}>{sub}</p>}
      </div>
    </div>
  )
}

/* ---------- 区块面板 Panel（彩色顶条 + 图标标题） ---------- */
interface PanelProps {
  tone?: Tone
  icon?: string
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  padding?: number | string
  accent?: boolean
  style?: CSSProperties
  children?: ReactNode
}
export function Panel({ tone = 'primary', icon, title, subtitle, action, padding = 20, accent = true, style, children }: PanelProps) {
  const t = TONE[tone]
  return (
    <section style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderTop: accent ? `3px solid ${t.strong}` : '1px solid var(--border)',
      borderRadius: 14, padding, ...style,
    }}>
      {(title || action) && (
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {icon && <IconChip name={icon} tone={tone} size={32} iconSize={17} />}
            <div style={{ minWidth: 0 }}>
              {title && <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{title}</h3>}
              {subtitle && <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '2px 0 0' }}>{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/* ---------- 状态胶囊（soft 底 + 同色字） ---------- */
export function ToneBadge({ tone = 'primary', children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone]
  return (
    <span style={{ color: t.strong, background: t.soft, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '3px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {children}
    </span>
  )
}
