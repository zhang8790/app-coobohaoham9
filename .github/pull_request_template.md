<!--
  提交前请阅读 .workbuddy/code-review-standards.md
  本模板用于把「代码审查标准」落地到每个 PR：明确风险级别、变更意图、验证证据、资金/合规自检。
  原则：单一意图，一个 PR 只解决一件事；混改资金+样式+重构会被打回拆分。
-->

## 一、变更说明（必填）

**本 PR 解决什么问题 / 做了什么改动？**
<!-- 用 1-3 句话讲清意图，不要写「修复了一些 bug」这种模糊描述 -->

-

**变更范围（勾选涉及的端）：**
- [ ] 微信小程序（`src/`）
- [ ] 管理后台（`admin-web/`）
- [ ] Supabase Edge Functions（`supabase/functions/`）
- [ ] 数据库迁移（`supabase/migrations/`）
- [ ] 文档 / 配置（`.workbuddy/`、CI 等）

## 二、风险级别（必填，就高不就低）

> 判定模糊时按 C1 处理。详见 code-review-standards.md §3。

- [ ] **C1 关键** — 资金 / 安全 / 合规 / 账户模型 / RLS / 分佣退款核心逻辑（需**双人 + 技术负责人**放行，必须附运行时验证证据）
- [ ] **C2 重要** — 核心业务链路（下单/支付/购物车/订单/健康豆明细）
- [ ] **C3 一般** — 样式 / 文案 / 非核心组件 / 文档 / 工具函数

## 三、验证证据（C1/C2 必填；C3 至少填 CI 通过）

<!-- 构建绿 ≠ 正确。涉及 DB 读写 / 资金 / 类型的改动，必须提供运行时验证证据 -->

- [ ] 小程序 `tsc -b`（或 `tsgo -p tsconfig.check.json`）零错
- [ ] admin-web `tsc -b` 零错（如涉及）
- [ ] Edge Function `deno check` 通过（如涉及）
- [ ] CI 门禁（本仓库 Actions：miniapp / admin-web / edge-functions / compliance）全绿

**运行时验证证据（C1/C2 附一项）：**
<!-- 选项：node 复现脚本输出 / 真机截图 / 线上 SET ROLE authenticated 模拟会话结果 / 构建产物 grep 确认改动进 dist -->
-

## 四、资金 / 账户类自检（涉及资金必填）

> 红线见 code-review-standards.md §4.3 / §4.4。金豆(健康豆)=tb_balance；推广佣金以金豆发放、不可提现。

- [ ] 买家返利落 `tb_balance` / `tongbao_logs`，**未**错落 `profiles.points`
- [ ] 下发侧改了健康豆 → `refund-order` + `wechat-refund-callback` 退款侧**同步**改扣回
- [ ] 分佣幂等（不重复发放，`commission_distributed` / 唯一约束）
- [ ] 金额精度 `Math.round(x*100)/100`，**无** `Math.floor(x/0.01)`
- [ ] **双通道提现隔离**：门店货款提现（`kind='settlement'`）与用户佣金通道（`kind='commission'`）不串；门店入口用结算余额 RPC，不用 `getCommissionBalance`

## 五、合规自检（全部 PR 必填）

> 口径见 code-review-standards.md §4.5 + §7.1 分层扫描。

- [ ] 无禁旧词：情绪豆 / 通宝 / 分销佣金 / 团队业绩 / 飞轮（CI 硬门禁会拦）
- [ ] 无「人工智能 / 大模型」表述（CI 硬门禁会拦）
- [ ] 去 AI 化：无 AI 图标 / AI 文字残留（用「智能 / 食养 / 推荐」替代）
- [ ] 无医疗宣称（治疗 / 治愈 / 抗炎 / 降血压 等；治愈→舒心/静心/调理）
- [ ] 无绝对化用语（最 / 第一 / 100% 等，除非有依据）
- [ ] 食养内容附「不替代医嘱」提示
- [ ] 统一术语：金豆 / 推广佣金 / 货款提现 / 累计消费额 等（非 GMV / 非分销佣金）
- [ ] 「微信服务商分账」属微信支付官方产品名，合法使用，无需替换

## 六、审查清单引用（Reviewer 用）

Reviewer 请按 code-review-standards.md §4 对应分域清单逐项核对，评论时引用具体条款（如「§4.3 双账户一致未满足」），避免「改一下」式模糊意见。

**打回标准**：任一 C1/C2 清单项未满足、缺验证证据、构建/tsc 未过、混改未拆分。
