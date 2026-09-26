export default definePageConfig({
  // 自定义导航栏：去掉原生白色标题栏，让绿色主视觉真正沉到状态栏（与首页 hero 拉齐品牌感）
  navigationStyle: 'custom',
  navigationBarTextStyle: 'white',
  navigationBarTitleText: '我的',
  enableShareAppMessage: true,
  enableShareTimeline: true,
})
