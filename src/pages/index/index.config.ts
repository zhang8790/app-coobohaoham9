export default definePageConfig({
  // 自定义导航栏：去掉原生白色标题栏，让绿色主视觉真正沉到状态栏（首页沉浸式顶栏）
  // 状态栏文字用白色，避免白字压白底 / 黑字压绿底看不清
  navigationStyle: 'custom',
  navigationBarTextStyle: 'white',
  navigationBarTitleText: '来店有喜',
  enableShareAppMessage: true,
  enableShareTimeline: true,
  enablePullDownRefresh: true,
  backgroundTextStyle: 'dark',
})
