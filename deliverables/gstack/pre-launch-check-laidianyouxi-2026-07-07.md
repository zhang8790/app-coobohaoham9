# 来店有喜小程序 · 上线前全检报告（代码审查 + 安全审计 + QA 测试）

**日期**：2026-07-07
**场景**：上线前检查（pre-launch check）
**参与成员**：产品官（gstack-product-reviewer，代码审查）+ 安全卫士（gstack-security-officer，OWASP+STRIDE）+ 质量门神（gstack-qa-lead，QA测试与发布就绪）

---

## 📌 TL;DR（执行摘要）

- **整体结论**：🔴 **No-Go（不可上线）**——三方独立审查交叉印证出 6 个 P0 阻塞项，任一都足以造成资损或全库数据泄露。
- **阻塞项数量**：6 个 P0（RLS 全关、管理员鉴权仅前端、测试 OTP 后门常驻生产、客户端资金写+分佣早于支付、金豆单位/列不一致差 100 倍、支付超时取消已支付订单）。
- **最高危单点**：云端 **RLS 被整体关闭**，而前端/后台均用公开 anon key 直连库——反编译小程序包即可对任意表读/写/删全站用户 PII 与资金。
- **资金逻辑带病**：分佣在「订单创建时」即发放（未支付先拿佣金）、金豆换算三处互相矛盾（差 100 倍）、退款未接真实微信退款 API（可套利）。
- **下一步**：先解决全部 P0（尤其 RLS + 资金操作迁入 service_role Edge Function + 清除测试后门），再做一轮回归；当前不可发布。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🔴 **No-Go** |
| 严重度分布 | 🔴 6（P0）/ 🟠 9 / 🟡 6 / 🟢 2 |
| 关键行动项 | 6 条（其中 3 条 P0 阻塞） |
| 建议负责人 | 后端（RLS/资金/分佣重构）+ 安全（策略与密钥治理）+ 前端（去后门/渐变/CSS 化） |

---

## 1. 各成员核心结论

### 🔍 产品官（代码审查，PR 级 / `src` 核心模块）
- **核心判断**：🔴 不通过。除团队已标注的 RLS 关闭外，新发现 3 类上线阻断级资损缺陷：① 金豆单位与扣减列严重不一致（客户端认为 1 金豆=1 元、服务端/提现认为 1 金豆=0.01 元，相差 100 倍，且扣款落到无人充值的 `gold_beans` 列）；② 分佣三重路径且在「支付前」发放，V4 动态分佣被自身标记位架空成死代码，支付页又写第三套矛盾数字；③ 支付 30 分钟超时无状态守卫，会直接把已支付/已金豆支付订单覆盖成「已取消」。
- **关键建议**：统一金豆货币模型并补进 `Profile` 类型；分佣只在微信回调 V4 内对 `pending_pay` 幂等执行并删除 `createOrderV2` 内的 `distributeCommissionDirect`；超时取消加 `.eq('status','pending_pay')` 守卫；移除 `supabase.ts` 的 `@ts-nocheck`。

### 🛡️ 安全卫士（OWASP Top 10 + STRIDE 威胁建模）
- **核心判断**：🔴 高风险，当前状态不可上线。头号风险是 RLS 整体关闭 + 公开 anon key 直连，叠加「管理员鉴权仅前端 UI」「生产构建常驻测试 OTP 后门」，攻击链可在分钟内完成「登录测试商家 → 自提权 admin → 读写全站资金与 PII」。同时客户端直接做资金写、分佣早于支付、Edge Function 信任请求体金额字段，均属可金融欺诈点。
- **关键建议**：上线前重启用 RLS 并配套将管理/资金写操作迁移到 service_role Edge Function（同一发布单元灰度切换）；清除测试 OTP 后门（用 `import.meta.env.DEV` 隔离）；修复 PostgREST 过滤器注入、生产构建配置（关闭 SourceMap/开启 minify）、`.env.production` 加入 gitignore；已给出可落地的 RLS 策略 SQL 与 `is_admin()` SECURITY DEFINER 函数。

