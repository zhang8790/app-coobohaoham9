# 来店有喜 - 全面审查报告

> 审查日期：2026-07-06  
> 审查范围：管理后台(admin-web) ↔ 用户端小程序(src/) 功能配对 + 协议合规化

---

## 一、协议合规化问题（P0 严重 / P1 重要）

### P0-1. 支付页引用《来店有喜交易规则》但页面不存在 🔴

**文件**: `src/pages/payment/index.tsx:580`
```tsx
<Text>支付即视为同意《来店有喜交易规则》</Text>
```
**问题**: 文案中引用了《来店有喜交易规则》，但项目中不存在该协议页面，也没有路由跳转。用户点击无反应，属于"空引用"。
**影响**: 涉及资金交易的合规文本引用无实际内容，微信审核可能被拒。
**修复**: 创建 `src/pages/trade-rules/index.tsx` 交易规则页面，并在支付页文案处添加跳转链接。

---

### P0-2. 提现页面缺少提现协议 🔴

**文件**: `src/pages/withdraw/index.tsx`
**问题**: 提现页直接让用户填写金额和收款信息后提交，但没有任何提现规则说明：
- 未告知提现手续费/税率（admin-web 端有10%税但用户端完全不知情）
- 未告知提现到账周期（仅底部一行"1-3个工作日"）
- 未告知最低/最高提现限额规则
- 未告知提现失败处理流程
**影响**: 涉及资金提取的合规风险。用户不知情被扣10%税。
**修复**: 提现页底部添加"提现规则"链接，创建 `src/pages/withdraw-rules/index.tsx`。

---

### P0-3. 推广佣金系统缺少规则说明 🔴

**文件**: `src/pages/my-promotion/index.tsx`
**问题**: 推广中心展示了段位、佣金比例(L1/L2)、锁客机制，但没有正式的"佣金规则"协议：
- 段位晋升条件不透明（V4算法的 dynamicScore 计算规则用户看不到）
- 佣金结算周期未说明（待结算→已结算的触发条件）
- 佣金发放方式未说明
- 退款时佣金回扣规则未说明
**影响**: 分销体系缺少合规文档，易引发佣金纠纷。
**修复**: 创建 `src/pages/commission-rules/index.tsx`，在推广中心添加入口。

---

### P1-1. 段位系统缺少规则说明 🟡

**文件**: `src/utils/commission-calculator-v4.ts`（硬编码段位配置）
**问题**: 段位（江湖散修→外门弟子→内门弟子→核心弟子→长老→掌门）的晋升条件完全硬编码在算法文件中，用户端只能看到当前段位和进度，无法了解完整段位体系规则：
- 各段位的具体晋升门槛（消费额+团队业绩）
- 各段位对应的佣金比例
- 段位是否永久有效还是需要维持
**修复**: 创建 `src/pages/rank-rules/index.tsx` 段位规则页，展示完整段位表。

---

### P1-2. 积分系统缺少规则说明 🟡

**文件**: `src/db/types.ts` PointsLogType 枚举有7种积分变动类型
**问题**: 用户可以看到积分余额（`getMyBalance`），但不知道：
- 积分获取途径（消费/邀请/签到/UGC）
- 各途径的积分获取比例
- 积分消耗规则（兑换/支付抵扣）
- 积分是否有有效期
**修复**: 创建 `src/pages/points-rules/index.tsx` 积分规则页。

---

### P1-3. 商家入驻缺少入驻协议 🟡

**文件**: `src/pages/merchant-apply/index.tsx`
**问题**: 商家入驻页直接填写信息后提交，没有要求阅读并同意商家入驻协议：
- 未告知商家平台抽成比例
- 未告知商家权利义务
- 未告知商家保证金/结算周期
- 未告知平台对商家的管理规则
**修复**: 入驻页底部增加"阅读并同意《商家入驻协议》"勾选项，创建对应协议页。

---

### P1-4. 设置页"关于"缺少协议入口 🟡

**文件**: `src/pages/settings/index.tsx:216-218`
```tsx
{ label: '用户协议', handler: ... },
{ label: '隐私政策', handler: ... },
{ label: '版本信息', handler: ... },
```
**问题**: 设置页只列了"用户协议"和"隐私政策"，缺少：
- 交易规则
- 提现规则
- 佣金规则
- 积分规则
- 段位规则
**修复**: 在"关于"区域补充上述协议入口。

---

## 二、管理后台与用户端功能配对问题

### P0-4. 二维码生成函数名不匹配（遗留Bug） 🔴

