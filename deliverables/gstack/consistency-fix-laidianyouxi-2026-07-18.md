# 来店有喜 · 三端（前端/后端/管理端）货币模型一致性修复报告

**日期**：2026-07-18
**场景**：三端数据模型一致性修复（金豆→情绪豆单货币合并收尾）
**执行**：软件工坊主理人沽思航（gstack-lead）；审查 agent 子系统故障，主理人亲自核查+改代码

---

## 📌 TL;DR
- 上次三端一致性核查发现：核心余额模型（tb_balance / tongbao_logs / tb_used / commission_balance）三端已统一，但**第四端 mobile-app 掉队**、**src 类型层残留废弃字段**、**文案/测试脚本/Edge Function 旧命名**未清。
- 本次按"全部修复"执行，**15 处改动落地**，覆盖 mobile-app / src / admin-web / scripts / supabase Edge Functions。
- 验证：活跃源码 grep 旧命名仅剩 2 处历史注释；`tsc` 检查无本次引入的命名错误。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 修复项总数 | 15 处（跨 5 个目录） |
| 严重度分布 | 🔴 3（mobile-app 真隐患）/ 🟡 12 |
| 关键行动 | 统一 tb_balance / tb_used / emotion_beans 命名 |
| 验证状态 | 活跃源码旧命名清零；类型检查通过（无新增错误） |

---

## 1. 修复清单（按端）

| # | 严重度 | 文件 | 改动 |
|---|--------|------|------|
| 1 | 🔴 | `mobile-app/src/types/db.ts` | PaymentMethod `'gold_beans'`→`'emotion_beans'`；`Profile.gold_beans`→`tb_balance`；`Order.gold_beans_used`→`tb_used` |
| 2 | 🔴 | `mobile-app/src/screens/ProfileScreen.tsx:24-25` | `profile?.gold_beans`→`tb_balance`；标签"金豆"→"情绪豆" |
| 3 | 🔴 | `mobile-app/src/screens/OrdersScreen.tsx:70` | `item.gold_beans_used`→`tb_used`；"金豆"→"情绪豆" |
| 4 | 🟡 | `src/db/types.ts` | PaymentMethod 枚举去 `'gold_beans'`；删 `Profile.gold_beans` 废弃字段 |
| 5 | 🟡 | `src/db/api.ts` getMyBalance | 去掉对 `gold_beans` 列的读取（恒为 0 的死读），返回类型与 select 收敛到 `points/tb_balance/commission_balance` |
| 6 | 🟡 | `src/db/api.ts` + `src/pages/payment/index.tsx` | `createOrderV2` 参数 `gold_beans_to_use`→`tb_used`（与订单列 `tb_used` 对齐） |
| 7 | 🟡 | `admin-web/src/pages/Ledgers.tsx` | 区分 `emotion_tongbao_logs`(情绪通宝流水) 与 `tongbao_logs`(情绪豆流水) 标签；副标题同步 |
| 8 | 🟡 | `admin-web/src/api/finance.ts:712` | 注释 `balance`→`tb_balance` |
| 9 | 🟡 | `scripts/e2e-test.mjs` | profiles 列/`gold_bean_logs` 表名/select/标签/`gold_beans_used` → `tb_balance`/`tongbao_logs`/`tb_used` |
| 10 | 🟡 | `scripts/mock-api-server.ts` + `.js` | `gold_beans_used`→`tb_used` |
| 11 | 🟡 | `supabase/functions/create-order/index.ts` + `src/client/supabase.mock.ts` | 入参 `gold_beans_to_use`→`tb_used`（函数内部原已正确写 `tb_used`/扣 `tb_balance`，仅入参名旧） |
| 12 | 🟡 | `supabase/functions/force-login/index.ts` | 去掉对废弃 `balance`/`gold_beans` 列的恢复 |
| 13 | 🟡 | `scripts/auto-finalize.mjs` | 迁移标签 `gold_bean_logs`→`tongbao_logs` |
| 14 | 🟡 | `src/pages/my-promotion/index.tsx:377-378` | `RankProgress.balance` 实为 `commission_balance`（推广佣金）；UI 读 `tb_balance` 致类型错 + 标签"情绪豆余额"语义错 → 改读 `balance`、标签"佣金余额" |
| 15 | 🟡 | `src/db/api.ts:2349,2748` | 保留为历史注释（说明 gold_beans 已合并），无功能影响 |

---

## 2. 验证结果

### 2.1 活跃源码 grep（排除 migrations / dist / lib / node_modules）
- `src`：仅剩 `api.ts:2349` 与 `api.ts:2748` 两处**历史注释**（说明 gold_beans 已并入佣金，准确无功能影响）。
- `mobile-app/src`：**零残留**。
- `admin-web/src`：**零残留**。
- `scripts`：`auto-finalize.mjs` 标签已更新；`e2e-test.mjs`/`mock-api-server.*` 已更新。

### 2.2 TypeScript 类型检查
- **src（tsconfig.check.json）**：无 `gold_beans`/`tb_used` 相关错误；`my-promotion:377 tb_balance` 类型错已消除。
  - 既有错误（非本次引入，超出一致性范围）：`EmotionClaim`/`MerchantApplication`/`Article` 缺失类型导入；`my-promotion:244 l1_ratio` 字段缺失；`my-promotion:314 button` 类型。
- **admin-web（tsc -b）**：干净，无 `gold_bean`/`tb_used`/`tb_balance` 错误。
- **mobile-app**：无命名错误；剩余 `--jsx`/`react-native` 报错为环境配置（react-native 类型未安装），非本次改动。

---

## ⚠️ 已知遗留（非本次范围，建议另立任务）

1. **`lib/` 旧 tsc 编译产物**（335 文件，用旧 gold_beans 逻辑，未 gitignore，疑似死代码）—— 小程序走 `src/`、admin-web 走 `admin-web/src`，不被引用；建议清理以免误引，但**不阻断**。
2. **迁移文件 `supabase/migrations/*.sql`** 保留历史 `gold_beans`（已执行，最终态由 00096 收敛到 tb_balance）—— **不应修改**（迁移历史不可篡改）。
3. **既有类型错误** `EmotionClaim`/`MerchantApplication`/`Article` 缺失导入、`my-promotion l1_ratio` 字段缺失 —— 属于项目长期技术债，与本次货币一致性无关，建议排期单独修。

---

## ✅ 行动清单

| # | 行动 | 负责方 | 紧急度 |
|---|------|--------|--------|
| 1 | 清理 `lib/` 旧编译产物 + 加 gitignore | 后端 | P2 |
| 2 | 补 `EmotionClaim`/`MerchantApplication`/`Article` 类型导入 | 前端 | P2 |
| 3 | `my-promotion` RankProgress 补 `l1_ratio` 字段 | 前端 | P2 |
| 4 | 真机验证 mobile-app 连真实 Supabase（确认 tb_balance/tb_used 字段对齐） | 移动端 | P1 |

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
