# 项目记忆

## 项目信息
- 项目：来店有喜 — Taro + React + TypeScript 微信小程序
- 包管理：pnpm@10.34.1
- 编译命令：`pnpm exec taro build --type weapp`
- 产物目录：`dist/`
- 微信开发者工具打开：`dist/` 目录
- AppID：`wxb5bdfdbb471a500f`
- Supabase 后端（2026-07-03 新建云端项目）：`https://pyqgsxcjmijtbstwthbn.supabase.co`
- 原后端 `https://backend.appmiaoda.com` 不在微信小程序白名单，已切换

## Supabase 云端数据库 (2026-07-03)
- **项目 URL**: `https://pyqgsxcjmijtbstwthbn.supabase.co`
- **项目 ID**: `pyygscxcmjibtstwhbn`，区域: Northeast Asia (Tokyo)
- **测试 Auth 用户**: `test18701410500@test.com` / 密码 `12345678`
- **测试手机号（多种格式都支持）**: `18701410500` / `18710410500` / `187101410500`
- **Auth UUID**: `d6b38349-dded-4879-9eac-3165a646436a`
- **测试商家**: 手机号 `18701410500`，店铺名 **横笼铺**，状态 approved
- **测试商品**: 西瓜 ¥39.90（麒麟西瓜）
- `.env` 已配置为连云端数据库（TARO_APP_LOCAL_DEV=false）
- admin-web `.env` 已同步更新
- **⚠️ RLS 已关闭**（测试阶段用 `DISABLE ROW LEVEL SECURITY`，正式上线前需重新配置 RLS 策略）
- 小程序和管理后台的测试账号登录均改为用真实邮箱密码通道绕过 SMS

## 本地开发
- `project.private.config.json` 中 `urlCheck: false`（本地开发跳过域名校验）
- 构建前确保 `node_modules` 已安装：`pnpm install`
- 本地开发模式：设置 `TARO_APP_LOCAL_DEV=true` 即可启用，无需后端服务器
- 本地模式使用 `src/client/supabase.mock.ts` 中的 mock 数据（4个测试商品、1个测试门店）
- 生产模式设置 `TARO_APP_LOCAL_DEV=false`（`.env.production` 中已配置）
- 本地模式登录：手机号 `18701410500`，验证码 `123456`，或开启页面底部测试模式
- 登录页支持测试模式开关（页面底部），可跳过短信

