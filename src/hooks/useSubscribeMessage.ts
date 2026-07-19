// useSubscribeMessage 钩子
// 职责：
//   1) 引导用户授权「订阅消息」（一次性）
//   2) 持久化授权记录到本地（localStorage / Taro.setStorageSync）
//   3) 提供「已授权 + 5 模板 ID 都 OK」的查询
// 设计：
//   - 用户进首页/订单中心/佣金页时，弹一次 wx.requestSubscribeMessage（5 个模板）
//   - 拒绝则 7 天内不再弹
//   - 微信订阅消息每次推送都需要「用户主动订阅」，本钩子仅给"已订阅过"的状态查询
import Taro from '@tarojs/taro'

const STORAGE_KEY = 'wulinsen.notif.accept'
const LAST_PROMPT_KEY = 'wulinsen.notif.lastPrompt'
const COOLDOWN_DAYS = 7

// 与云函数 send-notification 的 5 个 type 一一对应
export const NOTIF_TMPL_IDS = {
  order_paid: '',
  commission_arrived: '',
  withdraw_progress: '',
  refund_result: '',
  announcement: '',
}

/**
 * 检查是否在 cooldown（7 天内已拒绝）
 */
export function isInCooldown(): boolean {
  try {
    const last = Taro.getStorageSync(LAST_PROMPT_KEY) as string | undefined
    if (!last) return false
    const lastDate = new Date(last)
    const now = new Date()
    const diff = (now.getTime() - lastDate.getTime()) / 1000 / 86400
    return diff < COOLDOWN_DAYS
  } catch {
    return false
  }
}

/**
 * 弹一次订阅消息授权。
 * 至少传 1 个 tmplId 才能弹（微信规则：全部「不再询问」= 全失败）。
 * 返回 { accepted: string[], rejected: string[] }
 */
export async function requestSubscribeMessage(tmplIds: string[]): Promise<{ accepted: string[]; rejected: string[] }> {
  if (tmplIds.length === 0) return { accepted: [], rejected: [] }
  try {
    const res = await Taro.requestSubscribeMessage({ tmplIds })
    const accepted: string[] = []
    const rejected: string[] = []
    for (const id of tmplIds) {
      if (res[id] === 'accept') accepted.push(id)
      else rejected.push(id)
    }
    if (accepted.length > 0) {
      Taro.setStorageSync(STORAGE_KEY, new Date().toISOString())
    } else {
      Taro.setStorageSync(LAST_PROMPT_KEY, new Date().toISOString())
    }
    return { accepted, rejected }
  } catch (e) {
    console.warn('[useSubscribeMessage] request fail', e)
    return { accepted: [], rejected: [] }
  }
}

/**
 * 在合适的时机（如支付成功、佣金到账后）主动引导用户授权。
 * - 不在 cooldown
 * - 用户未授权过（可选 check）
 * - 弹窗最多 5 个 tmplId（超过按 5 个截断）
 */
export async function maybePromptSubscribe(context: 'payment_success' | 'commission_arrived' | 'withdraw' | 'manual' = 'manual'): Promise<void> {
  if (isInCooldown()) return

  // 取已配置的 tmplId（空字符串 = 未配置，跳过）
  const tmplIds = [
    NOTIF_TMPL_IDS.order_paid,
    NOTIF_TMPL_IDS.commission_arrived,
    NOTIF_TMPL_IDS.withdraw_progress,
    NOTIF_TMPL_IDS.refund_result,
    NOTIF_TMPL_IDS.announcement,
  ].filter(id => !!id).slice(0, 5)

  if (tmplIds.length === 0) {
    console.warn('[useSubscribeMessage] 无 tmplId 配置，跳过引导')
    return
  }

  // 仅在合适场景主动弹
  if (context === 'manual') return
  if (context === 'payment_success' && !NOTIF_TMPL_IDS.order_paid) return
  if (context === 'commission_arrived' && !NOTIF_TMPL_IDS.commission_arrived) return
  if (context === 'withdraw' && !NOTIF_TMPL_IDS.withdraw_progress) return

  await requestSubscribeMessage(tmplIds)
}

/**
 * 用户是否曾经授权过（任一模板 accept）
 */
export function hasAccepted(): boolean {
  try {
    return !!Taro.getStorageSync(STORAGE_KEY)
  } catch {
    return false
  }
}
