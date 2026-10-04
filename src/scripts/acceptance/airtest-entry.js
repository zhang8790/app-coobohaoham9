// 小程序 UI 自动化入口（Airtest + 微信开发者工具）
// 本沙箱无法运行真机/模拟器，此文件为 CI 环境接入脚手架。
// 阶段2-2 小程序 UI 自动化检测项（规范）：
//   页面跳转：首页、商品详情、购物车、下单、个人中心、商户后台
//   表单交互：输入、下拉选择、上传图片、弹窗确认
//   授权检测：微信一键登录、手机号授权
//   兼容性：自动切换 iOS/安卓模拟器分辨率
// 重点校验：页面渲染错乱、按钮失效、弹窗遮挡、路由死循环
// 用法（CI 机器）：
//   airtest run airtest-entry.js --device Android:///  # 或 iOS
//   或由微信开发者工具 CLI 驱动：cli autoTest --project <app.json>
// 关键路由清单（供脚本断言页面可达、无死循环）：
const ROUTES = [
  'pages/index/index',          // 首页
  'pages/product/index',        // 商品详情（食养拍第一位 / 三轴 / 安全卡）
  'pages/food/index',           // 食养中心（轮播 banner）
  'pages/food/tongue/index',    // 舌象自评（13 步合并页）
  'pages/food/constitution-test/index', // 体质测试（断裂2 回写画像）
  'pages/cart/index',           // 购物车
  'pages/order/confirm',        // 下单确认
  'pages/user/index',           // 个人中心
  'pages/merchant/center',      // 商户后台
]
console.log('[airtest-entry] 路由清单已就绪，共', ROUTES.length, '个；请在 CI 环境由 Airtest 驱动执行。')
module.exports = { ROUTES }
