/**
 * 八大场景「展示名」单一事实源
 *
 * 为什么存在：DB `store_categories.name` 是后台可编辑的管理数据，存在多个历史写法
 * （初始种子 20260921 写入「熬夜加班」，另有「银发呵护/睡前安适…」等旧名），
 * 而品牌拍板的 C 端展示名是另一套（见 20260927_rename_scenes_to_replica.sql）。
 * 每个页面各自写一份映射必然漂移 → 首页金刚区显示「熬夜加餐」、好物左栏显示「熬夜加班」这种自相矛盾。
 *
 * 用法：所有面向用户的类目名渲染（首页金刚区 / 好物页左栏 / 类目落地页标题 / 二级 Tab）
 * 一律走 sceneLabel(name)。**取数/筛选仍用 DB 原名**（id 或 name），只在渲染层映射，
 * 这样后台改名后前端立即可见新名，等 DB 正式改名后本映射自动失效。
 */

export const SCENE_ALIAS: Record<string, string> = {
  // 旧 → 新（replica 拍板名）
  '银发呵护': '老年养生',
  '睡前安适': '舒心食养',
  '体虚调理': '温润食养',
  '肠胃养护': '肠胃食养',
  '熬夜党': '熬夜加餐',
  // DB 种子直接写入的变体：「熬夜加班」而非「熬夜党」，同样归一到拍板名
  '熬夜加班': '熬夜加餐',
}

/** 把 DB 类目名映射为 C 端展示名；无别名时原样返回 */
export function sceneLabel(name: string | undefined | null): string {
  if (!name) return ''
  return SCENE_ALIAS[name] ?? name
}
