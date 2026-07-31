# 来电有喜 · 代码审查标准与流程（Code Review Standards & Workflow）

> 版本：v1.0（2026-07-30 定稿）
> 适用范围：微信小程序（Taro/React, `src/`）、管理后台（admin-web, Vite/TS）、Supabase Edge Functions（Deno/TS）、数据库迁移（SQL）、RLS 策略
> 目标：建立统一质量基线，消灭「构建绿但运行时坏」，守住资金安全零资损与合规零红线

---

## 0. 为什么需要这份标准（背景）

本项目在逼近上线期集中爆发过一批「奇怪」的问题，共性极强，值得用流程固化：

- 购物车角标显示 4，点进去却是空的 → `addToCart` 的 `.insert()` 被 **ASI（自动分号插入）** 接到上一行变量，`batchId.insert is not a function`，数据库写入**从未执行**，但乐观计数照跑导致角标虚高。
- 「构建绿、模拟器白屏」反复出现 → **Taro weapp 构建 = babel 转译，不跑 tsc 类型检查**，未声明变量/类型错误都能编译通过，运行时才 `ReferenceError` 白屏。
- 退款不扣健康豆、又错扣贡献值 → 只改了「下发」侧（买家返利落 `tb_balance`），没同步改「退款」侧（`refund-order` / `wechat-refund-callback`），形成**资损**。
- 入驻提交失败 → RLS 缺 owner 策略拦截 INSERT。
- 支付页 400 → 沿用了被 `api.ts` 废弃的 PostgREST 嵌入写法，外键缺失导致 `PGRST200`。
- 分佣全空转 → 触发器里 `net.http_post` 的 `body` 写成 `::text`、或在 EXCEPTION 里 `UPDATE orders` 二次报错、或引用了不存在的 `NEW.discount_rate`。

结论：**本项目的质量风险不在「语法对不对」，而在「运行时对不对、资金会不会错、合规踩不踩线」**。代码审查必须把这几类风险前置拦截。

---

## 1. 核心原则

1. **资金安全高于一切**：任何涉及金豆（健康豆/tb_balance）、推广佣金、退款的改动，必须账户口径一致、幂等、可回滚。
2. **构建 ≠ 正确**：Taro 构建不跑 tsc。凡涉及数据库读写、类型使用、关键执行路径的改动，审查者必须要求**运行时验证证据**（node 复现 / 真机 / 线上模拟会话）。
3. **账户边界清晰**：`tb_balance`（健康豆）= `tongbao_logs`；`profiles.points`（确权积分，已并入健康豆口径）历史数据在 `points_logs`。买家返利统一落 `tb_balance`/`tongbao_logs`。退款须双账户同步扣回。
4. **合规红线不可碰**：医疗宣称、绝对化用语、统一术语、去 AI 化，是提交前硬卡项。
5. **可重现、可验证**：每个修复都要有可复现的验证步骤，禁止「看起来改对了」式合并。
6. **小步提交、单一意图**：一个 PR 只解决一件事；混改资金+样式+重构会被打回拆分。

---

## 2. 角色与职责

| 角色 | 职责 |
|------|------|
| **作者（Developer）** | 完成提交前自检（§5）；确保 tsc 零错（小程序+后台分别）；提供运行时验证证据 |
| **审查者（Reviewer）** | 至少 1 人；按分级与分域清单逐项核对；C1 必须双人 + 技术负责人放行 |
| **技术负责人 / 架构** | 对 C1 变更最终批准；裁决术语/账户模型争议 |
| **CI（门禁）** | 自动跑 tsc / oxlint / 构建 / deno check，不通过禁止合并（见 §7）|

---

## 3. 变更分级（C1 / C2 / C3）