### ✅ 质量门神（QA 测试与发布就绪）
- **核心判断**：🟡 有条件发布。9 条关键用户链路源码路径全部接通、构建可过（同配置 2026-07-07 成功构建）、合规协议页齐全、审计 P0/P1 已修复且 admin-web Mock 页已接真实数据；但存在 3 个上线前必须处置的条件项：RLS 全关（安全高危）、微信支付回调依赖 3 个 Supabase Secrets 未确认、14 处 inline 渐变在微信端不渲染（关键 CTA 白字可能不可读）。
- **关键建议**：发布清单标注 RLS 关闭为高危并排期上线后 48h 内补回；上线前确认微信支付 3 个密钥并验证一次回调落单；修复 14 处 inline 渐变为 CSS class；微信公众平台添加 supabase request 合法域名。

---

## 2. 综合审查发现（去重合并后按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源成员 |
|---|--------|------|------|---------|------|---------|
| 1 | 🔴 | 安全/资损 | `supabase/migrations/00028` 及 00015/17/18/21/23/31/34/35/38/40/41/44/51/52 | RLS 在核心与资金表被整体 DISABLE，前端/后台用公开 anon key 直连 → 全库任意表可被越权读写删 | 上线前重启用 RLS + 资金/管理写改 service_role Edge Function | 产品官+安全卫士+质量门神 |
| 2 | 🔴 | 越权 | `src/db/api.ts`(admin*)、`src/pages/admin*/`、`admin-web/src/{App,AuthContext}.tsx`、`admin-users/index.tsx:57` | 管理员鉴权仅前端 UI 守卫，后端无角色校验；RLS 关闭下可直接改 role=admin 接管 | 管理/写操作收敛 service_role Edge Function + RLS admin policy | 安全卫士 |
| 3 | 🔴 | 认证绕过 | `src/contexts/AuthContext.tsx:204,221`、`login/index.tsx:19,52` | 测试 OTP 后门（`18701410500`+`123456`、自动建号）常驻生产构建，无环境开关隔离 | 删除硬编码手机号/固定码/自动建号，测试模式用 `import.meta.env.DEV` | 安全卫士+产品官 |
| 4 | 🔴 | 资损 | `src/db/api.ts` `createOrderV2`(770)/`distributeCommissionDirect`(906)/`grantEmotionClaim`(1032)/`applyRefund`(1127)；`distribute-commission` V4 | 资金写操作在客户端(anon)完成且未校验；分佣在「订单创建时」即发放（未支付先拿佣金/积分）；`distributeCommissionDirect` 置 `commission_distributed=true` 架空 V4 动态分佣 | 资金写收敛 service_role；分佣仅在 `wechat-payment-callback` 成功后触发；恢复 `create-order`+`distribute-commission` 为主路径 | 安全卫士+产品官 |
| 5 | 🔴 | 资损 | `payment/index.tsx:14-15,158-161`、`api.ts:799-810,1276-1279`、云函数 `create-wechat-payment:57-58`、`withdraw/index.tsx:95-96`、`db/types.ts:9-33` | 金豆单位三处矛盾（支付页 1 金豆=1 元、服务端/提现 1 金豆=0.01 元，差 100 倍）；扣减列 `gold_beans` 与展示列 `balance` 错位且无人充值该列 | 全链路统一金豆语义与换算；`getMyBalance` 与扣减同列；单位换算/余额校验在 Edge Function 内完成 | 产品官 |
| 6 | 🔴 | 资损 | `payment/index.tsx:128-148,288,320-323` | 支付 30 分钟超时取消只按 `order_no` 更新不校验状态，会把已 `paid`/已金豆支付订单覆盖为 `cancelled` | 取消语句加 `.eq('status','pending_pay')` 守卫；已支付立即退出倒计时 | 产品官 |
| 7 | 🟠 | 套利 | `api.ts:1183-1197,1242-1247` | 退款仅改内部状态为 `completed`、未真正调用微信退款 API；测试期自动通过导致「内部退余额→提现真实资金」套利 | 退款接真实微信退款 API，内部余额退回放在退款成功回调；移除测试自动 completed | 产品官 |
| 8 | 🟠 | 功能缺陷 | `AuthContext.tsx:300,310-313` | 微信登录调不存在的 Edge Function `wechat_miniapp_login`（仓库仅有 get-wechat-openid 等）；`verifyOtp` 入参 `token_hash` 传的是字符串 token | 补齐 `wechat_miniapp_login` 或改走 get-wechat-openid+手机号绑定；修正 `verifyOtp` 入参 | 产品官 |
| 9 | 🟠 | 越权/欺诈 | `distribute-commission/index.ts:127-144` | Edge Function 信任请求体全部金额字段（`order_id/payer_id/total_amount/referrer_id`），持 anon JWT 可传 `total_amount=999999` 自发巨额佣金 | 金额与 referrer_id 从 DB 订单读取；仅允许内部/服务密钥调用；金额上限校验 | 安全卫士 |
| 10 | 🟠 | 注入 | `api.ts:307`、`emotion-compile/index.ts:87` | PostgREST 过滤器字符串拼接用户输入（`q.or(\`city_id.eq.${cityId}\`)` 等），可改变查询语义/越权读 | `cityId` 做 UUID 校验；category 白名单/参数化；禁止用户输入拼入 `.or()` | 安全卫士 |
| 11 | 🟠 | 配置错误 | `project.config.json`（`uploadWithSourceMap:true`、`minified:false`）、`project.private.config.json`(`urlCheck:false`) | 生产上传 SourceMap 未压缩且未 minify，反编译定位 anon key/管理端点极易 | 生产 `minified:true`、`uploadWithSourceMap:false`；urlCheck 保持默认 true | 安全卫士 |
| 12 | 🟠 | 密钥治理 | `.gitignore` 仅忽略 `.env*.local`；git 跟踪 `.env`/`.env.production`/`admin-web/.env` | 当前仅含 public anon key 无泄漏，但模式高危——一旦把 service_role/微信密钥写入即被提交 | 将 `.env.production`/`admin-web/.env`/`.env` 加入 `.gitignore`；密钥改 CI/CD Secrets 注入 | 安全卫士 |
| 13 | 🟠 | 越权 | `api.ts` `getMerchantOrders`(1595)、`updateStore`(1333) | 商家订单查询仅按 store_id 过滤未校验 owner；改门店无 owner 校验 → IDOR | RLS owner policy（`stores.owner_id=auth.uid()`）；订单查询校验 `store.owner_id` | 安全卫士 |
| 14 | 🟠 | 视觉/功能 | 14 处 inline `linear-gradient`：`login:140`、`withdraw:102`、`my-promotion:232,324`、`merchant-center:421`、`merchant-products:287,911`、`admin:67`、`commission-detail:39`、`coupon:107`、`content-center/make:342`、`employee:70`、`merchant-emotion-compile:273,393`、`user:152` | 微信小程序 inline style 不支持 `linear-gradient`，渐变静默失效；关键 CTA 白字可能不可读 | 统一改为 `.scss` class（参照 `store-home/index.scss`）；CI 加静态检查 | 产品官+质量门神 |
| 15 | 🟠 | 功能依赖 | `wechat-payment-callback/index.ts:26-31` | 微信支付回调依赖 3 个 Supabase Secrets（MCH_API_V3_KEY/WECHAT_PAY_PUBLIC_KEY_ID/WECHAT_PAY_PUBLIC_KEY），未配则回调返回 FAIL、订单卡 pending_pay | 上线前在 Supabase 配置这三项并验证一次回调落单 | 质量门神 |
| 16 | 🟡 | 配置 | `project.config.json:6`（`urlCheck:false` 仅本地生效） | 微信后台 request 合法域名未确认含 supabase 域名，生产上传强制校验 | 微信公众平台添加 `https://pyqgsxcjmijtbstwthbn.supabase.co`（含 storage 域名） | 质量门神 |
| 17 | 🟡 | 脏数据 | `login/index.tsx:52`、`AuthContext.tsx:103` | 登录测试白名单含笔误号码 `18710410500`/`187101410500`（应为 `18701410500`） | 清理为仅 `18701410500`/`12345678901` | 质量门神 |
| 18 | 🟡 | 测试覆盖 | `src/**` 无 `*.test.*` | 支付/分佣/退款/金豆抵扣等核心资金逻辑零单测，仅靠手动，易带病上线 | 至少为 `distributeCommissionDirect`/`distribute-commission`、金豆抵扣、退款校验补关键路径单测 | 产品官 |
| 19 | 🟡 | 合规/审计 | `api.ts:794,832,835,245` 等 | 生产 `console.log` 打印订单/商品/手机号全量 payload；无服务端审计日志 | 引入分级日志（prod 关闭）；关键操作写结构化审计日志 | 产品官+安全卫士 |
| 20 | 🟡 | 数据正确性 | `db/types.ts` 缺 `gold_beans`；`user_campaign_claims.store_id` 外键指向废弃表 `self_operated_stores(id)` INTEGER | Schema 漂移：迁移 ≠ 云端真实 schema；`gold_beans` 类型缺失；外键指向错误表 | 用 `introspect_schema.sql` 比对云端 schema，补齐类型；统一外键到 `stores(id)` UUID | 产品官+安全卫士 |
| 21 | 🟡 | 功能完整度 | 审计 P2 项 | 段位/佣金/积分规则管理界面缺失（硬编码于 commission-calculator-v4.ts）、提现 10% 税率硬编码用户不知情、admin-web Users 段位不可改 | 排期迭代，不影响小程序首版上线 | 质量门神 |
| 22 | 🟢 | 正面 | `upload.ts:95-97`、`merchant-settings:55,87`、`store-home:143`、`reward-shop:71` | base64/data URI 图片坑已正确规避（`<Image src>` 均用 URL） | 保持 | 质量门神+产品官 |
| 23 | 🟢 | 正面 | `wechat-payment-callback/index.ts`、`create-wechat-payment/index.ts` | 微信支付回调正确验签+幂等；全仓未提交 service_role/微信支付密钥；存在正确服务端路径 `create-order`+`distribute-commission` V4 | 恢复为主路径 | 安全卫士 |

