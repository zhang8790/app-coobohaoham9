# 已保存收款账户（迁移 00123）— 交付文档

> 需求：所有提现管理绑定银行卡/支付宝后，直接持久化保存，下次提现免二次填写。

## 一、设计落点

| 落点 | 决策 |
| --- | --- |
| 数据层 | 新增独立表 `withdrawal_accounts`（不复用 `withdrawals`，避免历史脏数据污染） |
| 鉴权 | 表 `DISABLE RLS`，只走 3 个 `SECURITY DEFINER` RPC（贴合项目既有风格，绕过 RLS 坑） |
| 维度 | `owner_id + owner_type` 支持双场景：佣金模式按 `user_id` 存、货款模式按 `store_id` 存 |
| 模式 | 多账户 + 选择器 + 默认卡（可设默认、可删除），类似银行 APP「我的卡」 |
| 去重 | 同一 owner 下，method+账号+持卡人 三元组视为同一张卡，重复保存自动更新不新增 |
| 触发 | 提现提交成功后**自动保存当前账户**为默认卡（不阻塞主流程，失败仅 console.warn） |
| 回填 | 进入提现页 → `load()` 拉已保存账户 → 自动带出默认卡/首张卡 → 直接复用 |
| 切换 | 切换 method（银行卡↔支付宝↔微信）时，若当前用的已保存卡方式不匹配，自动切回手填 |

## 二、文件清单

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `supabase/migrations/00123_saved_withdrawal_accounts.sql` | **新** | 表 + 3 RPC（`fn_get_withdrawal_accounts` / `fn_save_withdrawal_account` / `fn_delete_withdrawal_account`） |
| `src/db/types.ts` | 改 | 新增 `SavedWithdrawalAccount` 接口 |
| `src/db/api.ts` | 改 | 新增 3 个 API 函数（`getWithdrawalAccounts` / `saveWithdrawalAccount` / `deleteWithdrawalAccount`） |
| `src/pages/withdraw/index.tsx` | 改 | 加状态、`applyAccount` 助手、重写 `load()` 自动回填、`handleSubmit` 成功后保存、加卡片式选择器 UI |
| `admin-web/src/types/index.ts` | 改 | 新增 `SavedWithdrawalAccount` 接口 |
| `admin-web/src/pages/merchant/Withdraw.tsx` | 改 | 加 `loadSavedAccounts` / `applySavedAccount`、useEffect 加载时拉取、`handleSubmit` 成功后保存、加 chip 式选择器 UI |

## 三、本机部署步骤

1. **执行迁移**（沙箱无 SQL 权限，须本机 Supabase Dashboard → SQL Editor 跑）：
   ```
   supabase/migrations/00123_saved_withdrawal_accounts.sql
   ```
2. **小程序重 Taro 编译**（已本地验证 `EXIT=0`，dist/pages/withdraw/index.js 21.26 kB / gzip 5.20 kB）。
3. **admin-web 重 Vite 编译**（已本地验证 `EXIT=0`，103 modules / 3.01s / bundle 748 kB），部署 dist/。
4. **无需部署 Edge Function**，纯 RPC + 直连 Supabase。

## 四、用户感知

### 第一次提现
- 表单照常手填，提交后**自动保存**为「已保存账户」并设为默认。

### 第二次提现起
- 打开「提现管理」页 → 顶部自动出现「已保存的收款账户」卡片，已自动带出默认卡。
- 点卡片 → 表单自动填好（真实姓名/身份证/开户行/卡号/持卡人/支付宝账号全带）。
- 直接输入金额 → 提交。
- 切 method 时若不匹配，自动清空走手填。

### 多账户管理
- 顶部卡片下方有「使用新账户（提交后将自动保存）」虚线框，点击清空表单走手填。
- 每张卡右侧有 🗑 按钮，可删除（删除后下次提现需重新填写该卡）。

## 五、代码位置速查

- **小程序加载 + 回填**：`src/pages/withdraw/index.tsx:67-117`（`load()`）
- **小程序提交后保存**：`src/pages/withdraw/index.tsx:177-200`（`handleSubmit` 成功分支）
- **小程序选择器 UI**：`src/pages/withdraw/index.tsx` 「已保存的收款账户」区块
- **admin-web 加载 + 回填**：`admin-web/src/pages/merchant/Withdraw.tsx:24-50`
- **admin-web 提交后保存**：`admin-web/src/pages/merchant/Withdraw.tsx:67-88`
- **admin-web 选择器 UI**：`admin-web/src/pages/merchant/Withdraw.tsx` 「已保存账户」chip 区块

## 六、已知限制

- 身份证号当前以**明文**保存于 `withdrawal_accounts.id_card`，与 `withdrawals.id_card` 一致；若后续要做合规脱敏（仅显示后 4 位），迁移 00124 可一并处理。
- 切换 `owner_id`（如店主更换）不会迁移旧账户——业务上店主变更本身就是敏感事件，账户需重新绑定。
- 提现失败时不会回滚已保存账户（设计如此：保存与提现是两步独立操作，保存失败不阻塞提现）。