| 级别 | 定义 | 审查要求 | 示例 |
|------|------|----------|------|
| **C1 关键** | 资金、安全、合规、账户模型、RLS 策略、分佣/退款核心逻辑 | **双人 + 技术负责人放行**；必须附运行时验证证据 | 买家返利落账、`refund-order` 改动、RLS 策略新增、迁移改列、合规文案 |
| **C2 重要** | 核心业务链路（下单/支付/购物车/订单中心/健康豆明细） | 至少 1 名 Reviewer；要求构建产物 grep 确认改动进 dist | 支付页重付支线、加购写入修复、结算兜底 |
| **C3 一般** | 样式、文案、非核心组件、文档、工具函数 | 1 名 Reviewer 或 self-review + CI 通过 | 主题色微调、列表项 UI、README |

> 判定模糊时，**就高不就低**（按 C1 处理）。

---

## 4. 分域审查检查清单（核心）

### 4.1 微信小程序（Taro / React，`src/`）

- [ ] **ASI 陷阱**：`.insert()` / `.then()` / `.catch()` / 函数调用**不得紧接在可能换行拼接的变量后**。禁止 `const x = await fn()` 后直接 `.method()` 依赖换行。审查时对有 `await supabase.from(...).insert(...)` 的块重点看括号与换行。
- [ ] **未声明变量**：Taro 构建不报漏声明。提交前**必须** `node node_modules/typescript/bin/tsc -b`（或 `tsc --noEmit`）零错；资金/DB 路径改动须 **node 脚本复现关键执行路径**（如复现 `addToCart` 是否真写入）。
- [ ] **路由合法**：tabBar 页（购物车、我的等）跳转只能用 `switchTab`；支付/结算/详情等主包普通页用 `navigateTo`。不得对 tabBar 页用 `navigateTo`。
- [ ] **金额精度**：金豆单位=元，必须用 `Math.round(x * 100) / 100`，**禁用** `Math.floor(x / 0.01)`（×100 资损）。混合支付基数用 `net_amount`。
- [ ] **三态履约**：履约枚举（`express` / `self_pickup` / …）在 `paidOrderUpdate` / `confirmMultiStoreOrders` / `buildResultUrl` 三处必须同步扩写，不得只改一处。
- [ ] **默认选中/兜底**：购物车进入默认全选；结算入口在无勾选时须有兜底（用全部商品），不能让用户「进不去」。
- [ ] **乐观更新安全**：本地计数/角标不得在无 DB 写入成功时自增（避免角标虚高）。
- [ ] **PostgREST 嵌入**：无外键的表（如 `order_items.product_id` 为 text、0 外键）**禁止** `select=products(...)` 嵌入，须先查主表再 JS 内 `.in('id', ids)` 关联。
- [ ] **全局状态**：新增全局提示/store 须在 `app.tsx` 正确挂载，且不影响其它页面渲染。

### 4.2 管理后台（admin-web，Vite / TS）

- [ ] `node node_modules/typescript/bin/tsc -b` 零错；`vite build` 通过。
- [ ] 组件拆分合理，props 有类型；不在页面里写大段业务逻辑（抽到 service/hook）。
- [ ] 角色/权限判断走统一封装，不散落 `if (role === ...)`。
- [ ] 表格/表单的空态、加载态、错误态齐全。

### 4.3 Supabase Edge Functions（Deno / TS）

- [ ] **双账户一致（资损红线）**：买家返利写 `profiles.tb_balance` + `tongbao_logs`（`type=purchase_earn`，`order_id`+`delta`+`balance_after`）；**不得**写 `profiles.points` + `points_logs`（除非是为兼容历史旧单的扣回分支）。
- [ ] **退款同步**：凡改「下发」侧涉及健康豆/`tb_balance`，**必须同步**改 `refund-order` 与 `wechat-refund-callback` 两个 EF 的扣回分支，避免退款不扣健康豆。
- [ ] **幂等**：分佣用 `commission_distributed` 标志 / 唯一约束防重复发放。
- [ ] **触发器 `trg_distribute_commission`**：
  - [ ] `SET search_path = ''` 下所有表名须 schema 限定（`public.profiles`）；`net.http_post` 自身已含 schema 前缀。
  - [ ] `pg_net 0.20+` 签名：`net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}', headers jsonb DEFAULT ..., timeout_milliseconds integer DEFAULT 5000)` 返回 `bigint`。**`body` 必须是 `jsonb`，禁止 `::text` 强转**。
  - [ ] EXCEPTION 块**不得** `UPDATE orders`（会因表名解析不到二次报错、穿透 EXCEPTION、回滚整个 INSERT）。用 `RAISE WARNING '[trg] order_no=%, error=%', NEW.order_no, SQLERRM` 写日志，订单仍 `RETURN NEW` 提交成功。
  - [ ] **`orders` 表无 `discount_rate` 列**（在 `order_items`/`stores.referral_rate`），触发器 payload 严禁用 `NEW.discount_rate`。
  - [ ] 诊断：建 `public.trigger_logs` 表，每步 `INSERT` 标记，卡哪步看 `error` 字段。
  - [ ] `orders.user_id`（非 `payer_id`）是获取 referrer 的关联键。