---

## 🚫 阻塞项清单（Go/No-Go 决策依据）

以下 6 项任一未解决即 **No-Go**：

1. **RLS 整体关闭**（F-1 / ISSUE-001）——全库裸奔，最高危。
2. **管理员鉴权仅前端**（F-2）——改 `role=admin` 即可接管全站。
3. **测试 OTP 后门常驻生产**（F-3）——`18701410500`+`123456` 可在生产直接登录。
4. **客户端资金写 + 分佣早于支付**（F-4）——未支付先发佣金、可自改余额/佣金。
5. **金豆单位/列不一致差 100 倍**（F-5）——纯金豆支付必败或资损。
6. **支付超时取消已支付订单**（F-6）——已付款订单被覆盖为已取消。

> 决策：**🔴 No-Go**。第 1–4 项由安全/后端根因修复；第 5–6 项由后端逻辑修复。修复后需由质量门神做一轮回归 + 安全卫士确认 RLS 策略生效。

---

## 🔄 回滚预案

1. **构建产物回退**：git 保留上次通过构建的 `dist/`（或上次发布 tag）；微信开发者工具「上传」历史版本可一键回滚；本次若重跑构建失败，直接采用 2026-07-07 已验证 dist。
2. **Supabase 迁移回滚**：RLS 关闭为单向 DISABLE；如需恢复，执行 `ENABLE ROW LEVEL SECURITY` + 重建策略（基于 `auth.uid()` 的 SELECT/INSERT/UPDATE 策略，Edge Function 用 service_role 不受影响）。
3. **开关降级**：前端无远程开关；紧急降级可临时在 Supabase 关闭问题 Edge Function 或回退函数版本；`LOCAL_DEV` 切 true 仅本地 mock，生产不可用。
4. **紧急止血**：若上线后发现数据异常/泄露，立即在 Supabase 后台轮转 anon key（使旧客户端失效）+ 补 RLS，最短路径止血。

