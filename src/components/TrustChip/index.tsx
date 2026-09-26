// 共享信任锚点胶囊：详情页首屏「已检配料 / 已为你适配 / 批次可溯 / 食养参考」等
// 四枚信任锚点统一组件（图标 + 文案，草本语义浅底），全站复用、不准页面各自硬编码。
import { View, Text } from '@tarojs/components'

export interface TrustChipProps {
  icon?: string
  label: string
  /** 语义色系：herb=草本绿（默认，食养/安全语义）/ primary=珊瑚（品牌强调） */
  tone?: 'herb' | 'primary'
  onClick?: () => void
}

export default function TrustChip({ icon, label, tone = 'herb', onClick }: TrustChipProps) {
  const bg = tone === 'herb' ? 'var(--color-herb-50)' : 'hsl(var(--primary-soft))'
  const bd = tone === 'herb' ? 'var(--color-herb-100)' : 'hsl(var(--primary) / 0.2)'
  const fg = tone === 'herb' ? 'var(--color-herb-600)' : 'hsl(var(--primary-deep))'
  return (
    <View
      aria-role="text"
      aria-label={label}
      hoverClass={onClick ? 'none' : 'none'}
      onClick={onClick}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        background: bg,
        border: `1px solid ${bd}`,
      }}
    >
      {icon ? <Text style={{ fontSize: '26rpx' }}>{icon}</Text> : null}
      <Text style={{ fontSize: '24rpx', color: fg, fontWeight: 600 }}>{label}</Text>
    </View>
  )
}
