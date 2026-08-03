const pages = [
  'pages/index/index',
  'pages/explore/index',
  'pages/cart/index',
  'pages/user/index',
  'pages/login/index',
  'pages/reset-password/index',
  'pages/product/index',
  'pages/store-home/index',
  'pages/payment/index',
  'pages/payment-result/index',
  'pages/order-center/index',
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
      'merchant-campaigns/index',
      'merchant-campaigns/create/index',
      'merchant-expiry/index',
      'merchant-batch/index',
      'food-therapy-copy/index',
    ],
  },
  {
    root: 'pages/mine',
    pages: [
      'my-badges/index',
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
    ],
  },
  {
    root: 'pages/trade',
    pages: ['withdraw/index', 'refund-apply/index', 'commission-detail/index', 'goldbean-ledger/index', 'partner-center/index', 'bean-exchange/index'],
  },
  {
    root: 'pages/admin',
    pages: [
      'admin/index',
      'admin-merchants/index',
      'admin-products/index',
      'admin-withdrawals/index',
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
    root: 'pages/marketing',
    pages: ['campaign-claim/index'],
  },
  {
    root: 'pages/food',
    pages: ['index', 'scan-result/index', 'food-scan/index', 'analysis-result/index', 'knowledge-atlas/index', 'seasonal-box/index', 'constitution-test/index', 'today-food-therapy/index', 'ingredient-pairing/index', 'consult/index', 'tracker/index', 'bmi/index', 'family/index', 'need-find/index', 'food-match/index'],
  },
  {
    root: 'pages/ext',
    pages: ['employee/index'],
  },
  {
    root: 'pages/expiry',
    pages: ['index'],
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
      { pagePath: 'pages/explore/index',   text: '好物' },
      { pagePath: 'pages/cart/index',      text: '购物车' },
      { pagePath: 'pages/user/index',      text: '我的' },
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
