/**
 * 支付页面调试脚本
 * 
 * 使用方法：
 * 1. 在微信开发者工具中打开调试控制台
 * 2. 复制本脚本内容到控制台执行
 * 3. 查看输出结果
 */

console.log('========== 支付页面调试开始 ==========')

// 1. 检查本地开发模式
console.log('\n【1. 本地开发模式检查】')
console.log('TARO_APP_LOCAL_DEV:', process.env.TARO_APP_LOCAL_DEV || '未设置')
console.log('当前环境:', __wxConfig?.envVersion || '未知')

// 2. 检查用户登录状态
console.log('\n【2. 用户登录状态检查】')
const checkLogin = () => {
  try {
    const userStr = wx.getStorageSync('user')
    const token = wx.getStorageSync('token')
    console.log('本地存储 - user:', userStr ? '存在' : '不存在')
    console.log('本地存储 - token:', token ? '存在' : '不存在')
    
    if (userStr) {
      const user = JSON.parse(userStr)
      console.log('用户ID:', user.id)
      console.log('用户手机号:', user.phone)
      console.log('推荐码:', user.referral_code)
    }
  } catch (e) {
    console.error('检查登录状态失败:', e)
  }
}
checkLogin()

// 3. 检查购物车数据
console.log('\n【3. 购物车数据检查】')
const checkCart = () => {
  try {
    // 模拟调用 getCartItems
    console.log('提示：请在购物车页面查看商品列表')
    console.log('如果没有商品，请先添加商品到购物车')
  } catch (e) {
    console.error('检查购物车失败:', e)
  }
}
checkCart()

// 4. 测试支付页面跳转
console.log('\n【4. 支付页面跳转测试】')
const testPaymentNavigation = () => {
  console.log('测试场景1：从购物车跳转')
  console.log('  预期URL: /pages/payment/index?cartIds=xxx&total=xx.xx')
  console.log('  实际检查：')
  console.log('  - 购物车页面是否有商品？')
  console.log('  - 商品是否勾选？')
  console.log('  - 点击"结算"按钮是否有反应？')
  
  console.log('\n测试场景2：从商品详情页跳转')
  console.log('  预期URL: /pages/payment/index?productId=xxx&total=xx.xx')
  console.log('  实际检查：')
  console.log('  - 商品详情页是否正常显示？')
  console.log('  - 点击"立即购买"是否有反应？')
}

testPaymentNavigation()

// 5. 常见错误和解决方案
console.log('\n【5. 常见错误和解决方案】')
console.log(`
错误1：点击"结算"无反应
  原因：没有勾选商品
  解决：勾选至少一个商品

错误2：支付页面空白
  原因：参数传递错误
  解决：检查URL参数是否正确

错误3：支付页面报错"total参数缺失"
  原因：cartIds或productId参数解析失败
  解决：检查购物车页面跳转逻辑

错误4：无法调用微信支付
  原因：本地开发模式不支持真实支付
  解决：使用Mock支付（自动模拟成功）

错误5：页面跳转失败
  原因：路由配置错误
  解决：检查 app.config.ts 是否包含 payment 页面
`)

// 6. 手动测试支付页面
console.log('\n【6. 手动测试支付页面】')
console.log('复制以下代码到控制台执行，手动跳转支付页面：')

const mockCartIds = 'cart-mock-001,cart-mock-002' // 模拟购物车ID
const mockTotal = '36.00' // 模拟总金额

console.log(`
// 方法1：跳转支付页面（购物车场景）
wx.navigateTo({
  url: '/pages/payment/index?cartIds=${mockCartIds}&total=${mockTotal}',
  success: () => console.log('跳转成功'),
  fail: (err) => console.error('跳转失败:', err)
})

// 方法2：跳转支付页面（直接购买场景）
wx.navigateTo({
  url: '/pages/payment/index?productId=prod-001&total=12.00',
  success: () => console.log('跳转成功'),
  fail: (err) => console.error('跳转失败:', err)
})
`)

console.log('\n========== 调试脚本结束 ==========')
console.log('如果遇到问题，请截图控制台输出并反馈！')