- [ ] **RLS / 权限**：EF 用 `service_role` 时，涉及用户归属的查询仍应明确 `auth.uid()` 传入或由策略侧约束；避免越权读全表。
- [ ] **精度**：金额 `Math.round` 两位小数；不得用浮点直接 `*0.01` 后截断。
- [ ] **`deno check`** 通过；`deno fmt` 干净。

### 4.4 数据库迁移（SQL）

- [ ] **禁止重复建表**：同表被多个 migration `CREATE TABLE IF NOT EXISTS` 重复建 → 列体系分裂。改前先 `SELECT column_name FROM information_schema.columns WHERE table_name='xxx'` 核对线上真实列。
- [ ] **RLS 策略**：
  - [ ] 裸建号须同时插 `auth.users` + `auth.identities`，否则 `Database error querying schema`；email 生成列禁手工 INSERT；`provider_id NOT NULL` 填 `user_id` 本身。
  - [ ] 自引用子查询做 RLS 会 `42P17` 无限递归 → 放行下级用 `SECURITY DEFINER` + `uuid[]`（`fn_my_l1_referral_ids`），`auth.uid()` 由策略侧传入。
  - [ ] 上线前**模拟会话验证**：`SET request.jwt.claims='{"sub":"<uid>","role":"authenticated"}'; SET ROLE authenticated;` 跑一次真实写入/读取，确认策略生效（注意用真实外键值，否则 FK 报错会掩盖 RLS 是否通过）。
- [ ] **CHECK 约束**：`tongbao_logs` type 含 `purchase_earn` / `refund_deduct` / `commission_earn` / `commission_revoke`（迁移 00126 已放宽），新增 type 须先确认 CHECK 允许。
- [ ] **列名差异**：`tongbao_logs` 用 `order_id` + `delta`；`points_logs` 用 `related_order_id` + `amount`。扣回/写入分支务必用对应表的列名与 type。
- [ ] 迁移在**预发/灰度库**先跑 dry-run，再上生产；破坏性操作（删列、改类型）需明确回滚脚本。

### 4.5 合规（全部端通用，硬卡项）

- [ ] **禁医疗宣称**：治疗 / 治愈 / 抗炎 / 降血压 等。治愈 → 舒心 / 静心 / 调理；入 `compliance-words.ts` 禁用词库。
- [ ] **禁绝对化用语**：最 / 第一 / 100% 等（除非有依据）。
- [ ] **食养附「不替代医嘱」**提示。
- [ ] **统一术语（全项目硬约束）**：
  - 用：金豆、推广佣金、贡献值(cv)、侠客推广中心、货款提现、累计消费额（非 GMV）、邀请新用户、平台让利、由微信直接打款、边花边赚。
  - 禁旧词：情绪豆、通宝、分销佣金、团队业绩、飞轮。
  - ⚠️ **「微信服务商分账」是微信支付官方产品名**（门店货款结算/提现正是通过它实现），代码与文档中合法使用，**不是**禁旧词。CI 合规扫描须将「服务商分账」排除在硬门禁之外，否则会误伤 merchant-payout / Withdrawals / MerchantSettlements 等合法文件（详见 §7 合规扫描口径）。
  - ⚠️ 佣金已转金豆不可提现：所有「佣金可提现」文案改「以金豆发放，可在平台内消费，不可提现」。
