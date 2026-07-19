// 实时购物车冲突校验（方案「核心引擎③」）
// 检测：温补叠加 / 寒热对冲 / 同属性过量 / 商家显式相克
// 返回按严重度分级的冲突提示，供结算页弹窗与收银后台复用。

import type { FoodTherapyInput } from './types'
import { resolveNature } from './nature'

export type ConflictType = 'warm_overlap' | 'cold_hot_clash' | 'same_attr_overload' | 'explicit_conflict'

export interface CartConflict {
  type: ConflictType
  level: 'warn' | 'danger'
  products: string[] // 涉及的商品 id
  message: string
}

const WARM: ReadonlySet<string> = new Set(['微温', '温热', '大热'])
const COLD: ReadonlySet<string> = new Set(['大寒', '寒凉'])

export function checkCartConflicts(items: FoodTherapyInput[]): CartConflict[] {
  const conflicts: CartConflict[] = []
  if (!items.length) return conflicts

  const withNature = items.map((i) => ({ item: i, nature: resolveNature(i) }))
  const warmItems = withNature.filter((x) => x.nature && WARM.has(x.nature!))
  const coldItems = withNature.filter((x) => x.nature && COLD.has(x.nature!))

  // 1. 温补叠加：>=2 温热/大热
  if (warmItems.length >= 2) {
    conflicts.push({
      type: 'warm_overlap',
      level: 'warn',
      products: warmItems.map((x) => x.item.id),
      message: `检测到 ${warmItems.length} 份温补类餐品（${warmItems
        .map((x) => x.item.name)
        .join('、')}），叠加易上火，建议二选一或搭配凉润饮品`,
    })
  }

  // 2. 寒热对冲：热 + 寒同时存在
  if (warmItems.length && coldItems.length) {
    conflicts.push({
      type: 'cold_hot_clash',
      level: 'danger',
      products: [...warmItems.map((x) => x.item.id), ...coldItems.map((x) => x.item.id)],
      message: `「寒热对冲」：${warmItems
        .map((x) => x.item.name)
        .join('、')} 偏温热，${coldItems
        .map((x) => x.item.name)
        .join('、')} 偏寒凉，同餐易刺激肠胃，建议错开时段食用`,
    })
  }

  // 3. 同属性过量：某 health_tag 出现在 >=3 个商品
  const tagCount: Record<string, string[]> = {}
  for (const i of items) {
    for (const t of i.health_tag ?? []) {
      ;(tagCount[t] ||= []).push(i.id)
    }
  }
  for (const [tag, ids] of Object.entries(tagCount)) {
    if (ids.length >= 3) {
      conflicts.push({
        type: 'same_attr_overload',
        level: 'warn',
        products: ids,
        message: `「${tag}」类功效在购物车出现 ${ids.length} 份，建议适量，避免单一功效过量`,
      })
    }
  }

  // 4. 商家显式相克：conflict_goods 互指
  const idSet = new Set(items.map((i) => i.id))
  for (const i of items) {
    const cf = (i.conflict_goods ?? []).filter((id) => idSet.has(id))
    if (cf.length) {
      const names = items.filter((x) => cf.includes(x.id)).map((x) => x.name)
      conflicts.push({
        type: 'explicit_conflict',
        level: 'danger',
        products: [i.id, ...cf],
        message: `「${i.name}」与「${names.join(
          '、',
        )}」为商家标注的相克/慎搭组合，建议分开点`,
      })
    }
  }

  return conflicts
}
