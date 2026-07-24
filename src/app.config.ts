const pages = [
  'pages/index/index',
  'pages/explore/index',
  'pages/cart/index',
  'pages/user/index',
  'pages/login/index',
  'pages/product/index',
  'pages/store-home/index',
  'pages/payment/index',
  'pages/payment-result/index',
  'pages/order-center/index',
  'pages/search/index',
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
      'merchant-campaigns/index',
      'merchant-campaigns/create/index',
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
      'review/index',
      'my-referrals/index',
      'city-select/index',
      'messages/index',
      'health-profile/index',
    ],
  },
  {
    root: 'pages/trade',
    pages: ['withdraw/index', 'refund-apply/index', 'commission-detail/index', 'tongbao-ledger/index'],
  },
  {
    root: 'pages/admin',
    pages: [
      'admin/index',
      'admin-merchants/index',
      'admin-products/index',
      'admin-withdrawals/index',
      'admin-ugc/index',
      'admin-users/index',
      'admin-refunds/index',
      'admin-announcements/index',
    ],
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
    root: 'pages/content',
    pages: ['content-center/make/index', 'content-center/my-articles/index', 'article-detail/index'],
  },
  {
    root: 'pages/marketing',
    pages: ['campaign-claim/index'],
  },
  {
    root: 'pages/food',
    pages: ['scan-result/index', 'food-scan/index'],
  },
  {
    root: 'pages/ext',
    pages: ['employee/index'],
  },
]

export default defineAppConfig({
  pages,
  subPackages,
  tabBar: {
    custom: true,           // 使用 custom-tabbar 内联手绘 SVG，去 AI 化
    color: '#9A8070',
    selectedColor: '#1A1A1A',
    backgroundColor: '#FFFBF7',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/index/index',     text: '首页' },
      { pagePath: 'pages/explore/index',   text: '自营' },
      { pagePath: 'pages/cart/index',      text: '行囊' },
      { pagePath: 'pages/user/index',      text: '侠客' },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FFFBF7',
    navigationBarTitleText: '来电有喜',
    navigationBarTextStyle: 'black',
  },
  // 组件按需注入：仅加载页面/组件实际用到的自定义组件，减小启动体积
  lazyCodeLoading: 'requiredComponents',
  // 微信小程序隐私权限声明（基础库 3.7.0+ 要求）
  requiredPrivateInfos: ['getLocation'],
  // 微信小程序权限声明
  permission: {
    'scope.userLocation': {
      desc: '用于匹配就近门店，展示本地化商品',
    },
  },
})
