import type { CSSProperties, ReactNode } from 'react'

/* ============================================================================
 * 企业级复用组件 · 来店有喜管理端（浅色大厂风）
 * 统一卡片 / 页头 / 指标卡 / 分段控件，杜绝各页手写样式漂移。
 * 所有样式走 index.css 的 token，CI 安全（无 800 字重 / 无禁用色）。
 * ==========================================================================*/

/* ---------- 卡片 Card ---------- */
interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  padding?: number | string
  style?: CSSProperties
  className?: string
  onClick?: () => void
}
export function Card({ title, subtitle, action, padding = 20, style, className, onClick, children }: CardProps & { children?: ReactNode }) {
  return (
    <section
      className={`lx-card ${className ?? ''}`}
      onClick={onClick}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding, boxShadow: 'var(--shadow-sm)', ...(onClick ? { cursor: 'pointer' } : null), ...style,
      }}
    >
      {(title || action) && (
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: subtitle ? 12 : 0, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {title && <h2 style={{ color: 'var(--text)', fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-bold)', lineHeight: 'var(--leading-tight)', margin: 0 }}>{title}</h2>}
            {subtitle && <p style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)', margin: '4px 0 0' }}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/* ---------- 页头 PageHeader（面包屑 + 标题 + 操作区） ---------- */
interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  breadcrumb?: ReactNode
  extra?: ReactNode
}
export function PageHeader({ title, subtitle, breadcrumb, extra }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      {breadcrumb && (
        <div style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          {breadcrumb}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ color: 'var(--text)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', lineHeight: 'var(--leading-tight)', margin: 0 }}>{title}</h1>
          {subtitle && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', marginTop: 4 }}>{subtitle}</p>}
        </div>
        {extra && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{extra}</div>}
      </div>
    </div>
  )
}

/* ---------- 指标卡 StatCard ---------- */
interface StatCardProps {
  icon?: ReactNode
  label: ReactNode
  value: ReactNode
  color?: string
  hot?: boolean
  onClick?: () => void
}
export function StatCard({ icon, label, value, color = 'var(--text-dim)', hot = false, onClick }: StatCardProps) {
  const accent = hot ? color : color
  return (
    <div
      onClick={onClick}
      className="lx-card"
      style={{
        background: 'var(--card)', border: `1px solid ${hot ? accent : 'var(--border)'}`, borderRadius: 'var(--radius-lg)',
        padding: '18px 20px', boxShadow: 'var(--shadow-sm)', cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        {icon && <span style={{ color: accent, display: 'inline-flex' }}>{icon}</span>}
        {hot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />}
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>{label}</p>
      <p style={{ color: hot ? accent : 'var(--text)', fontSize: 30, fontWeight: 'var(--fw-bold)', lineHeight: 1.2, marginTop: 4 }}>{value}</p>
    </div>
  )
}

/* ---------- 分段控件 Segmented（如登录方式切换） ---------- */
interface SegmentedProps<T extends string> {
  options: { key: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
}
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div style={{
      display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', padding: 3,
    }}>
      {options.map(o => {
        const active = o.key === value
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} style={{
            flex: 1, padding: '8px 0', borderRadius: 'var(--radius-sm)', border: 'none',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--primary-strong)' : 'var(--text-muted)',
            fontSize: 'var(--text-sm)', fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-medium)',
            cursor: 'pointer', boxShadow: active ? 'var(--shadow-sm)' : 'none',
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}

/* ---------- 文本输入 Field（统一输入框外观） ---------- */
interface FieldProps {
  label: ReactNode
  children: ReactNode
}
export function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-medium)', display: 'block', marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  )
}

/* ---------- 主按钮 PrimaryButton ---------- */
interface PrimaryButtonProps {
  children: ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  fullWidth?: boolean
}
export function PrimaryButton({ children, type = 'button', disabled, loading, onClick, fullWidth }: PrimaryButtonProps) {
  return (
    <button
      type={type} disabled={disabled || loading}
      onClick={onClick}
      style={{
        width: fullWidth ? '100%' : 'auto', padding: '12px 20px',
        background: (disabled || loading) ? 'var(--primary-disabled)' : 'var(--primary-strong)',
        border: 'none', borderRadius: 'var(--radius-md)', color: '#fff',
        fontSize: 'var(--text-base)', fontWeight: 'var(--fw-semibold)', cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        boxShadow: (disabled || loading) ? 'none' : 'var(--shadow-primary)', transition: 'all var(--motion-fast) var(--ease-out)',
      }}
    >{loading ? '处理中...' : children}</button>
  )
}

/* ---------- 文字按钮 / 链接按钮 ---------- */
export function GhostButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-medium)',
      }}>{children}</button>
  )
}

/* ---------- 统一输入框基础样式（供各页 input/select 复用） ---------- */
export const inputBase: CSSProperties = {
  width: '100%', padding: '11px 14px', background: 'var(--surface)',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
  color: 'var(--text)', fontSize: 'var(--text-base)', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out)',
}