**文件**: `src/db/api.ts`
```typescript
const { data, error } = await supabase.functions.invoke('qrcodes', { body: params })
```
**问题**: 代码调用 `'qrcodes'`，但 Supabase 上实际部署的 Edge Function 名为 `generate-qrcode`。这是上次对话中 400 错误的根因。
**影响**: 门店二维码和个人推广二维码全部无法生成。
**修复**: 将 `'qrcodes'` 改为 `'generate-qrcode'`。

---

### P1-5. 小程序端 admin 缺少用户管理页面 🟡

**对比**:
| 功能 | admin-web | 小程序端 |
|------|-----------|---------|
| 用户管理 | ✅ `/users` 页面（查看昵称/手机/段位/积分/余额/角色，可升级/降级管理员） | ❌ 无 |

**问题**: 小程序端 admin 后台（`pages/admin/*`）只有4个页面（merchants/products/withdrawals/ugc），缺少用户管理。如果管理员只有小程序没有电脑，无法管理用户。
**建议**: 在小程序端新增 `pages/admin-users/index` 页面，或明确文档说明用户管理只在 admin-web 操作。

---

### P1-6. 小程序端 admin 缺少退款管理页面 🟡

**对比**:
| 功能 | admin-web | 小程序端 |
|------|-----------|---------|
| 退款管理 | ✅ `/refunds` 页面（通过/驳回退款） | ❌ 无 |

**问题**: 用户端有 `refund-apply` 提交退款，但小程序端管理员无法处理退款。退款流程在小程序端断裂。
**建议**: 小程序端新增退款管理页面，或明确退款只在 admin-web 处理。

---

### P1-7. 小程序端 admin 缺少公告管理页面 🟡

**对比**:
| 功能 | admin-web | 小程序端 |
|------|-----------|---------|
| 公告管理 | ✅ `/announcements` CRUD | ❌ 无 |

**问题**: 用户端有 `getAnnouncements()` 获取公告展示，但小程序端管理员无法新增/编辑/删除公告。

---

### P1-8. admin-web 商家后台多个页面全是 Mock 数据 🟡

| 页面 | 状态 | 问题 |
|------|------|------|
| `merchant/Messages.tsx` | ❌ Mock | 消息通知使用硬编码mock数据 |
| `merchant/Coupons.tsx` | ❌ Mock | 优惠券使用mock数据 |
| `merchant/Analytics.tsx` | ❌ Mock | 数据分析图表使用mock数据 |
| `merchant/Ads.tsx` | ❌ Mock | 广告管理使用mock数据 |

**影响**: 商家后台4个页面功能不可用，点击后显示的是假数据。

---

### P2-1. 段位/佣金/积分规则缺少管理界面 🔵

**问题**: 段位配置、佣金比例、积分规则全部硬编码在代码中：
- `src/utils/commission-calculator-v4.ts` — 段位配置表（RANK_CONFIG_TABLE）
- `src/utils/commission-helpers.ts` — 佣金计算逻辑
- admin-web 和小程序端均无管理界面

**影响**: 修改任何规则都需要改代码重新部署，运营效率低。

---

### P2-2. admin-web 提现审核10%固定税率硬编码 🔵

**文件**: `admin-web/src/pages/Withdrawals.tsx:58`
```typescript
{ label: '扣税后合计', val: `¥${(totalAmount * 0.9).toFixed(2)}` }
```
**问题**: 10%税率硬编码，不可配置。用户端完全不知情有此税率。

---

### P2-3. admin-web Users 页面只能查看段位不能修改 🔵

**文件**: `admin-web/src/pages/Users.tsx`
**问题**: 用户列表显示段位列，但只能修改角色（admin/user），不能手动调整段位/积分/余额。

---

### P2-4. 犒赏铺页面功能与名称不符 🔵

**文件**: `src/pages/reward-shop/index.tsx`
**问题**: TabBar 名称叫"犒赏铺"（暗示积分兑换商店），但实际内容是门店列表（`getStores`），不是积分兑换页面。
**影响**: 用户期待与实际功能不匹配。

---

## 三、功能配对矩阵

### 总后台功能对比

| 功能模块 | admin-web | 小程序端admin | 配对状态 |
|---------|-----------|-------------|---------|
| 仪表盘 | ✅ `/dashboard` | ✅ `pages/admin/index` | ✅ 已配对 |
| 商家审核 | ✅ `/merchants` | ✅ `pages/admin-merchants` | ✅ 已配对 |
| 商品审核 | ✅ `/products` | ✅ `pages/admin-products` | ✅ 已配对 |
| 提现审核 | ✅ `/withdrawals` | ✅ `pages/admin-withdrawals` | ✅ 已配对 |
| UGC管理 | ✅ `/ugc` | ✅ `pages/admin-ugc` | ✅ 已配对 |
| 用户管理 | ✅ `/users` | ❌ 无 | ⚠️ 仅admin-web |
| 退款管理 | ✅ `/refunds` | ❌ 无 | ⚠️ 仅admin-web |
| 公告管理 | ✅ `/announcements` | ❌ 无 | ⚠️ 仅admin-web |

