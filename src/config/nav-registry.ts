// ============================================================
// 全站唯一导航登记册（Single Source of Truth）
// ------------------------------------------------------------
// 设计目的：根治「同一功能/页面在多处以不同标签重复出现」的顽疾。
// 过去食养中心在首页叫「食养中心」、在「我的」页叫「食养服务中心」，
// 本质就是每个页面各自硬编码一份入口清单，没有统一权威。
// 使用约定（铁律）：
// 1. 任何「功能/页面入口」只在此处定义一次，用稳定 id 引用；
// 2. label 是规范展示名，全站唯一 —— 禁止同一 url 拥有两个不同 label；
// 3. 加新功能 = 在此加一条 NAV 记录 + 把它塞进对应顺序数组，不要在页面里就地 new；
// 4. 顺序数组（HOME_ICON_ZONE / USER_SERVICE_CENTER）只存 id，渲染层按 id 取 NAV。
// ============================================================

export type NavKind = 'page' | 'campaign' | 'external'

export interface NavEntry {
 id: string // 稳定唯一 id，跨页面引用用
 label: string // 规范展示名（全站唯一，禁止同目的地多名字）
 emoji: string // 入口图标（emoji，统一视觉语言）
 icon?: string // 线性图标名（见 components/Icon/iconBase64.ts 白名单），入口列表优先用它
 sub?: string // 副标题/一句话说明
 url?: string // page 类跳转地址；campaign/external 可不填
 kind: NavKind // page=普通页跳转；campaign=活动（走回调）；external=外链
}

// ---- 1) 所有目的地在此登记一次 ----
export const NAV: Record<string, NavEntry> = {
 food: {
   id: 'food',
   label: '食养中心',
   emoji: '',
   icon: 'leaf',
   sub: '体质·节气·方案',
   url: '/pages/food/index',
   kind: 'page',
 },
 coupon: {
   id: 'coupon',
   label: '我的优惠券',
   emoji: '',
   icon: 'ticket',
   sub: '金豆权益',
   url: '/pages/mine/coupon/index',
   kind: 'page',
 },
  help: {
   id: 'help',
   label: '帮助中心',
   emoji: '',
   icon: 'headset',
   url: '/pages/agreement/help/index',
   kind: 'page',
 },
 // 账号手机号身份（登录凭证）：微信登录的账号没有手机号，无法用「手机号+密码」
 // 登录网页版管理后台，总后台也搜不到该用户。入口在「设置—账号安全 / 个人资料-手机号」。
 bindPhone: {
   id: 'bindPhone',
   label: '绑定手机号',
   emoji: '',
   icon: 'phone',
   sub: '用于登录管理后台与账号找回',
   url: '/pages/mine/bind-phone/index',
   kind: 'page',
 },
 // 门店运营身份自助绑定（邀请码）：总后台/网页门店中心生成的邀请码，
 // 由运营者本人用微信登录后在此兑换 → upsert store_staff → 直达门店管理中心。
 // 2026-09-17：该页此前只在 app.config.ts 注册、全站零入口，导致「审核已通过但
 // 门店没绑到账号」的用户彻底无路可进管理后台。
 merchantBind: {
   id: 'merchantBind',
   label: '输入邀请码绑定门店',
   emoji: '',
   icon: 'qrcode-scan',
   sub: '绑定已有门店的运营身份',
   url: '/pages/ext/employee/index',
   kind: 'page',
 },
}

// ---- 2) 各页面只声明「展示哪些、什么顺序」（存 id，不存 label/url）----
// 2026-09-15：移除临期特惠/限时福利金刚区（与「拒绝折扣零食内卷」价值主义铁律冲突），
// 首页金刚区仅保留「食养中心」单一入口，杜绝 C 端折扣/促销/社会证明曝光。
export const HOME_ICON_ZONE: string[] = ['food']
// 2026-10-01：按张林要求从「我的」页撤掉「绑定手机号」「输入邀请码绑定门店」两个入口
// （该页改为大厂式「我的服务」宫格，见 pages/user/index.tsx 的 SERVICE_GRID）。
// ⚠️ 对应 NAV 定义（bindPhone / merchantBind）**保留**——设置页、商家申请页仍引用，
// 功能链路未删，仅不再出现在「我的」页。
export const USER_SERVICE_CENTER: string[] = ['food', 'help']

// ---- 3) 开发期校验：同一 url 绝不允许出现两次（防止未来再次重复）----
if (process.env.NODE_ENV !== 'production') {
 const seen = new Map<string, string>()
 for (const e of Object.values(NAV)) {
 if (!e.url) continue
 const prev = seen.get(e.url)
 if (prev) {
 console.warn(
 `[nav-registry] 重复目的地：${e.url} 同时被「${prev}」和「${e.id}」占用，` +
 `会导致同一功能以不同标签出现。请合并为一条。`,
 )
 } else {
 seen.set(e.url, e.id)
 }
 }
}