- [ ] **去 AI 化**：禁 AI 图标 / AI 文字（用「智能」「食养」「推荐」替代）。提交前 grep `AI|人工智能|大模型` 确认无残留。

---

## 5. 提交前自检清单（作者必做，Pre-Commit / Pre-PR）

通用：
- [ ] 小程序 `tsc -b` 零错；admin-web `tsc -b` 零错；EF `deno check` 通过。
- [ ] 改动涉及 DB 读写 / 资金 / 类型 → 提供**运行时验证证据**（node 复现脚本、真机截图、或 `SET ROLE authenticated` 模拟会话结果）。
- [ ] 构建产物 grep 确认改动编译进 `dist/`（如 `grep -c "关键词" dist/pages/xxx/index.js`）。
- [ ] 合规词库 + 去 AI 化 grep 通过。
- [ ] 单一意图，无无关混改。

资金 / 账户类额外：
- [ ] 买家返利落 `tb_balance` / `tongbao_logs`，未错落 `profiles.points`。
- [ ] 下发侧改了健康豆 → `refund-order` + `wechat-refund-callback` 退款侧**同步**改扣回。
- [ ] 分佣幂等（不重复发放）。
- [ ] 金额精度 `Math.round(x*100)/100`，无 `Math.floor(x/0.01)`。

迁移类额外：
- [ ] 无重复 `CREATE TABLE`；已核对 `information_schema.columns` 真实列。
- [ ] RLS 策略齐（owner 可读写 / admin 全权），模拟会话验证过。
- [ ] CHECK 约束允许新 type；列名用对（tongbao_logs vs points_logs）。

---

## 6. 审查流程（Workflow）

```
作者自检(§5) ──► 提 PR/MR（附变更说明+验证证据+风险级别C1/C2/C3）
        │
        ▼
Reviewer 按分级+分域清单(§4)逐项核对
        │
        ├─ 不通过 ──► 打回（写明具体条款，如「§4.3 双账户一致未满足」），作者修改后重提
        │
        ├─ C1 ──► 需第二 Reviewer + 技术负责人放行
        ▼
CI 门禁(§7) 全绿
        │
        ▼
合并 ──► 真机/线上验证回填（在 PR 评论或 memory 记录验证结果）
```

**SLA（建议）**：C3 当日、C2 1 个工作日、C1 视紧急度（线上阻断类 2 小时内响应）。
**评论规范**：引用具体条款编号，避免「这不行」「改一下」式模糊意见。
**打回标准**：任一 C1/C2 清单项未满足、缺验证证据、构建/tsc 未过、混改未拆分。
**合并后**：作者负责真机/线上验收，失败立即回滚并开 hotfix（走 C1 快速通道）。

---

## 7. CI 门禁建议

| 仓库/包 | 命令 | 拦截 |
|---------|------|------|
| 小程序 `src/` | `node node_modules/typescript/bin/tsc -b` + `taro build --type weapp`（或 lint） | tsc 报错、构建失败 |
| admin-web | `node node_modules/typescript/bin/tsc -b` + `vite build` | tsc 报错、构建失败 |
| Edge Functions | `deno check`、`deno fmt --check` | 类型/格式错误 |
| 迁移 SQL | 预发库 dry-run + `information_schema` 复核脚本 | 重复建表、列缺失 |
| 合规 | 分层扫描（见下方 §7.1）：硬门禁 + 提示性 | 硬门禁命中阻断；提示性仅评论 |

> ⚠️ **oxlint 陷阱**：批量自动删 import 会产生**假阳性**（误删仍在用的 import），导致「构建绿但运行时 ReferenceError」。任何 oxlint 批量清理后，**必须 grep / 真机校验**被删符号确实未被引用。

### §7.1 合规扫描分层口径（关键，避免门禁假红）

本项目早期直接把 `100% / 唯一 / 绝对 / 保本` 等词做硬门禁，但源码大量命中**良性用法**（CSS `width:100%`、`唯一约束` 注释、`不承诺保本` 文案），会误伤。经核查，合规扫描分两层：

