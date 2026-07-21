import { Image } from '@tarojs/components'
import type { ReactElement } from 'react'
import { ICON_INK, ICON_PRIMARY, ICON_WHITE } from './iconBase64'

/**
 * 墨韵手绘图标库（去 Material / 去 AI 化）
 *
 * 重要：微信小程序 WXML 不支持 <svg> 标签，Taro 编译时会丢弃 <svg>，
 * 因此原「返回 <svg>」的实现在真机完全不显示。
 * 现改为 base64 SVG 经 <Image> 渲染（见 iconBase64.ts，由 scripts/gen-icon-base64.py 生成）。
 *
 * 颜色按调用方 color / className 自动选取：
 *   - 含 white        → 白（彩色按钮上的图标）
 *   - 含 primary/赭红 → 赭红（选中 / 强调）
 *   - 其余            → 墨色（普通 / 米底）
 *
 * 用法：<Icon name="leaf" size={28} className="text-primary" />
 * 新增图标：在 scripts/gen-icon-base64.py 对应的 CUSTOM/MDI 源补充后重跑脚本即可。
 */

export interface IconProps {
  name: string
  size?: number
  color?: string
  className?: string
  // 透传其余属性（onClick / onTap / style / id 等），便于图标按钮等场景
  [key: string]: any
}

function pickColorKey(color?: string, className?: string): 'INK' | 'PRIMARY' | 'WHITE' {
  const s = `${color || ''} ${className || ''}`
  if (/white|#fff|#FFF/i.test(s)) return 'WHITE'
  if (/primary|A8552E|赭/i.test(s)) return 'PRIMARY'
  return 'INK'
}

const DICTS = { INK: ICON_INK, PRIMARY: ICON_PRIMARY, WHITE: ICON_WHITE }

export default function Icon({ name, size = 28, color, className, style, ...rest }: IconProps): ReactElement | null {
  const key = pickColorKey(color, className)
  const src = (DICTS[key][name] || ICON_INK[name] || '') as string
  if (!src) return null
  return (
    <Image
      src={src}
      mode="aspectFit"
      className={className}
      style={{ width: size, height: size, display: 'inline-block', ...(style as object) }}
      {...rest}
    />
  )
}
