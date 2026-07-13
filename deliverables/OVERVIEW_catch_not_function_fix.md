# 金豆支付 `.catch is not a function` 修复说明

## 问题现象
用户登录、余额正常、订单主表插入成功后，点击「确认支付 6 金豆」弹出：
```
r.supabase.from(...).update(...).eq(...).catch is not a function
```

## 根因
`src/pages/payment/index.tsx:317` 把 `.catch()` 直接链在 `await supabase.from(...).update(...).eq(...)` 之后。由于 `.` 优先级高于 `await`，实际执行的是：
```ts
await (supabase.from(...).update(...).eq(...).catch(...))
```
Supabase query builder 是 thenable（只有 `.then`，没有 `.catch`），所以抛出 `TypeError: .catch is not a function`。

## 修复
改为 `try/catch` 包裹 `await`：
```ts
try {
  await supabase
    .from('orders')
    .update({ status: paidStatus(serviceType), paid_at: new Date().toISOString() })
    .eq('order_no', orderResult.order.order_no)
} catch (e) {
  console.warn('[金豆支付] 单店状态更新失败', e)
}
```

## 验证
- 已全局扫描 `src/**/*.ts(x)`，确认其余 `.catch` 均挂在 Promise 对象上，无同类错误写法。
- 已重新编译 `dist/`，产物中旧 `.catch` 链已消失，`try/catch` 结构已编入。

## 后续操作
1. 在微信开发者工具点「热重载/重新编译」。
2. 用 `18701410500 / 123456` 登录（如清过缓存）。
3. 点「确认支付 6 金豆」复测 —— 预期成功跳转订单中心，无 toast 报错。
