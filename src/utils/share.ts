// 分享工具函数 - 基于数据库现有 bind_referrer() RPC
import Taro from '@tarojs/taro'

// 获取当前用户的推广码（用于分享）
// 新用户注册时数据库触发器会自动生成，这里只需要读取
export async function getMyReferralCode(): Promise<string> {
  const { supabase } = await import('@/client/supabase')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ''

  const { data } = await supabase
    .from('profiles')
    .select('invite_code')
    .eq('id', user.id)
    .maybeSingle()

  return data?.invite_code || ''
}

// 构建带推广参数的分享路径
export function buildSharePath(path: string, referralCode: string): string {
  if (!referralCode) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}inviter=${referralCode}`
}

// 通用分享给好友配置（用于 onShareAppMessage）
export async function getShareAppMessage(
  title: string,
  path: string,
  imageUrl?: string
) {
  const code = await getMyReferralCode()
  const fullPath = buildSharePath(path, code)

  return {
    title,
    path: fullPath,
    imageUrl,
  }
}

// 通用分享到朋友圈配置（用于 onShareTimeline）
export async function getShareTimeline(
  title: string,
  path: string,
  imageUrl?: string
) {
  const code = await getMyReferralCode()
  const fullPath = buildSharePath(path, code)

  return {
    title,
    query: fullPath.split('?')[1] || '',
    imageUrl,
  }
}

// 读取进入小程序时的推广码参数，并自动绑定推荐关系
// 支持两种参数名：ref（登录页在用）、inviter（分享标准名）
export async function handleInviterFromQuery(): Promise<void> {
  try {
    const instance = Taro.getCurrentInstance()
    const query = instance.router?.params || {}
    // 支持 ref 和 inviter 两种参数名
    const inviterCode = (query as any).ref as string | undefined
      || (query as any).inviter as string | undefined
    if (!inviterCode) return

    const { supabase } = await import('@/client/supabase')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      Taro.setStorageSync('pendingReferralCode', inviterCode)
      return
    }

    await supabase.rpc('bind_referrer', { p_referral_code: inviterCode })
    Taro.removeStorageSync('pendingReferralCode')
  } catch (e) {
    console.error('处理推广码失败', e)
  }
}

// 登录后检查是否有待绑定的推广码
export async function bindPendingInviter(): Promise<void> {
  try {
    const pending = Taro.getStorageSync('pendingReferralCode') as string | undefined
    if (!pending) return
    const { supabase } = await import('@/client/supabase')
    await supabase.rpc('bind_referrer', { p_referral_code: pending })
    Taro.removeStorageSync('pendingReferralCode')
  } catch (e) {
    console.error('绑定待处理推广码失败', e)
  }
}
