# 用户行为分析模型设计（BEHAVIOR ANALYTICS）

> 配套《高端会员经济设计方案》的行为预测与运营闭环模块。
> 核心结论：**全部技术为确定性统计模型，无需任何训练 / AI 推理模型，可解释、可审计、合规友好、零额外成本。**

## 一、技术映射总表

| 技术 | 是否需 ML 模型 | 落地方式 | 数据来源 |
|---|---|---|---|
| 衰减因子 | 否 | 指数加权活跃度 `Σ wᵢ·e^(−λ·Δt)` | orders / emotion_claims / gold_bean_logs 的 created_at |
| 行为模式 | 否 | 多维加权（复购/确权/消费） | 同上 |
| 数据回流分析 | 否 | 预测→干预闭环，写入 notifications | 预测结果 → `notifications` |
| 用户触发条件 | 否 | 规则引擎（参考现有 risk-control 模式） | 规则集 |
| 阶段间时间窗口 | ⚠️ 需新表 | 依赖 `member_rank_events` 历史 | 00086 新建表 |
| 复购周期分析 | 否 | 订单间隔分位 / 生存分析 | orders |
| 马尔可夫链 | 否 | 状态序列→转移计数→归一化矩阵 P | 订单+确权时间戳切状态 |

## 二、模块设计（`admin-web/src/utils/behavior-analytics.ts`）

纯函数 + Supabase 查询封装，客户端聚合（数据量可控，无需物化视图/ML 服务）。

### 2.1 衰减活跃度 `decayActivity(raw, lambdaDays=30, asOf)`
- 按行为类型赋权：`purchase=3`、`claim=2`、`earn=1`。
- 活跃度 = `Σ weight · e^(−Δt / lambdaDays)`，λ 默认 1/30 天（可调）。
- 输出：`score`（原始分）、`halfLifeDays`（半衰期）、`lastActiveAt`。

### 2.2 复购周期 `repurchaseCycle(raw)`
- 每用户订单 `created_at` 排序取相邻 `lag` 间隔，汇总为全局直方图与中位数 `globalMedianDays`。
- 输出：`globalMedianDays`、`histogram`（按 7/15/30/45/60/90+ 天分桶）。

### 2.3 马尔可夫通用 `buildMatrix(seqs, stateOrder, pseudo=0)`
- 输入：若干用户的状态时间序列（由时间戳切分）。
- 计数 `C[i→j]`，加 `pseudo`（平滑，避免零转移）→ 行归一化为 `P`。
- `predictNext(P, current, steps=1)`：矩阵幂递推 N 步分布。

### 2.4 三套状态空间
| 空间 | 状态 | 切分依据 |
|---|---|---|
| 生命周期 `markovLifecycle` | 新客 / 活跃 / 沉默 / 流失 | 距上次订单 Δt：≤15 活跃、15–45 沉默、>45 流失；首单前为新客 |
| 段位 `markovRank` | 散修→…→掌门（六阶） | 读 `member_rank_events` 时序 |
| 确权 `markovClaim` | 未确权 / 已确权 / 复确权 | 首次确权、再次确权 |

### 2.5 流失风险 `churnRisk(raw, repurchase, asOf)`
- 规则：`daysSinceLastOrder > globalMedianDays × 1.5` 即标记高风险。
- 输出：`ChurnUser[]`（含 `riskScore`、`daysSinceLastOrder`、`suggestion`）。

### 2.6 触发规则 `buildTriggers(raw, churn, decay)`
- 例：距上次订单 > 复购周期中位数 且 已确权 ≥ 3 → 流失预警。
- 输出：`Trigger[]`（含 `type`、`userId`、`reason`、`action` 建议关怀方式）。

### 2.7 聚合 `computeAll(raw, asOf)`
- 一次性返回 `BehaviorReport`（衰减/复购/三套马尔可夫/流失/触发），供看板消费。

## 三、看板 `BehaviorAnalytics.tsx`
- KPI 卡：全局复购周期、流失风险数、命中触发数、活跃度健康度。
- 马尔可夫热力图：三态切换 Tab，色块深浅 = `P[i→j]`。
- 复购直方图：SVG 柱状。
- 流失风险列表：Top 15 高风险用户 + 建议动作。
- 触发规则面板：列出命中规则，支持「一键关怀」→ 写 `notifications`（闭环，复用现有体系，NOT NULL 字段已补齐：title/type/message）。

## 四、数据闭环（A+B+C）
```
行为数据(orders/claims/ranks) ──► behavior-analytics 聚合
        │                              │
        └── member_rank_events ◄── syncMemberRank
                                       │
                            churnRisk / buildTriggers
                                       │
                            高风险/命中触发 ──► notifications(关怀) ◄── 回流
```

## 五、合规护栏
- 内部运营分析，聚合匿名化；不做歧视性定价、不对外评级、不搞社会信用式评分。
- 未来建议加「个性化开关」总闸（PIPL 友好）。
- 全程零资金写入、零提现/兑换链路，仅读历史 + 发通知。

## 六、依赖迁移（需用户本机执行，沙箱无 CLI）
- `00085_merge_points_to_gold_beans.sql`：合并历史积分。
- `00086_member_rank_events.sql`：段位事件表。
- 未执行不影响前端构建（代码已容错），但阶段时间窗口 / 段位态马尔可夫需该表有数据才出数。
