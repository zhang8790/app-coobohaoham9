# 支付功能测试环境准备和调试指南

## 📋 测试环境配置

### 1. 本地开发模式（已配置✅）

**文件：`.env.production`**
```bash
TARO_APP_LOCAL_DEV=true
TARO_APP_SUPABASE_URL=https://7072-prod-8g5pltml320f00dd-1421479585.tcb.qcloud.la/projects/supabase330158129083891712
TARO_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**说明：**
- ✅ 本地开发模式已启用
- ✅ 使用Mock数据（无需真实后端）
- ✅ 测试账号：`18701410500`，验证码：`123456`

---

## 🐛 问题诊断：为什么进入不了支付页面？

### 可能原因1：未登录

**症状：** 点击"结算"后页面闪一下，又回到原页面

**诊断方法：**
1. 打开微信开发者工具
2. 进入调试控制台
3. 执行以下代码：
```javascript
// 检查登录状态
const user = wx.getStorageSync('user')
const token = wx.getStorageSync('token')
console.log('用户:', user)
console.log('Token:', token)
```

**解决方案：**
1. 先登录：进入"侠客"页面 → 点击"登录/注册"
2. 输入手机号：`18701410500`
3. 验证码：`123456`
4. 或者开启测试模式（页面底部开关）

---

### 可能原因2：购物车没有勾选商品

**症状：** 点击"结算"按钮无反应

**诊断方法：**
1. 在购物车页面，检查商品前的复选框是否勾选
2. 如果没有勾选，系统不会跳转支付页面

**解决方案：**
1. 勾选至少一个商品
2. 或者点击"全选"按钮

---

### 可能原因3：RouteGuard 正在检查登录状态

**症状：** 页面空白，没有任何内容

**诊断方法：**
1. 打开调试控制台
2. 查看是否有"重定向到登录页"的日志

**解决方案：**
1. 等待 `loading` 状态结束（最多3秒）
2. 如果一直loading，检查 `AuthContext` 是否正常

---

### 可能原因4：URL参数传递错误

**症状：** 进入支付页面后显示"参数错误"或空白

**诊断方法：**
1. 在支付页面的 `useEffect` 中添加日志：
```javascript
console.log('支付页面参数:', { totalParam, cartIds, productIdParam })
```

**解决方案：**
1. 检查购物车页面的跳转逻辑
2. 确保 `cartIds` 和 `total` 参数正确传递

---

## ✅ 完整测试流程

### 步骤1：启动本地开发环境

```bash
# 1. 确认本地开发模式已启用
cat .env.production
# 应该输出：TARO_APP_LOCAL_DEV=true

# 2. 安装依赖（如果还没安装）
pnpm install

# 3. 编译项目
pnpm exec taro build --type weapp

