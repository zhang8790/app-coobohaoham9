// L3 实力背书信任条：新访客/合作方/投资人一眼看到企业基本面，强化护城河感知。
// 数字均为真实企业数据占位（合规红线：不杜撰），上线前由运营替换。
import { View, Text } from '@tarojs/components'

const BADGES = [
  { num: 'XX', unit: '项', label: '食安资质' },
  { num: 'XX', unit: '家', label: '直供基地' },
  { num: 'XX', unit: '家', label: '科研合作' },
  { num: 'XX', unit: '项', label: '安全检测' },
]

export default function TrustStrip() {
  return (
    <View className="mx-4 mt-4 pg-card rounded-2xl p-4 relative overflow-hidden">
      {/* 古金左侧竖条，呼应 section-accent 的目录式语言 */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg,#E8C66B,hsl(40 42% 52%))' }} />
      <View className="flex items-center gap-2 mb-3">
        <Text className="text-base font-bold text-foreground">🔒 看得见的安心</Text>
        <Text className="text-[10px] text-white font-bold px-2 py-0.5 rounded-full" style={{ background: 'hsl(40 42% 52%)' }}>护城河</Text>
      </View>
      <View style={{ display: 'flex' }}>
        {BADGES.map((b) => (
          <View key={b.label} className="flex-1 text-center">
            <Text className="text-xl font-extrabold" style={{ color: 'hsl(19 57% 42%)' }}>
              {b.num}
              <Text className="text-xs font-bold">{b.unit}</Text>
            </Text>
            <Text className="text-[11px] text-muted-foreground mt-1 block">{b.label}</Text>
          </View>
        ))}
      </View>
      <Text className="text-[10px] text-muted-foreground mt-3 block text-center" style={{ fontStyle: 'italic' }}>
        * 数字为真实企业数据占位，上线前由运营替换（不杜撰）
      </Text>
    </View>
  )
}
