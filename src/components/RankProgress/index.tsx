import { View, Text } from '@tarojs/components'

/**
 * 段位成长可视化（纯展示，读取现有 member_rank + cv_total，不新增任何字段/功能）
 * 阈值与 src/pages/rank-rules 公布阶梯一致：凡心0/初心200/明心800/静心2000/悟心6000/无心境20000
 * 视觉：赭红渐变 hero 卡（对齐墨韵原型）
 */
const TIERS: { rank: string; min: number }[] = [
  { rank: '凡心', min: 0 },
  { rank: '初心', min: 200 },
  { rank: '明心', min: 800 },
  { rank: '静心', min: 2000 },
  { rank: '悟心', min: 6000 },
  { rank: '无心境', min: 20000 },
]

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