---

## ✅ 行动清单（至少 3 条具体可执行项）

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | 重启用 RLS（撤销 00028 等 DISABLE）+ 将 admin*/applyWithdraw/applyRefund/createOrderV2/distributeCommissionDirect/grantEmotionClaim/updateStore 迁移到 service_role Edge Function；提供 `is_admin()` SECURITY DEFINER 与按 `auth.uid()` 隔离策略 | 后端+安全 | P0 | 上线前 |
| 2 | 清除测试 OTP 后门：删除 `AuthContext.tsx`/`login` 硬编码手机号与固定码 `123456`、自动建号逻辑；测试模式以 `import.meta.env.DEV` 隔离 | 前端 | P0 | 上线前 |
| 3 | 重构资金时序：统一金豆货币模型（全链路换算+扣减同列，补 `gold_beans` 到 `Profile`）；分佣仅在微信回调 V4 内对 `pending_pay` 幂等执行并删除 `createOrderV2` 内 `distributeCommissionDirect`；恢复 `idempotency_key` 唯一约束 | 后端 | P0 | 上线前 |
| 4 | 修复支付 30 分钟超时取消：加 `.eq('status','pending_pay')` 守卫；纯金豆支付成功后立即退出倒计时 | 前端+后端 | P0 | 上线前 |
| 5 | 退款接真实微信退款 API，内部余额退回放在退款成功回调；移除测试期自动 `completed` | 后端 | P1 | 上线前/首版hotfix |
| 6 | 修复 14 处 inline 渐变为 CSS class（尤其 login/withdraw/my-promotion/merchant-center CTA）；确认微信支付 3 个 Secrets 已配并验证一次回调落单；微信后台添加 supabase 合法域名 | 前端+后端+运维 | P1 | 上线前 |