# 4. 打开微信开发者工具
# 导入 dist/ 目录
```

---

### 步骤2：登录测试账号

**方法A：使用测试账号**
1. 进入"侠客"页面
2. 点击"登录/注册"
3. 输入手机号：`18701410500`
4. 验证码：`123456`
5. 点击"登录"

**方法B：开启测试模式**
1. 在登录页面底部，开启"测试模式"开关
2. 系统会自动登录Mock用户

---

### 步骤3：添加商品到购物车

1. 进入"犒赏铺"页面
2. 选择商品（如"武林冰粉"或"西瓜"）
3. 点击"加入行囊"
4. 确认商品已添加到购物车

---

### 步骤4：进入支付页面

**从购物车进入：**
1. 进入"行囊"页面
2. 勾选商品（至少一个）
3. 点击"结算"按钮
4. 应该跳转到支付页面

**从商品详情页进入：**
1. 在商品详情页，点击"立即购买"
2. 应该跳转到支付页面

---

### 步骤5：验证支付页面功能

**检查项：**
- [ ] 页面正常显示，没有报错
- [ ] 商品信息正确（名称、价格、数量）
- [ ] 段位信息正确显示（如"江湖散修 L1佣金15% 积分返还10%"）
- [ ] 积分预览正确（如"预计获得 1 积分"）
- [ ] 支付方式可选择（微信支付、金豆支付、混合支付）
- [ ] 倒计时正常（30分钟）

---

### 步骤6：模拟支付

**本地开发模式（Mock支付）：**
1. 选择"微信支付"
2. 点击"立即支付"
3. 系统会自动模拟支付成功
4. 跳转到"待收货"页面

**检查项：**
- [ ] 支付成功后跳转正确
- [ ] 积分已返还（查看"侠客"页面）
- [ ] 分佣记录已生成（查看"我的推广"页面）
- [ ] 段位可能已更新（如果消费金额达到阈值）

---

## 🧪 手动测试支付页面（调试方法）

### 方法1：在控制台手动跳转

```javascript
// 在微信开发者工具控制台执行
wx.navigateTo({
  url: '/pages/payment/index?cartIds=cart-mock-001&total=12.00',
  success: () => console.log('跳转成功'),
  fail: (err) => console.error('跳转失败:', err)
})
```

### 方法2：在购物车页面添加日志

**文件：`src/pages/cart/index.tsx`**
```javascript
const goCheckoutStore = (storeId: string) => {
  const selectedStoreItems = items.filter(i => i.store_id === storeId && i.selected)
  if (selectedStoreItems.length === 0) {
    Taro.showToast({ title: '请先勾选商品', icon: 'none' }); return
  }
  const total = selectedStoreItems.reduce((s, i) => s + (i.products?.price || 0) * i.quantity, 0)
  const ids = selectedStoreItems.map(i => i.id).join(',')
  
  // 添加日志
  console.log('跳转支付页面:', { ids, total })
  
  Taro.navigateTo({ url: `/pages/payment/index?cartIds=${encodeURIComponent(ids)}&total=${total.toFixed(2)}` })
}
```

### 方法3：在支付页面添加日志

**文件：`src/pages/payment/index.tsx`**
```javascript
function PaymentPage() {
  const params = useMemo(() => Taro.getCurrentInstance().router?.params || {}, [])
  
  // 添加日志
  console.log('支付页面参数:', params)
  console.log('totalParam:', params.total)
  console.log('cartIds:', params.cartIds)
  console.log('productIdParam:', params.productId)
  
  // ... 其余代码
}
```

---

## 📊 测试检查清单

### ✅ 会员锁客功能
- [ ] 用户注册成功
- [ ] 推荐关系正确绑定（`referrer_id` 字段）
- [ ] 推荐码生成正确（`referral_code` 字段）

### ✅ 商品上架功能
- [ ] 商家可以上架商品
- [ ] 商品信息完整（名称、价格、让利率、库存）
- [ ] 商品可以上下架

### ✅ V4分佣算法
- [ ] 分佣计算正确（根据段位动态计算）
- [ ] 段位判定正确（根据动态分数）
- [ ] 防躺平机制生效（个人活跃门槛、团队流水阶梯、拓新衰减）

### ✅ 积分系统
- [ ] 积分返还正确（根据段位比例）
- [ ] 积分累计正确（支付成功后累加）
- [ ] 积分展示正确（在"侠客"页面显示）

### ✅ 订单流程
- [ ] 创建订单成功
- [ ] 支付成功后订单状态更新
- [ ] 订单查询正常

### ✅ 用户段位更新
- [ ] 消费后段位动态更新
- [ ] 段位展示正确（在"我的推广"页面）
- [ ] 段位比例正确（L1佣金、L2佣金、积分返还）

---

## 🚀 下一步

执行以上测试流程，记录测试结果。

**如果遇到问题，请提供：**
1. 截图（支付页面或控制台错误）
2. 控制台日志（如果有错误）
3. 复现步骤（详细的操作步骤）

我会根据反馈继续修复问题！