### 商家后台功能对比

| 功能模块 | admin-web | 小程序端商家中心 | 配对状态 |
|---------|-----------|----------------|---------|
| 店铺概况 | ✅ `/merchant` | ✅ `pages/merchant-center` | ✅ 已配对 |
| 商品管理 | ✅ `/merchant/products` | ✅ `pages/merchant-products` | ✅ 已配对 |
| 订单管理 | ✅ `/merchant/orders` | ✅ `pages/merchant-orders` | ✅ 已配对 |
| 会员管理 | ✅ `/merchant/members` | ✅ `pages/merchant-members` | ✅ 已配对 |
| 优惠券 | ✅ Mock | ✅ `pages/merchant-coupons` | ⚠️ admin-web是Mock |
| 数据分析 | ✅ Mock | ✅ `pages/merchant-analytics` | ⚠️ admin-web是Mock |
| 广告管理 | ✅ Mock | ✅ Tab在商品管理内 | ⚠️ admin-web是Mock |
| 消息通知 | ✅ Mock | ❌ 无 | ⚠️ 仅admin-web(Mock) |
| 佣金提现 | ✅ `/merchant/withdraw` | ✅ `pages/withdraw` | ✅ 已配对 |
| 店铺设置 | ✅ `/merchant/settings` | ✅ `pages/merchant-settings` | ✅ 已配对 |
| 营销活动 | ❌ 无 | ✅ `pages/merchant-campaigns` | ⚠️ 仅小程序端 |

### 用户端核心功能闭环检查

| 功能 | 用户端入口 | 后端API | 管理端处理 | 闭环状态 |
|------|----------|---------|-----------|---------|
| 购物 | ✅ 商品→购物车→支付→订单 | ✅ | ✅ 商家发货 | ✅ 闭环 |
| 退款 | ✅ 申请退款 | ✅ refunds表 | ⚠️ 仅admin-web可处理 | ⚠️ 小程序端断链 |
| 提现 | ✅ 申请提现 | ✅ withdrawals表 | ✅ admin审核 | ✅ 闭环 |
| 佣金 | ✅ 推广中心查看 | ✅ commissions表 | ❌ 无管理端 | ⚠️ 不可管理 |
| 积分 | ✅ 查看余额 | ✅ points_logs表 | ❌ 无管理端 | ⚠️ 不可管理 |
| 段位 | ✅ 推广中心查看 | ✅ V4算法计算 | ❌ 无管理端 | ⚠️ 不可管理 |
| 公告 | ✅ 首页展示 | ✅ announcements表 | ⚠️ 仅admin-web | ⚠️ 小程序端断链 |
| 收藏 | ✅ 收藏/取消 | ✅ favorites表 | N/A | ✅ 闭环 |
| 评价 | ✅ 提交评价 | ✅ product_reviews表 | ❌ 无审核端 | ⚠️ 无审核 |
| 文章UGC | ✅ 发布/管理 | ✅ articles表 | ✅ admin审核 | ✅ 闭环 |

---

## 四、合规化协议清单（需创建）

| 序号 | 协议名称 | 引用位置 | 当前状态 | 优先级 |
|------|---------|---------|---------|--------|
| 1 | 用户服务协议 | 登录页/设置页 | ✅ 已有 | - |
| 2 | 隐私政策 | 登录页/设置页/PrivacyModal | ✅ 已有 | - |
| 3 | 交易规则 | 支付页第580行 | ❌ 空引用 | P0 |
| 4 | 提现规则 | 提现页 | ❌ 完全缺失 | P0 |
| 5 | 佣金规则 | 推广中心 | ❌ 完全缺失 | P0 |
| 6 | 段位规则 | 推广中心 | ❌ 完全缺失 | P1 |
| 7 | 积分规则 | 用户中心 | ❌ 完全缺失 | P1 |
| 8 | 商家入驻协议 | 商家入驻页 | ❌ 完全缺失 | P1 |
| 9 | 活动规则 | 活动领取页 | ⚠️ 内嵌文本，无独立页 | P2 |

---

## 五、修复优先级建议

