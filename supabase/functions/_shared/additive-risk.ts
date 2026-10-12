// 食品添加剂风险等级规范化 · 唯一事实源（single source of truth）
// ------------------------------------------------------------------
// ocr-ingredient 与 ingredient-analyze 共用本文件，避免「DB 的 L1-L4 → 规范档位」
// 的映射在两处各自实现、随迭代漂移（审计 R8）。
//
// DB food_additives.risk_level 已迁移为 L1/L2/L3/L4（迁移 00224）：
//   L4 → 最高风险（反式脂肪 / 亚硝酸盐 / 明矾等，legacy 'black'）
//   L3 → 限量关注（legacy 'yellow'）
//   L1/L2 → 安全（legacy 'white'）
// 同时兼容 legacy 字面值 black/yellow/white 与 high_risk/limit/safe。
//
// 客户端对应实现见 src/utils/additive-dictionary.ts 的 normalizeAdditiveRisk，
// 规则与本文件一致；如调整阈值，三处需同步。

export type RiskBand = 'white' | 'yellow' | 'black'
export type RiskSeverity = 'safe' | 'limit' | 'high_risk'

/** DB 风险码 → white/yellow/black 三档（兼容 legacy 描述）。 */
export function dbRiskToBand(risk?: string | null): RiskBand {
  if (!risk) return 'white'
  const s = String(risk).toUpperCase()
  if (s === 'L4' || s === 'BLACK' || s === 'HIGH_RISK') return 'black'
  if (s === 'L3' || s === 'YELLOW' || s === 'LIMIT') return 'yellow'
  return 'white' // L1 / L2 / WHITE / SAFE
}

/** DB 风险码 → safe/limit/high_risk 三档（ingredient-analyze 用语）。 */
export function dbRiskToSeverity(risk?: string | null): RiskSeverity {
  const band = dbRiskToBand(risk)
  if (band === 'black') return 'high_risk'
  if (band === 'yellow') return 'limit'
  return 'safe'
}