**A. 硬门禁（命中即阻断 CI，零误伤）** —— 仅针对**无歧义旧术语**与**去 AI 化**：
- 禁旧词：`情绪豆` `通宝` `分销佣金` `团队业绩` `飞轮`（旧业务黑话，已全量下线）。
- 去 AI 化：`AI` 图标 / `人工智能` / `大模型` 文字残留（用「智能」「食养」「推荐」替代）。
- 上述词在代码中**已无合法出现**，硬卡不会误伤。

**B. 提示性扫描（命中仅发 PR 评论，不阻断）** —— 针对**语义需人工判断**的用词：
- 医疗宣称：`治疗` `治愈` `抗炎` `降血压` `根治` `补肾` …（须排除 `compliance/shield.ts` 词库定义文件本身，及情绪标签类的「治愈系」用法）。
- 广告法绝对化：`最` `第一` `100%` `唯一` `绝对`（须排除 CSS 宽度、唯一约束、不承诺保本等良性用法）。
- 提示性命中由 Reviewer 人工裁决是否真为红线，避免机器误杀。

> ⚠️ **「微信服务商分账」是微信支付官方产品名，不在任何扫描层**。它的出现（merchant-payout EF / Withdrawals / MerchantSettlements）是合法的货款结算实现，须从禁词与扫描词中彻底排除。

---

## 8. 常见阻断速查表（本项目血的教训）

| 现象 | 根因 | 检测手段 | 预防（审查卡点） |
|------|------|----------|------------------|
| 购物车角标虚高、点进去空 | `addToCart` 的 `.insert()` 被 ASI 接到变量，`batchId.insert is not a function`，DB 写入从未执行 | node 复现关键路径 | §4.1 ASI 检查 + node 复现 |
| 构建绿、模拟器白屏 | Taro 构建不跑 tsc，漏声明/类型错编译过、运行时 ReferenceError | `tsc -b` 零错 + 真机 | §4.1 未声明变量 |
| 退款不扣健康豆、错扣贡献值 | 只改下发侧没改退款侧 | 查 `refund-order`/`wechat-refund-callback` 是否同步 | §4.3 双账户一致 |
| 入驻/写入 42501 | RLS 缺 owner 写策略 | `pg_policies` 复核 + `SET ROLE authenticated` 模拟 | §4.4 RLS 策略 |
| 支付页 GET 400 PGRST200 | 无 FK 的表用了 PostgREST 嵌入 | 查 `select=表(列)` | §4.1 禁止嵌入无 FK 表 |
| 分佣全空转 | 触发器 `body::text` / EXCEPTION 内 `UPDATE orders` / `NEW.discount_rate` | 建 `trigger_logs` 诊断每步 | §4.3 触发器规则 |
| 同表列体系分裂 | 多 migration 重复 `CREATE TABLE IF NOT EXISTS` | `information_schema.columns` | §4.4 禁止重复建表 |
| 裸建号 `Database error querying schema` | 只插 `auth.users` 没插 `auth.identities` | 建号脚本复核 | §4.4 RLS 裸建号 |
| platform_income 负值 | 四舍五入导致极小单 `discountPool - l1 - l2 - bf < 0` | 边界单测试 | §4.3 精度 + `Math.max(0,...)` |

---

## 9. 参考与术语

- 项目记忆（长期）：`.workbuddy/memory/MEMORY.md`（账户模型、分佣、迁移陷阱、术语等全量）。
- 相关 Skill：`supabase-ef-sandbox-deploy`（EF 部署+漏单补跑）、`taro-build-no-tail`（Taro 构建深坑）。
- 资金模型：金豆(健康豆)=`tb_balance`=`tongbao_logs`；推广佣金以金豆发放、不可提现；退款由微信直接打款。
- 分佣：两级封顶（一级=好友、二级=粉丝），每单只发一次（幂等），平台保底=让利×10%。
- 合规：禁医疗宣称/绝对化用语；食养附「不替代医嘱」；统一术语见 §4.5。

---

> 本标准是「活文档」：每次踩新坑，由发现者在 §8 速查表补一行，并在对应分域清单(§4)补卡点。每月由技术负责人回顾一次。
