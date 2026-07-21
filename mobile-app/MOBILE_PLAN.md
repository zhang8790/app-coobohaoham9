# 来电有喜 · 小程序 → 原生 App 技术选型与迁移方案

> 结论先行：**推荐 React Native + Expo（TypeScript）**。一套代码出 iOS + Android，团队零学习曲线（已是 React/TS 栈），后端与核心引擎 100% 复用，到店上架最快。

---

## 一、为什么是 React Native + Expo（而不是原生 Swift/Kotlin 或 Flutter）

### 1. 团队与代码复用（决定性因素）
现有小程序是 **Taro + React 18 + TypeScript + Zustand + Supabase**。RN 也是 React，意味着：
- 业务状态（Zustand store）、数据访问（Supabase 查询）、以及**整套食疗导购引擎（纯 TS）**可以不改逻辑直接搬；
- 团队不需要学新语言（Flutter 要学 Dart，原生要分 iOS/Android 两套）。

### 2. 后端零改动
小程序后端是 Supabase（客户端直连 anon key）。`@supabase/supabase-js` 在 RN 原生可用，表结构、RLS、Edge Functions（`distribute-commission`、红包、推送等）**全部复用**，无需另起后端。

### 3. 上架速度
Expo 的 `eas build` 一条命令出 iOS / Android 包，配合 OTA 可热更新非底层逻辑——比维护两套原生工程快得多。

### 4. 与其它方案的对比

| 方案 | 上手成本 | 复用度 | 平台体验 | 到店速度 | 适用判断 |
| --- | --- | --- | --- | --- | --- |
| **RN + Expo** | 低（React 同栈） | 高 | 接近原生 | 快 | ✅ 当前推荐 |
| Flutter | 中（学 Dart） | 中（引擎可搬，UI 重写） | 接近原生 | 快 | 若未来追求像素级一致可选 |
| 原生 Swift + Kotlin | 高（两套栈） | 低（逻辑重写） | 最佳 | 慢 | 仅重度原生功能（AR 等）时考虑 |

---

## 二、小程序 → 原生 App 必须变更的能力（迁移差异清单）

| 能力 | 小程序现状 | 原生 App 改造 | 复杂度 |
| --- | --- | --- | --- |
| **登录** | `Taro.login()` + 微信小程序云函数 | 手机号 OTP / 用户名密码（Supabase Auth 原生支持）；微信登录改微信开放平台 Open SDK | 中 |
| **Supabase 客户端** | `Taro.request` 自定义 fetch + `getStorageSync` | 原生 `fetch` + `AsyncStorage`（本脚手架已做） | 低 |
| **支付** | `create-wechat-payment`（JSAPI 小程序支付） | 微信 App 支付 / 支付宝（新 Edge Function + 客户端 SDK） | 高 |
| **推送** | `subscribeMessage` 订阅消息 | FCM(Android) + APNs(iOS)，`expo-notifications` | 中 |
| **UI** | Taro 组件（View/Text…） | RN 原语（View/Text/FlatList/Pressable）+ 平台规范 | 中 |
| **地图/相机** | `Taro.map` / `chooseImage` | `react-native-maps` / `expo-image-picker` | 低 |
| **分享** | 小程序分享卡片 | `react-native-share` / `expo-sharing` | 低 |
| **隐私安全** | 微信托管 | token 存 `expo-secure-store`；隐私政策与 PIPL 同意流 | 低 |

> 关键提醒：**真实发佣链路**依赖 `orders.referrer_id` 与已部署的 `distribute-commission` 等函数（见项目记忆，目前线上仅 `emotion-compile` 已部署，微信相关函数 404）。原生 App 上线前需先把这些 Edge Function 部署齐，并补 `profiles.referrer_id` 列。

---

## 三、食疗导购引擎复用情况

引擎位于小程序 `src/utils/food-therapy/`，本次已 1:1 复制到 `mobile-app/src/lib/food-therapy/`：

- ✅ 纯函数部分（`nature / symptom-rules / scoring / classifier / crowd-nlu / marketing / cart-conflict / aux-remind / templates / types`）—— **零改动**，仅把 `Product` 类型本地化、把同目录字典路径修正。
- ✅ `llm.ts` —— 调用 `food-therapy-ai` Edge Function 做 NLU/润色，失败时**自动回退规则引擎**，平台无关，已指向 RN 版 supabase 客户端。
- ✅ `shiyang-dictionary.ts` —— 食养成分词典（59 条）一并带走。

首页「身体状态 → 三栏推荐（五星推荐/谨慎食用/不建议点）」即调用 `classifyProducts()`，与小程序导购页同源。

---

## 四、分阶段上线路线图

### Phase 0 · 脚手架（本次交付）
Expo 工程、Supabase RN 客户端、auth/cart store、导航壳、食疗引擎移植、首页/商城/详情/购物车/我的/订单核心页面。

### Phase 1 · MVP 可用版
- 登录（手机号 OTP + 用户名密码）跑通；
- 商品浏览/搜索/详情、购物车、下单（先用金豆或占位支付）；
- 订单列表、个人资料、推广佣金展示；
- 真机联调 Supabase RLS，确保数据读写正确。

### Phase 2 · 原生集成
- 微信 App 支付 / 支付宝接入（新 Edge Function + 客户端）；
- 推送（FCM/APNs）+ `send-notification` 改推 device token；
- 微信开放平台登录（Open SDK）；
- 相机/地图/分享海报。

### Phase 3 · 上架就绪
- 图标、启动图、商店截图、ASO 文案；
- 隐私政策与 PIPL 同意流；
- `eas build` 出包 → TestFlight / 内部测试 → 分阶段发布；
- 崩溃监控（Sentry / Firebase Crashlytics）、性能基线（冷启动/内存/电量）。

---

## 五、性能指标（验收基线）

| 指标 | 目标 |
| --- | --- |
| 冷启动 | < 3s |
| 内存占用 | < 100MB（核心功能） |
| 电量 | < 5%/h 活跃使用 |
| 崩溃率 | < 0.5%（即 crash-free > 99.5%） |

---

## 六、关键风险与前置项

1. **Edge Functions 部署**：微信登录/支付/红包相关函数当前线上多数为 404，需先 `supabase secrets set` + `deploy` 补齐，否则原生 App 同样跑不通。
2. **`profiles.referrer_id` 列**：线上疑似缺失，推荐关系与发佣依赖它，须先跑 `fix-referrer-id.sql`。
3. **支付资质**：若启用用户储值需《支付业务许可证》；App 内虚拟商品走 IAP 需遵守平台规则——建议维持现有「金豆抵扣 + 微信/支付宝」模式，不碰储值。
4. **文案规范**：食养文案继续附「不替代医嘱」声明，禁用医疗宣称与绝对化用语（与小程序一致）。
