// 个人信息脱敏工具集（小程序端，与 admin-web 统一口径）
// 依据《个人信息保护法》：身份证/银行卡/支付宝账号为敏感个人信息，必须脱敏展示；
// 手机号、真实姓名、收货地址为个人信息，内部运营默认去标识化展示。

/** 身份证脱敏：保留前4后4，中间打码 */
export function maskIdCard(id?: string | null): string {
  if (!id) return '—'
  const s = id.trim()
  if (s.length <= 8) return s.slice(0, 1) + '********' + s.slice(-1)
  return s.slice(0, 4) + '*'.repeat(s.length - 8) + s.slice(-4)
}

/** 真实姓名脱敏：保留首尾各1字，中间打星 */
export function maskName(name?: string | null): string {
  if (!name) return '—'
  const s = name.trim()
  if (s.length <= 1) return s
  if (s.length === 2) return s[0] + '*'
  return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1]
}

/** 手机号脱敏：保留前3后4 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '—'
  const s = phone.trim()
  if (s.length <= 7) return s[0] + '****'
  return s.slice(0, 3) + '****' + s.slice(-4)
}

/** 收款账号脱敏（银行卡/微信仅显后4位；支付宝邮箱用户名打码） */
export function maskAccount(acc?: string | null, method?: string): string {
  if (!acc) return '—'
  if (method === 'alipay') {
    if (acc.includes('@')) {
      const [u, d] = acc.split('@')
      return (u.length <= 2 ? u : u.slice(0, 2) + '***') + '@' + d
    }
    return acc.length > 7 ? acc.slice(0, 3) + '****' + acc.slice(-2) : acc
  }
  return acc.slice(-4).padStart(acc.length, '·')
}

/** 收货地址脱敏：保留前6字，其余打码 */
export function maskAddress(addr?: string | null): string {
  if (!addr) return '—'
  const s = addr.trim()
  if (s.length <= 6) return s
  return s.slice(0, 6) + '*'.repeat(Math.min(s.length - 6, 8))
}
