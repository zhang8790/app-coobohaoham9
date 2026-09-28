const pages = [
  'pages/index/index',
  'pages/goods/index',
  'pages/goods/list/index',
  'pages/cart/index',
  'pages/user/index',
  'pages/login/index',
  'pages/register/index',
  'pages/reset-password/index',
  'pages/product/index',
  'pages/store-home/index',
  'pages/payment/index',
  'pages/payment-result/index',
  'pages/order-center/index',
  'pages/message-center/index',
  'pages/search/index',
  'pages/food-detective/index',
]

// 分包：按业务域拆分，降低主包体积（目标 < 1.5MB）
const subPackages = [
  {
    root: 'pages/merchant',
    pages: [
      'merchant-apply/index',
      'merchant-center/index',
      'merchant-products/index',
      'merchant-orders/index',
      'merchant-members/index',
      'merchant-coupons/index',
      'merchant-analytics/index',
      'merchant-settings/index',
      'merchant-expiry/index',
      'merchant-batch/index',
      'food-therapy-copy/index',
    ],
  },
  {
    root: 'pages/mine',
    pages: [
      'my-promotion/index',
      'address/index',
      'favorites/index',
      'footprint/index',
      'coupon/index',
      'settings/index',
      'bind-phone/index',
      'review/index',
      'my-referrals/index',
      'city-select/index',
      'messages/index',
    ],
  },
  {
    root: 'pages/trade',
    pages: ['withdraw/index', 'refund-apply/index', 'goldbean-ledger/index'],
  },
  {
    root: 'pages/agreement',
    pages: [
      'help/index',
      'privacy-policy/index',
      'user-agreement/index',
      'trade-rules/index',
      'withdraw-rules/index',
      'commission-rules/index',
      'rank-rules/index',
      'points-rules/index',
      'merchant-agreement/index',
      'distribution-agreement/index',
    ],
  },
  {
    root: 'pages/food',
    // 已下线孤儿页：seasonal-box / today-food-therapy / ingredient-pairing（食养中心收敛后失去全部入口）
    pages: ['index', 'scan-result/index', 'food-scan/index', 'analysis-result/index', 'constitution-test/index', 'consult/index', 'tracker/index', 'family/index', 'need-find/index', 'food-match/index'],
  },
  {
    root: 'pages/ext',
    // webview：首页广告位配置 http(s) 外链时的通用承载页（站内广告请优先配 /pages/... 内页）
    pages: ['employee/index', 'webview/index'],
  },
]

export default defineAppConfig({
  pages,
  subPackages,
  tabBar: {
    custom: true,           // 使用 custom-tabbar 内联手绘 SVG，去 AI 化
    color: '#666666',
    selectedColor: '#1A1A1A',
    backgroundColor: '#F7F3E9',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/index/index',     text: '首页' },
      { pagePath: 'pages/goods/index',   text: '好物' },
      { pagePath: 'pages/cart/index',      text: '购物车' },
      { pagePath: 'pages/user/index',      text: '我的' },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#F7F3E9',
    navigationBarTitleText: '来店有喜',
    navigationBarTextStyle: 'black',
  },
  // 组件按需注入：仅加载页面/组件实际用到的自定义组件，减小启动体积
  lazyCodeLoading: 'requiredComponents',
  // 分包预下载：进入触发页即后台拉取分包，消除「点进子菜单白屏等下载」
  // merchant 274KB / food 274KB / mine 150KB / trade 50KB —— wifi 下提前备好
  preloadRule: {
    'pages/user/index': { network: 'wifi', packages: ['pages/merchant', 'pages/mine', 'pages/trade'] },
    'pages/index/index': { network: 'wifi', packages: ['pages/food'] },
    'pages/goods/index': { network: 'wifi', packages: ['pages/food'] },
  },
  // 微信小程序隐私权限声明（基础库 3.7.0+ 要求）
  requiredPrivateInfos: ['getLocation'],
  // 微信小程序权限声明
  permission: {
    'scope.userLocation': {
      desc: '用于匹配就近门店，展示本地化商品',
    },
  },
})