---

## ⚠️ 待完善 / 已知局限

- **产品官报告中途遭遇一次 429 限流**：agent 重试用后完整交付，内容有效，已纳入汇编；若需其原始 agent 日志可另行调取。
- **QA 无法真机实测**：本环境无微信开发者工具/模拟器，9 条链路以「源码路径追踪 + 构建产物核查」验证，未做真机 UI 实测；UI 层隐藏问题（如某些交互崩溃）未被覆盖。
- **资金逻辑零自动化测试**：分佣/金豆/退款无单测，本次审查依赖静态分析，建议修复后补关键路径测试再回归。
- **审计 P2 项未执行**：段位/佣金/积分规则管理界面、提现税率透明化等不影响首版上线，已排期迭代。
- **Schema 漂移未完全对齐**：`gold_beans` 类型缺失、`store_id` 外键指向废弃表，需上线前用 `introspect_schema.sql` 比对云端真实 schema。

---

## 📚 成员产出索引

- **gstack-product-reviewer（产品官）原始产出**：代码审查报告（PR 级，依据 `review` skill 七维审查）。核心结论 🔴 不通过；阻断级 F-01 金豆单位/列不一致、F-02 分佣三重路径+支付前发放+V4 死代码、F-03 超时取消已支付订单、F-专项 RLS 关闭；高级 F-04 退款套利、F-05 微信登录调不存在函数、F-06 测试账号旁路；中级 F-07 inline 渐变、F-08 零测试、F-09 生产日志、F-10 schema 漂移；正向 base64 规避、支付回调规范。
- **gstack-security-officer（安全卫士）原始产出**：完整报告已写入 `C:\Users\zhanglin\Desktop\app-coobohaoham9\.gstack\security-audit-history\audit-2026-07-07.md`。核心结论 🔴 不可上线；F-01 RLS 关闭、F-02 管理员鉴权仅前端、F-03 测试 OTP 后门、F-04 客户端资金写+分佣早于支付、F-05 distribute-commission 信任 body、F-06 过滤器注入、F-07 SourceMap 未压缩、F-08 env 被 git 跟踪、F-09 商家越权、F-10 日志审计缺失、F-11 schema 漂移、F-12 正面项；含可落地的 RLS 策略 SQL 与 `is_admin()` 函数。
- **gstack-qa-lead（质量门神）原始产出**：QA 测试与发布就绪报告（`qa` skill，Standard 模式，构建重跑进行中）。核心结论 🟡 有条件发布；9/9 链路接通、构建可过、合规页齐全、审计 P0/P1 已修复；缺陷 ISSUE-001 RLS 关闭、ISSUE-002 inline 渐变、ISSUE-003 微信支付 Secrets、ISSUE-004 合法域名、ISSUE-005 白名单笔误、ISSUE-006 base64 已规避、ISSUE-007 P2 未执行；含完整回滚预案。

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
