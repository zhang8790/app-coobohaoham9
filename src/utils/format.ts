// 日期/时间格式化工具（单一数据源，避免各页面重复定义小工具）
// 行为说明：
//   formatRelativeTime —— 相对时间（刚刚 / X分钟前 / X小时前 / X天前），超过 7 天回退本地日期
//   formatDateTime      —— 绝对时间 YYYY-MM-DD HH:mm（空/非法输入返回 ''）

/** 相对时间：刚刚 / X分钟前 / X小时前 / X天前；超过 7 天显示本地日期 */
export function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}天前`
  return d.toLocaleDateString('zh-CN')
}

/** 绝对时间：YYYY-MM-DD HH:mm；空或非法输入返回空串 */
export function formatDateTime(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
