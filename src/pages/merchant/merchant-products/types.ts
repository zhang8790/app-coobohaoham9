// 商品管理（商家端）共享工具与类型

// 毛利计算（列表与编辑端复用）
export function calcMargin(price: number, cost?: number): string {
  if (!cost || cost <= 0 || price <= 0) return '-'
  return ((price - cost) / price * 100).toFixed(1) + '%'
}

export type Revenue = {
  totalRevenue: number
  totalProfit: number
  totalSales: number
}
