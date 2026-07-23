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
  'pages/merchant-apply/index',
  'pages/merchant-center/index',
  'pages/withdraw/index',
  'pages/content-center/make/index',
  'pages/content-center/my-articles/index',
  'pages/refund-apply/index',
  'pages/my-promotion/index',
  'pages/address/index',
  'pages/favorites/index',
  'pages/footprint/index',
  'pages/coupon/index',
  'pages/help/index',
  'pages/settings/index',
  'pages/review/index',
  'pages/commission-detail/index',
  'pages/tongbao-ledger/index',
  'pages/admin/index',
  'pages/admin-merchants/index',
  'pages/admin-products/index',
  'pages/admin-withdrawals/index',
  'pages/admin-ugc/index',
  // 管理后台补充页面（与 admin-web 配对）
  'pages/admin-users/index',
  'pages/admin-refunds/index',
  'pages/admin-announcements/index',
  'pages/privacy-policy/index',
  'pages/user-agreement/index',
  // 协议/规则页面
  'pages/trade-rules/index',
  'pages/withdraw-rules/index',
  'pages/commission-rules/index',
  'pages/rank-rules/index',
  'pages/points-rules/index',
  'pages/merchant-agreement/index',
  'pages/distribution-agreement/index',
  // 自营门店管理中心（对齐 admin-web）
  'pages/merchant-products/index',
  'pages/merchant-orders/index',
  'pages/merchant-members/index',
  'pages/merchant-coupons/index',
  'pages/merchant-analytics/index',
  'pages/merchant-settings/index',
  'pages/my-referrals/index',
  'pages/employee/index',
  'pages/article-detail/index',
  // V4：多区域架构 + LBS定位 + 红包实物引流
  'pages/city-select/index',
  'pages/campaign-claim/index',
  'pages/merchant-campaigns/index',
  'pages/merchant-campaigns/create/index',
  // （情绪前台交互已隐藏：情绪信号转为后台算法维度，不再作为 C 端/商家前台页面）
  // 通知中心
  'pages/messages/index',
  // 扫码购物结果页（扫码 → 展示商品/价格 → 加入购物车）
  'pages/scan-result/index',
  // 食品配料安全识别（C端：文本/拍照解析添加剂安全 + 食养）
  'pages/food-scan/index',
  // 用户结构化健康画像（V1 食疗个性化，「我的体质档案」）
  'pages/health-profile/index',
]

export default defineAppConfig({
  pages,
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
  // 微信小程序隐私权限声明（基础库 3.7.0+ 要求）
  requiredPrivateInfos: ['getLocation'],
  // 微信小程序权限声明
  permission: {
    'scope.userLocation': {
      desc: '用于匹配就近门店，展示本地化商品',
    },
  },
})
