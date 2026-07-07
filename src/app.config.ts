const pages = [
  'pages/index/index',
  'pages/explore/index',
  'pages/reward-shop/index',
  'pages/cart/index',
  'pages/user/index',
  'pages/login/index',
  'pages/product/index',
  'pages/store-home/index',
  'pages/payment/index',
  'pages/order-center/index',
  'pages/search/index',
  'pages/ugc-publish/index',
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
  // 协议/规则页面（合规化）
  'pages/trade-rules/index',
  'pages/withdraw-rules/index',
  'pages/commission-rules/index',
  'pages/rank-rules/index',
  'pages/points-rules/index',
  'pages/merchant-agreement/index',
  // 商家管理中心（对齐 admin-web）
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
  // V5：情绪系统
  'pages/emotion-check/index',
  // 商家情绪编译工作台
  'pages/merchant-emotion-compile/index',
  // V5：五屏情绪详情页（C端沉浸式情绪导购）
  'pages/emotion-detail/index',
  // V5：商家情绪漏斗看板
  'pages/merchant-emotion-funnel/index',
  // V5：消费即确权页（支付成功后引导）
  'pages/emotion-claim/index',
  // V5：我的情绪账单（用户侧确权集 + 通宝）
  'pages/emotion-bill/index',
  // V5 P2-1：我的情绪徽章
  'pages/emotion-badges/index',
]

export default defineAppConfig({
  pages,
  tabBar: {
    color: '#9A8070',
    selectedColor: '#C2410C',
    backgroundColor: '#FFFBF7',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: './assets/icons/home_unselected.png',
        selectedIconPath: './assets/icons/home_selected.png',
      },
      {
        pagePath: 'pages/explore/index',
        text: '探索',
        iconPath: './assets/icons/explore_unselected.png',
        selectedIconPath: './assets/icons/explore_selected.png',
      },
      {
        pagePath: 'pages/reward-shop/index',
        text: '犒赏铺',
        iconPath: './assets/icons/reward_unselected.png',
        selectedIconPath: './assets/icons/reward_selected.png',
      },
      {
        pagePath: 'pages/cart/index',
        text: '行囊',
        iconPath: './assets/icons/cart_unselected.png',
        selectedIconPath: './assets/icons/cart_selected.png',
      },
      {
        pagePath: 'pages/user/index',
        text: '侠客',
        iconPath: './assets/icons/user_unselected.png',
        selectedIconPath: './assets/icons/user_selected.png',
      },
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