## 代码约定
- 页面路由定义在 `src/app.config.ts` 的 `pages` 数组中
- 新增页面需同时创建对应目录和文件
- `app.config.ts` 引用的页面必须实际存在，否则编译报错 `ENOENT`
- `project.private.config.json` 的 `setting` 会覆盖 `project.config.json`
- 统一前后端类型：`src/db/types.ts`（小程序端）+ `admin-web/src/types/index.ts`（后台端），两边均含 Profile/Product/Order/Withdrawal/Announcement/Refund 等
- 数据库 19 张表：profiles/stores/store_categories/products/cart_items/orders/order_items/articles/merchant_applications/announcements/commissions/withdrawals/refunds/points_logs/user_addresses/favorites/footprints/product_reviews/coupons/**user_store_relation**(锁客)/**store_staff**(员工)

### ⚠️ 云端 schema 漂移坑（2026-07-07 发现，重要）
- **迁移文件 ≠ 云端真实 schema**！本地 `00001` 里 `stores.id`/各 `store_id` 都写 UUID，但**云端实际 `user_campaign_claims.store_id` 外键指向 `self_operated_stores.id`（INTEGER，一张冗余/废弃表）**，不是 `stores.id`。而 `marketing_campaigns.store_id` / `user_store_relation.store_id` 才指向 `stores.id`（UUID）。
- 任何想"把 store_id 统一成 UUID"的迁移都会因外键类型冲突（42804）失败。正确修法：DROP 错误外键 → `ALTER store_id TYPE UUID USING NULL` → 重建外键到 `stores(id)`。
- **改 schema 前务必先用 information_schema 探查云端真实类型/外键**，别信迁移文件。
- 合并迁移脚本：`supabase/apply_fullfix_migrations.sql`（00045~48，幂等可重跑）；探查脚本：`supabase/introspect_schema.sql`。
- orders 补全字段：store_id/address_json/remark/tracking_no/refund_status/commission_amount
- profiles 补全字段：invite_code(邀请码)/invited_by(推荐人)/total_commission/settled_commission
- 测试账号邀请码：`LDYX001`
- admin-web 路由：dashboard/merchants/products/withdrawals/ugc/users/refunds/announcements
- 商家逻辑关键：getMerchantStore 按 owner_id 过滤；getMyMerchantApplication 按 user_id 过滤

## 微信小程序 CSS 限制（2026-07-04 发现）
- ❌ inline style **不支持 `background: linear-gradient(...)`**，渐变不会渲染
- ❌ `<Image src>` **不支持 base64/data URI**
- ✅ `<Image src>` 支持：网络URL（http/https）、本地路径（wxfile://）
- ✅ CSS class（通过 .scss 文件）中的 `background: linear-gradient(...)` **可以生效**
- 解决方案：渐变效果必须用 CSS class 实现（创建 index.scss，import 引入），不能用 inline style

## 2026-06-30 操作记录
- 修复了 `app.config.ts` 中缺少 `merchant-apply` 页面的问题（已补回）
- 登录页添加了账号密码登录方式（调用 `signInWithUsername`）
- 登录页添加了测试模式开关，测试模式下跳过短信发送，可快速登录
- 短信登录在 Supabase 中未配置 SMS Provider，当前通过测试账号走 password 通道绕过
- 商家管理中心入口逻辑在 `pages/user/index.tsx` 中已实现：未申请→申请入口，审核中→提示，已通过→进入管理后台
- 商家管理中心 `pages/merchant-center/index.tsx` 已实现商品管理、上架、下架、扫码上架、订单管理

## 2026-07-06 审查报告（2026-07-07 已修复大部分）
- 详细报告：`docs/audit-report-2026-07-06.md`（含第六部分修复执行记录）
- **✅ P0-4 已修复**: `api.ts` generateQrcode 函数名 `qrcodes` → `generate-qrcode`
- **✅ 协议页已创建**: 交易规则/提现规则/佣金规则/段位规则/积分规则/商家入驻协议 6个页面 + 各入口链接 + 设置页8条协议入口
- **✅ 小程序端admin已补齐**: admin-users(用户管理)/admin-refunds(退款管理)/admin-announcements(公告管理) 三个真实数据页面 + 武林盟首页"平台管理"入口
- **⏳ 仍待办**: admin-web 商家后台4个Mock页面接真实数据(P1-8)；段位/佣金/积分规则管理界面(P2-1)；犒赏铺改名(P2-4)
- **关键改动文件**: `src/db/api.ts`, `src/app.config.ts`, `src/pages/{payment,withdraw,my-promotion,settings,merchant-apply,admin,admin-users,admin-refunds,admin-announcements}/*`, 6个新协议页

## 情绪编译系统（V5 已落地 + 方案采纳）
- 已有地基：`src/utils/category-emotion.ts`(11业态策略+云端热更新)、`mood-tags.ts`(30标签)、`emotion-recommendation.ts`(画像推荐)、`supabase/functions/emotion-compile/index.ts`(理解+编译双通道)、`src/pages/emotion-check`(6情绪态)、`ProductEmotion`/`EmotionTaxonomy`类型+迁移00038/40/41。
- 2026-07-07 采纳方案 §4.1/§4.2 新增：`src/utils/emotion-compile-rules.ts`(三阶段翻译规则库)、`src/utils/emotion-scoring.ts`(编译质量评分引擎，满分100四维度+违规检测)、并把 `emotion-compile` 云函数 `ruleCompile` 升级为三阶段结构化输出。
- 执行手册：`docs/emotion-system-execution-manual.md`（P0/P1/P2 排期）。
- 仍缺（全新模块，需建表+页面）：商家情绪编译工作台、五屏情绪详情页、激活码扫码确权、情绪资产/徽章/滋养通宝/侠客录情绪板块、文章插商品卡联动、情绪漏斗看板。通宝/徽章/激活码当前代码与DB类型中均无。
