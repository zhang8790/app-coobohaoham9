# 商品/商家布局优化 — 构建与交互验证报告

> 日期：2026-07-12 ｜ 触发：用户要求「好了吗，然后测试下，是否正常交互」

## 一、构建结果
- 命令：`taro build --type weapp`（后台跑，**未** `rm .taro`，防构建卡死）
- 结果：**`BUILD_EXIT=0`**，构建日志仅 Sass/punycode 弃用警告，无 error/fail
- `dist` 产物：页面四件套齐全、tabBar 图标齐全、`app.json` 合法

## 二、改动编入产物核验（grep 编译后 dist 确认）
| 改动 | 核验点 | 结果 |
|---|---|---|
| 新增 `StoreStrip` 横向门店卡 | 编译进 `dist/common.js`，首页/探索页均通过 `s.StoreStrip` 引用 | ✅ |
| 首页 `FeedCard` 双列密排 | `rounded-xl` / 图 `110px` / 标题价格 `text-lg` / 双列 `calc(50% - 4px)` / 骨架 `110px` | ✅ |
| 探索页商品卡双列密排 | `gap-2` / `p-2` / `text-lg` / 图 `110px` / 情绪推荐区图 `90px` | ✅ |

## 三、交互逻辑核验（源码 + 编译产物逐行审查）
- **`StoreStrip` 门店卡点击**：`onClick → goStore(s.id) → Taro.navigateTo('/pages/store-home/index?id=<id>')`，URL 格式与项目既有用法（首页场景码、搜索等）一致，`store-home` 读取 `id` 参数 → ✅
- **`StoreStrip` 数据加载**：`getStores(undefined, 0, limit)` 调用参数正确；`alive` 守卫防卸载后 setState；`stores` 为空时 map 不渲染，不崩 → ✅
- **首页 `FeedCard`**：点卡片 → 跳 `product`；加购按钮 → `addToCart` + toast；分享 → `onShareClick` → ✅
- **首页/探索页双列商品卡**：`navigateTo` 跳转、加购事件绑定均正确编入产物 → ✅

## 四、渲染冒烟测试（沙箱可运行，无 GUI 依赖）
- 用 esbuild 打包 `StoreStrip` + mock（`@tarojs/components`/`@tarojs/taro`/`@/db/api`），`react-dom/server` 的 `renderToStaticMarkup` 渲染
- 结果：组件无异常渲染，输出含「精选好店」标题 → **`[RENDER_SMOKE] PASS`**
- 注：react-test-renderer + `act` 在此 node 环境会挂起（react 18 scheduler 不推进事件循环），已改用确定终止的 `renderToStaticMarkup` 方案

## 五、沙箱限制（重要）
- 沙箱内**无微信小程序 GUI / 开发者工具**，无法运行模拟器真实点击交互
- 「点击门店卡跳转」「加购」等真机交互**需在用户机器刷新开发者工具验证**

## 六、用户点验清单（在自己机器）
1. 若仍「模拟器启动失败」→ 开发者工具「设置→通用→清除缓存→全部清除」→ 彻底退出重开（必要时关硬件加速）；导入目录选项目根 `app-coobohaoham9`
2. 首页 / 探索页顶部出现「精选好店」横向滑动卡片（多家门店，可左右滑）
3. **点门店卡 → 跳转到对应店铺首页**（验证交互核心）
4. 商品卡更密：图 110px、双列、字号清晰，一屏可见更多商品
5. 商品卡加购按钮 → 提示「已加入购物车」

---
**结论**：构建成功、全部改动编入产物、交互代码逻辑正确、渲染冒烟通过。沙箱无法替代真机点击，请按上方清单在开发者工具刷新验证。
