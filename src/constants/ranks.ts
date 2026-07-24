// 会员段位单一来源：阈值 / 颜色 / 顺序全站统一，避免 5 处硬编码不一致。
// 颜色以 rank-rules 展示页权威色为准，消除 v5 / my-promotion 历史分歧。

export interface RankTier {
  rank: string
  min: number
  color: string
}

// 升序（凡心 → 无心境）
export const RANK_TIERS: RankTier[] = [
  { rank: '凡心', min: 0, color: '#90EE90' },
  { rank: '初心', min: 200, color: '#50C878' },
  { rank: '明心', min: 800, color: '#4A90D9' },
  { rank: '静心', min: 2000, color: '#CD7F32' },
  { rank: '悟心', min: 6000, color: '#9CA3AF' },
  { rank: '无心境', min: 20000, color: '#D4AF37' },
]

export const RANK_ORDER: string[] = RANK_TIERS.map((t) => t.rank)

export const RANK_COLOR_MAP: Record<string, string> = RANK_TIERS.reduce(
  (acc, t) => {
    acc[t.rank] = t.color
    return acc
  },
  {} as Record<string, string>,
)

export function getNextRankTier(currentRank: string): RankTier | undefined {
  const idx = RANK_TIERS.findIndex((t) => t.rank === currentRank)
  return idx >= 0 ? RANK_TIERS[idx + 1] : undefined
}
