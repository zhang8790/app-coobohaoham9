// ============================================================
// 全站唯一导航登记册（Single Source of Truth）
// ------------------------------------------------------------
// 设计目的：根治「同一功能/页面在多处以不同标签重复出现」的顽疾。
//   过去食养中心在首页叫「食养中心」、在「我的」页叫「食养服务中心」，
//   本质就是每个页面各自硬编码一份入口清单，没有统一权威。
//
// 使用约定（铁律）：
//   1. 任何「功能/页面入口」只在此处定义一次，用稳定 id 引用；
//   2. label 是规范展示名，全站唯一 —— 禁止同一 url 拥有两个不同 label；
//   3. 加新功能 = 在此加一条 NAV 记录 + 把它塞进对应顺序数组，不要在页面里就地 new；
//   4. 顺序数组（HOME_ICON_ZONE / USER_SERVICE_CENTER）只存 id，渲染层按 id 取 NAV。
// ============================================================

export type NavKind = 'page' | 'campaign' | 'external'

export interface NavEntry {
  id: string          // 稳定唯一 id，跨页面引用用
  label: string       // 规范展示名（全站唯一，禁止同目的地多名字）
  emoji: string       // 入口图标（emoji，统一视觉语言）
  sub?: string        // 副标题/一句话说明
  url?: string        // page 类跳转地址；campaign/external 可不填
  kind: NavKind       // page=普通页跳转；campaign=活动（走回调）；external=外链
}

// ---- 1) 所有目的地在此登记一次 ----
export const NAV: Record<string, NavEntry> = {
  food: {
    id: 'food',
    label: '食养中心',
    emoji: '🌱',
    sub: '体质·节气·方案',
    url: '/pages/food/index',
    kind: 'page',
  },
  expiry: {
    id: 'expiry',
    label: '临期特惠',
    emoji: '⏰',
    sub: '捡漏好物',
    url: '/pages/expiry/index',
    kind: 'page',
  },
  campaign: {
    id: 'campaign',
    label: '限时福利',
    emoji: '🎁',
    sub: '红包实物',
    kind: 'campaign',
  },
  coupon: {
    id: 'coupon',
    label: '会员福利',
    emoji: '🎫',
    sub: '金豆权益',
    url: '/pages/mine/coupon/index',
    kind: 'page',
  },
  brand: {
    id: 'brand',
    label: '了解来电有喜',
    emoji: '🌟',
    url: '/pages/brand-story/index',
    kind: 'page',
  },
  help: {
    id: 'help',
    label: '联系客服',
    emoji: '🛎',
    url: '/pages/agreement/help/index',
    kind: 'page',
  },
}

// ---- 2) 各页面只声明「展示哪些、什么顺序」（存 id，不存 label/url）----
export const HOME_ICON_ZONE: string[] = ['food', 'expiry', 'campaign', 'coupon']
export const USER_SERVICE_CENTER: string[] = ['food', 'brand', 'help']

// ---- 3) 开发期校验：同一 url 绝不允许出现两次（防止未来再次重复）----
if (process.env.NODE_ENV !== 'production') {
  const seen = new Map<string, string>()
  for (const e of Object.values(NAV)) {
    if (!e.url) continue
    const prev = seen.get(e.url)
    if (prev) {
      // eslint-disable-next-line no-console
      console.warn(
        `[nav-registry] 重复目的地：${e.url} 同时被「${prev}」和「${e.id}」占用，` +
        `会导致同一功能以不同标签出现。请合并为一条。`,
      )
    } else {
      seen.set(e.url, e.id)
    }
  }
}