### 第一优先级（立即修复）
1. **P0-4**: `api.ts` 中 `'qrcodes'` → `'generate-qrcode'`（1行代码改动）
2. **P0-1**: 创建交易规则页面 + 支付页添加跳转
3. **P0-2**: 创建提现规则页面 + 提现页添加入口
4. **P0-3**: 创建佣金规则页面 + 推广中心添加入口

### 第二优先级（近期修复）
5. **P1-4**: 设置页"关于"区域补充协议入口
6. **P1-1**: 创建段位规则页面
7. **P1-2**: 创建积分规则页面
8. **P1-3**: 商家入驻页添加入驻协议勾选 + 创建入驻协议页

### 第三优先级（规划修复）
9. **P1-5/6/7**: 小程序端 admin 补充用户管理/退款管理/公告管理页面
10. **P1-8**: admin-web 商家后台4个Mock页面接入真实数据
11. **P2-1**: 段位/佣金/积分规则管理界面
12. **P2-4**: 犒赏铺页面名称与功能对齐

---

## 六、修复执行记录（2026-07-07 已完成）

### ✅ 已完成项

| 编号 | 修复内容 | 产出 |
|------|---------|------|
| P0-4 | `api.ts` 二维码函数名 `qrcodes` → `generate-qrcode` | 1 行改动，修复二维码 400 错误 |
| P0-1 | 创建交易规则页 + 支付页跳转 | `pages/trade-rules/index.tsx`，支付页文案可点 |
| P0-2 | 创建提现规则页 + 提现页入口 | `pages/withdraw-rules/index.tsx`，提现页添加链接 |
| P0-3 | 创建佣金规则页 + 推广中心入口 | `pages/commission-rules/index.tsx`，推广中心添加链接 |
| P1-1 | 创建段位规则页（含六段位对照表） | `pages/rank-rules/index.tsx` |
| P1-2 | 创建积分规则页 | `pages/points-rules/index.tsx` |
| P1-3 | 创建商家入驻协议页 + 入驻页勾选 | `pages/merchant-agreement/index.tsx`，merchant-apply 增加勾选 |
| P1-4 | 设置页"关于"补充 6 个协议入口 | settings/index.tsx 增至 8 条 |
| P1-5 | 小程序端 admin 用户管理页 | `pages/admin-users/index.tsx`（真实 Supabase 数据，支持管理员权限切换） |
| P1-6 | 小程序端 admin 退款管理页 | `pages/admin-refunds/index.tsx`（状态分页 + 通过/驳回） |
| P1-7 | 小程序端 admin 公告管理页 | `pages/admin-announcements/index.tsx`（增/启停/删） |
| — | 武林盟首页补充"平台管理"入口 | admin/index.tsx 新增 3 个卡片指向上述页面 |
| — | app.config.ts 注册全部 9 个新页面 | 路由已注册，构建通过 |
| — | admin-web 预存 63 个 TypeScript 类型错误修复（schema 漂移） | `types/index.ts`/`mock/data.ts`/`api/admin.ts`/`AuthContext.tsx`/`Dashboard.tsx`/`merchant/*` 等多文件对齐真实 DB schema（`Withdrawal` 补 `store_id`/`remark`/`updated_at`、`Product` 补 `category_id`/`main_image`/`cost_price`/`discount_rate` 等），`tsc -b && vite build` 全绿 |
| P2-4 | 犒赏铺命名与功能对齐（确认无需改名） | 产品确认：犒赏铺为合作门店品牌、拥有独立管理后台，门店列表 Tab 命名正确；仅在 `reward-shop/index.tsx` 补充注释说明 |

**构建验证**:
- 小程序端：`pnpm exec taro build --type weapp` 通过（17.26s，exit 0），9 个新页面均产出到 `dist/`。
- 管理后台：`cd admin-web && pnpm run build`（`tsc -b && vite build`）通过（exit 0），修复 63 个预存类型错误后构建全绿。

### ⏳ 暂未执行项（需进一步决策/后端配合）

| 编号 | 内容 | 说明 |
|------|------|------|
| P1-8 | admin-web 商家后台 4 个 Mock 页面接真实数据 | 类型层已对齐、构建已变绿；真实数据接入仍依赖后端 API（消息/优惠券/数据分析/广告），建议单独排期 |
| P2-1 | 段位/佣金/积分规则管理界面 | 规则当前硬编码在 `commission-calculator-v4.ts`，需抽成可配置表 + 管理端 |
| P2-2 | admin-web 提现审核 10% 固定税率硬编码 | 见 P2-2 条目 |
| P2-3 | admin-web Users 页面只能查看段位不能修改 | 见 P2-3 条目 |

---

*报告结束*
