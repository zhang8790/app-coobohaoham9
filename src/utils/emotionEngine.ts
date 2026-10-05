// 情绪子系统已于前端下线（首页"情绪不再参与前台"），商品流改用食养适配度分档。
// 本文件仅保留被首页/推荐流复用的商品评分类型，不再包含任何运行时代码。

export interface ScoredProduct<T> {
  product: T
  matchScore: number
  matchLabel: string | null // "完美契合" / "较好匹配" / null
}
