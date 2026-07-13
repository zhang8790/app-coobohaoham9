// 分享工具函数 - 基于数据库现有 bind_referrer() RPC
import Taro from '@tarojs/taro'
import type { Product } from '@/db/types'

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

    // 【新增】创建预归属记录（不登录也记录）
    const { createPendingReferral } = await import('@/db/api')
    await createPendingReferral({ referral_code: inviterCode })
    console.log('[handleInviterFromQuery] 已创建预归属记录:', inviterCode)

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

// ============ 商品卡分享（一定是产品 + 情绪表达词） ============

/**
 * 从商品中提炼一个简短的「情绪表达词」，用于分享标题。
 * 优先级：商品氛围标签 mood_tags[0]（最短、最像"词"）→ 编译情绪标题前 4 字 → 空。
 */
export function getProductEmotionWord(product: Product | null): string {
  if (!product) return ''
  const mood = product.mood_tags?.[0]
  if (mood) return mood
  const title = product.product_emotion?.emotion_title
  if (title) return title.slice(0, 4)
  return ''
}

/**
 * 构建「商品卡」分享配置：
 * - 一定是产品：分享图取商品主图、路径指向商品详情页 /pages/product/index?id=...
 * - 加情绪表达词：标题前缀注入商品的情绪词（如「治愈」云南小粒咖啡）
 * @param product 商品对象（必传，且为真实商品）
 * @param referralCode 当前用户推广码（好友扫码归属为推荐关系）
 */
export function buildProductShare(product: Product, referralCode: string) {
  const code = referralCode || ''
  const id = encodeURIComponent(product.id)
  const path = `/pages/product/index?id=${id}${code ? `&ref=${code}` : ''}`
  const query = `id=${id}${code ? `&ref=${code}` : ''}`
  const imageUrl = product.main_image || product.image_url || ''
  const word = getProductEmotionWord(product)
  const title = word ? `「${word}」${product.name}` : product.name
  const timelineTitle = word ? `${word}｜${product.name}` : product.name
  return { title, path, query, imageUrl, timelineTitle }
}

// ============ 文章分享（标题优化 + 摘要提取） ============

/**
 * 从文章中提取一段干净的摘要，用于分享海报/描述。
 * 优先顺序：summary 字段 → content 去 HTML 前 80 字 → 标题。
 */
export function extractArticleExcerpt(article: any, maxLength = 80): string {
  if (!article) return '发现一篇好文，快来看看~'
  if (article.summary && typeof article.summary === 'string') {
    return article.summary.slice(0, maxLength)
  }
  if (article.content && typeof article.content === 'string') {
    // 粗暴去标签：把 [[product:...]] 和内容 HTML 标签都去掉
    const plain = article.content
      .replace(/\[\[product:[\w-]+\]\]/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (plain.length > 0) {
      return plain.slice(0, maxLength)
    }
  }
  return (article.title || '发现一篇好文，快来看看~').slice(0, maxLength)
}

/**
 * 构建适合分享卡片的标题：
 * - 去掉运营/测试残留的后缀（如「预览时标签不可点」）
 * - 截断到 26 字，保留悬念
 * - 若标题太短，补一个情绪前缀增加点击欲
 */
export function buildArticleShareTitle(article: any): string {
  if (!article) return '来电有喜 - 好文推荐'
  let title = (article.title || '').trim()

  // 去掉常见的测试/调试后缀
  title = title
    .replace(/[\s]*预览时标签不可点[\s]*$/gi, '')
    .replace(/[\s]*测试[\s]*$/gi, '')
    .replace(/[\s]*test[\s]*$/gi, '')
    .trim()

  // 如果标题已经简短有力，直接返回
  if (title.length > 0 && title.length <= 26) {
    return title
  }

  // 否则截断，保留语义完整
  if (title.length > 26) {
    // 尽量在句号、冒号、分节处截断，保留钩子
    const cutMarks = ['：', '；', '。', '，', '！', '?', ' ']
    let bestCut = 26
    for (const mark of cutMarks) {
      const idx = title.lastIndexOf(mark, 26)
      if (idx > 14) {
        bestCut = idx + 1
        break
      }
    }
    return title.slice(0, bestCut) + (bestCut < title.length ? '…' : '')
  }

  // 标题为空时，用情绪词或摘要兜底
  const tags = article.tags || []
  const tag = tags[0] || ''
  const excerpt = extractArticleExcerpt(article, 22)
  if (tag) return `「${tag}」${excerpt}`
  return excerpt || '来电有喜 - 好文推荐'
}

