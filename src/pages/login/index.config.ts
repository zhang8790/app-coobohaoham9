export default definePageConfig({
  navigationBarTitleText: '登录',
  // 故意不用 custom：保留微信原生导航栏，让用户始终能看到"返回"胶囊（微信 3.1.4 登录规范）
  navigationStyle: 'default',
  enableShareAppMessage: true,
  enableShareTimeline: true,
})
