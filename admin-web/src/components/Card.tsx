import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * 卡片容器 · 与小程序端 Card 语义对齐。
 * 基于全局 .lx-card（含 hover 边框过渡），统一 surface/border/radius token。
 */
export default function Card({ children, className, style }: CardProps) {
  return (
    <div
      className={`lx-card${className ? ' ' + className : ''}`}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
