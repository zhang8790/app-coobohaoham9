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
    label: '药食同源方案库',
    emoji: '🌱',
    sub: '四季·忌口·搭配',
    url: '/pages/food/index',
    kind: 'page',
  },
  // 2026-08-06 战略去折扣化：临期特惠 / 限时福利（红包皮）属折扣零食赛道入口，
  // 已从首页金刚区摘除，避免与「价值主义 / 药食同源食疗零食」定位冲突。
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
  constitution: {
    id: 'constitution',
    label: '测体质',
    emoji: '🧬',
    sub: '九种体质',
    url: '/pages/food/constitution-test/index',
    kind: 'page',
  },
  family: {
    id: 'family',
    label: '家庭食养档案',
    emoji: '👨‍👩‍👧',
    sub: '过敏原红线',
    url: '/pages/food/family/index',
    kind: 'page',
  },
  knowledge: {
    id: 'knowledge',
    label: '食养知识图谱',
    emoji: '📚',
    sub: '配料·功效',
    url: '/pages/food/knowledge-atlas/index',
    kind: 'page',
  },
  pairing: {
    id: 'pairing',
    label: '食材搭配禁忌',
    emoji: '🥗',
    sub: '同食宜忌',
    url: '/pages/food/ingredient-pairing/index',
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
// 2026-08-06 战略改版：首页金刚区从「优惠福利」重构为「食养工具」，摘除临期特惠/限时福利折扣入口，
//   改挂功能型价值入口（测体质 / 家庭食养档案 / 食养知识图谱 / 食材搭配禁忌），
//   与「药食同源食疗零食 + 自研配料数据库壁垒」定位一致；食养方案库由首页 L2 大卡片单独承载。
export const HOME_ICON_ZONE: string[] = ['constitution', 'family', 'knowledge', 'pairing']
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
