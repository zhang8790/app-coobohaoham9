import { View, Text } from '@tarojs/components'
import { RANK_TIERS as TIERS } from '@/constants/ranks'

/**
 * 段位成长可视化（纯展示，读取现有 member_rank + cv_total，不新增任何字段/功能）
 * 阈值与顺序统一引用 src/constants/ranks（与 rank-rules / v5 / my-promotion 单一来源一致）
 * 视觉：赭红渐变 hero 卡（对齐墨韵原型）
 */

export interface RankProgressProps {
  cvTotal?: number
  memberRank?: string
}

export default function RankProgress({ cvTotal = 0, memberRank }: RankProgressProps) {
  const idx = Math.max(0, TIERS.findIndex((t) => t.rank === memberRank))
  const cur = TIERS[idx]
  const next = TIERS[idx + 1]
  let percent = 100
  let remain = 0
  if (next) {
    const span = next.min - cur.min
    percent = Math.max(0, Math.min(100, Math.round(((cvTotal - cur.min) / span) * 100)))
    remain = Math.max(0, next.min - cvTotal)
  }
  return (
    <View className="rank-card">
      <View className="rank-top">
        <Text className="rank-title">少侠之路</Text>
        <Text className="rank-name">当前：{cur.rank}</Text>
      </View>
      <View className="rank-bar">
        <View className="rank-fill" style={{ width: `${percent}%` }} />
      </View>
      <View className="rank-foot">
        <Text>贡献值 {cvTotal}</Text>
        <Text>{next ? `距「${next.rank}」尚差 ${remain}` : '已臻化境'}</Text>
        <Text>成长 {percent}%</Text>
      </View>
    </View>
  )
}
