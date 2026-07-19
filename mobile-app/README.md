# 来电有喜 · 移动端 App（React Native + Expo）

把现有「来电有喜」微信小程序做成可上架 App Store / 应用商店的**原生 iOS + Android App**。后端直接复用小程序已有的 Supabase（表、RLS、Edge Functions），核心的「食材食疗智能导购引擎」是纯函数，已 1:1 移植，零逻辑重写。

## 技术栈

| 能力 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | React Native 0.74 + Expo SDK 51 | 一套代码出 iOS + Android |
| 语言 | TypeScript | 与小程序一致，引擎/类型直接复用 |
| 导航 | React Navigation v6 | 底部 Tab + 原生栈 |
| 状态 | Zustand | 与小程序一致（authStore / cartStore） |
| 后端 | @supabase/supabase-js | 直接复用小程序 Supabase 项目 |
| 会话存储 | AsyncStorage | 生产建议换 expo-secure-store / keychain |

## 目录结构

```
mobile-app/
├── App.tsx                      # 入口：NavigationContainer + AppNavigator
├── app.json / babel.config.js  # Expo 配置
├── package.json
├── .env.example                 # 环境变量模板
└── src/
    ├── lib/
    │   ├── env.ts               # 读取 EXPO_PUBLIC_SUPABASE_*
    │   ├── supabase.ts          # RN 版 Supabase 客户端（内置 fetch + AsyncStorage）
    │   └── food-therapy/        # 食疗导购引擎（从小程序 1:1 移植，纯函数）
    ├── types/db.ts              # Product / Profile / Order 类型子集
    ├── state/                   # authStore（登录） / cartStore（购物车）
    ├── navigation/              # AppNavigator（登录门禁） + MainTabs（底部导航）
    ├── components/              # ProductCard / TierSection
    └── screens/                 # Login / Home / Products / ProductDetail / Cart / Profile / Orders
```

## 复用了什么（不用重写）

- **Supabase 后端**：所有数据表、RLS 策略、Edge Functions（`distribute-commission` 等）原样复用。
- **食疗导购引擎** `src/lib/food-therapy`：性味聚合、症状规则、三栏分类（`classifyProducts`）、人群 NLU，全部纯函数，与小程序同源。
- **登录 / 购物车逻辑**：`AuthContext` 平移为 `authStore`，`cartStore` 自带持久化。

## 运行

```bash
cd mobile-app
cp .env.example .env            # 填入真实的 EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
#   （值来自小程序 .env 或 Supabase 控制台 Project Settings → API）
npm install                     # 或 pnpm install
npx expo start
```

- 手机装 **Expo Go** 扫码即可预览；
- 真机/模拟器调试：`npx expo run:ios` / `npx expo run:android`（需本机 Xcode / Android Studio）。

> ⚠️ 测试账号：手机号 `+8618701410500` 任意密码 + 验证码 `123456` 可直接登录（与小程序一致）。

## 与原小程序的差异（Phase 2/3 待接入）

小程序依赖微信运行环境，原生 App 需要替换以下能力（本脚手架已留好接口/TODO）：

1. **登录**：已去掉 `Taro.login()` 微信小程序登录，改用 **手机号 OTP / 用户名密码**；微信登录后续通过**微信开放平台 Open SDK**（Expo config plugin `expo-wechat` 或自建插件）接入。
2. **支付**：`create-wechat-payment` 当前是小程序 JSAPI 支付，需新增 **原生微信 App 支付 / 支付宝**（新的 Edge Function + 客户端 SDK）。`CartScreen` 的「去结算」已留接入点。
3. **推送**：小程序 `subscribeMessage` → **FCM（Android）+ APNs（iOS）**，用 `expo-notifications`，`send-notification` Edge Function 改为推送 device token。
4. **地图 / 相机**：`Taro.map` / `chooseImage` → `react-native-maps` / `expo-image-picker`。
5. **分享海报**：`expo-sharing` / `react-native-share` 替代小程序分享卡片。
6. **安全加固**：会话 token 从 AsyncStorage 换为 `expo-secure-store` / `react-native-keychain`。

## 上架流程

1. `npx expo prebuild` 生成原生工程；
2. 配置 iOS `bundleIdentifier` / Android `package`（已在 app.json）；
3. `eas build -p ios` / `eas build -p android` 出包；
4. TestFlight / 内部测试 → 分阶段发布。

## 性能目标

冷启动 < 3s · 内存 < 100MB · 电量 < 5%/h · 崩溃率 < 0.5%。
