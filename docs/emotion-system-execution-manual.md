# 情绪编译系统 · 标准化执行手册（产品化 / 工程化 / 运营化）

> 适用范围：来店有喜（江湖令）小程序情绪编译系统
> 编制依据：产品方案《系统核心定位升级 + 全模块整合 + 商家工作台 + 编译引擎 + 五屏详情页 + 激活码确权 + 数据闭环》
> 现状基准：2026-07-07 代码探查（V5 情绪系统已具备地基，详见 §1）
> 本手册目标：把方案拆成「可直接排期开发」「可指导商家运营」的标准动作。

---

## 0. 阅读指引

- **产品 / 运营** 看 §2（定位）、§3（整合）、§6（商家 SOP）、§7（指标）。
- **开发** 看 §1（现状缺口）、§4（工程化已落地模块）、§5（待建模块规范）、§8（里程碑）。
- **已落地代码** 见 §9，可直接 import 复用，无需重写。

---

## 1. 现状盘点（已具备 vs 待建设）

### 1.1 已具备（V5 情绪系统地基，直接复用）

| 能力 | 文件 / 表 | 说明 |
|---|---|---|
| 类目情绪策略（11 业态 + 云端热更新） | `src/utils/category-emotion.ts` · `category_emotion_profiles` | 每业态含 tone / allowedMoodTags / metaphors / angles / closers / aliases；支持运营后台改词库即时生效 |
| 标准情绪标签库 | `src/utils/mood-tags.ts` | 6 类 × 5 = 30 个情绪标签 + 场景标签，**已是「标准标签库」雏形** |
| 用户情绪画像 → 推荐 | `src/utils/emotion-recommendation.ts` · `user_emotion_preferences` | 浏览/点击/购买加权记录，OVERLAPS 匹配商品 mood_tags |
| 情绪理解 / 编译云函数 | `supabase/functions/emotion-compile/index.ts` | `understand`（6 情绪态）+ `compile`（规则兜底 + LLM 双通道），落 `product_emotion` |
| 用户情绪态匹配 | `src/pages/emotion-check` · `src/db/emotion.ts` | 6 情绪态（耗竭/孤独/表达驱动/平稳/怀念/渴望），走 `emotion_keywords` 表 |
| 类型与表结构 | `src/db/types.ts` · 迁移 00038/40/41 | `Product.mood_tags[]` `Product.scene_tags[]` `ProductEmotion`（emotion_title/detail）`EmotionTaxonomy`（标签↔情绪态桥接） |
| 通用资产底子 | `Profile.points` / `Profile.balance` | 已有积分 / 余额字段，可作「滋养通宝」承载基础（非情绪专属） |

### 1.2 待建设（方案要求但当前缺失）

| 模块 | 优先级 | 依赖 |
|---|---|---|
| 商家情绪编译工作台（五维标签选择器 + 一键编译 + 评分 + 审核） | P0 | 评分模块（已落地）、规则库（已落地） |
| 五屏情绪价值详情页 | P0 | ProductEmotion 字段、动效规范 |
| 三阶段翻译规则库（结构化、可配置） | P0 | **已落地** `emotion-compile-rules.ts` |
| 编译质量评分算法（100 分 + 违规检测） | P0 | **已落地** `emotion-scoring.ts` |
| 标签权限 / 角色设计（平台/商家/算法引擎） | P0 | 标签表扩展 + 后台 UI |
| 激活码全生命周期（生成/扫码/确权/裂变） | P1 | 新表 + 扫码页 + 锁客联动 |
| 情绪资产 / 徽章 / 滋养通宝 | P1 | Profile 资产扩展 + 犒赏铺接入 |
| 文章编辑器插商品卡 | P1 | content-center/make 改造 |
| 情绪转化漏斗看板 | P1 | 埋点 + 统计表 |
| 我的情绪账单 / 侠客录情绪板块 | P2 | 资产体系成型后 |

---

## 2. 系统核心定位（对齐方案 §一，落到本项目）

方案定位"交易转化中枢"——**用情绪做流量入口，用确权做留存闭环，用资产做复购动力**。本项目已有用户生命周期前半段（首页情绪感知 → 场景匹配 → 详情页转化 → 线下消费确权），缺后半段（情绪资产沉淀 → 文章裂变）。

**采纳结论**：定位成立，无需新建概念，只需把现有 `emotion-check`（感知）→ `explore`/首页（匹配）→ `product` 详情页（转化）→ 订单（确权）串联成显式闭环，并补"资产沉淀 + 文章裂变"两段。

---

## 3. 与现有小程序全模块整合映射

### 3.1 首页三层架构深度融合

现有首页（`pages/index`）+ 探索页（`pages/explore`）+ 情绪感知页（`pages/emotion-check`）已隐含"氛围层 / 引擎层 / 发现层"雏形。整合动作：

| 方案层 | 现有对应 | 整合动作 |
|---|---|---|
| 氛围层（动态背景随情绪标签） | `emotion-check` 输出 6 情绪态 | 把情绪态写入本地缓存 / `profiles`，首页读取后切换背景氛围 class（参考 `campaign-claim` 的 scss 渐变方案，避免 inline 渐变失效） |
| 引擎层（编译得分≥80 优先排序） | `emotion-recommendation.ts` 的 OVERLAPS | 推荐查询增加 `product_emotion.compiled_by` + 评分过滤：仅 `tier='recommend'` 进首页推荐池 |
| 发现层 · 场景卡片 | `explore` 页现有分类 | 卡片绑定「场景 + 情绪」标签组合，点击聚合同标签高分商品池 |
| 发现层 · Feed 卡片 | 现有商品卡 | 主标题改读 `product_emotion.emotion_title`；底部展示确权数据（如"89% 的人觉得被治愈"）替代纯销量 |

### 3.2 文章锁客系统联动

| 方案要求 | 现有基础 | 整合动作 |
|---|---|---|
| 文章编辑器一键插商品卡 | `content-center/make`（**当前无商品卡插入**） | 编辑器增加"插入商品"按钮 → 拉取商品列表 → 插入卡片（标题/文案自动用 `product_emotion.emotion_title/detail`） |
| 消费确权计入分享者分佣 | `user_store_relation`（锁客）+ `commissions` | 文章带来的订单在 `commissions` 记录 `source='article'`，分佣逻辑复用现有二级分销 |
| 爆款文章反哺标签库 | `EmotionTaxonomy` | 提取文章高频情绪词 → 写入 `EmotionTaxonomy` / 标签权重表，反哺编译规则 |

### 3.3 个人中心与资产体系打通

| 方案要求 | 现有基础 | 整合动作 |
|---|---|---|
| 侠客录情绪资产板块 | `pages/user` | 新增"情绪"板块：徽章墙 + 情绪标签画像 + 情绪成长等级 |
| 滋养通宝新增获取渠道 | `Profile.points` / `balance` | 完成情绪确权 → 发放定额通宝（复用 points 字段，新增 `source='emotion_claim'` 流水） |
| 我的情绪账单 | 无 | 新增时间轴页，读确权记录 + 徽章 + 资产变动 |

---

## 4. 工程化已落地模块（本回合采纳）

### 4.1 三阶段翻译规则库 —— `src/utils/emotion-compile-rules.ts`

把方案 §4.1 的"功能→场景→情绪→身份"三阶段句式固化成可配置常量，**前端与商家预览可直接 import 复用**，运营改 `STAGE1/2/3` 常量即生效（后续可改为从 DB 读取，无需发版）。

```ts
import { applyThreeStage } from '@/utils/emotion-compile-rules'
const r = applyThreeStage({
  functionAttr: '热饮、烘焙甜品',
  scene: '深夜加班',
  emotionSatisfaction: '独处放松',
})
// r.stage1 = '加班到__点，需要一口__？'
// r.stage2 = '明明很累了，又不想随便对付自己？'
// r.stage3 = '你是懂得给自己留呼吸空间的人'
```

**集成点（待排期 P0）**：`supabase/functions/emotion-compile/index.ts` 的 `ruleCompile` 当前是简单拼接，应改为消费同一套三阶段模板（函数侧可内联同名常量或抽 `functions/emotion-compile/rules.ts` 镜像），保证规则前端预览与线上编译一致。

### 4.2 编译质量评分算法 —— `src/utils/emotion-scoring.ts`

把方案 §4.2 / §4.3 固化为纯函数 `scoreCompilation()`，满分 100，四维打分 + 三级违规检测，商家工作台可实时预览分数与驳回原因。

```ts
import { scoreCompilation } from '@/utils/emotion-scoring'
const res = scoreCompilation({
  tagDimensions: { function:['热饮'], scene:['深夜'], emotion:['治愈'], identity:['懂生活'], sensory:['温热'] },
  copyText: '加班到十点，需要一口暖的？',
  hasFunctionInfo: true,
  sceneBound: true,
  claimVerifiable: true,
})
// res.total = 100，res.tier = 'recommend'
```

评分维度与权重（与方案一致）：

| 维度 | 权重 | 扣分规则 |
|---|---|---|
| 标签完整度 | 30 | 五维每缺一个 −6；标签与功能弱相关每项 −5 |
| 文案合规性 | 30 | 空洞情绪词无场景绑定每个 −5；功能信息缺失 −10 |
| 场景精准度 | 20 | 算法匹配度 + 人工审核综合（基础 0.85×20） |
| 确权可达性 | 20 | 不可验证直接 0 |

违规等级：`redline`（直接驳回：功能缺失 / 承诺不可验证 / 违反广告法）、`demote`（降权 30%：空洞词≥3 或无绑定 / 弱相关≥2）、`tip`（优化提示，不影响上架）。

---

## 5. 待建设工程化规范（P0/P1）

### 5.1 商家情绪编译工作台（P0）

- 入口：`pages/merchant-center` 增加"情绪编译"菜单 → 新建 `pages/merchant-emotion-compile`（或并入 `merchant-products` 编辑流）。
- 五维标签选择器：消费 `mood-tags.ts` 标准库，按 5 维度分组（功能/场景/情绪/身份/感官），每维限选 1–3。
  - **映射说明**：现有 `mood-tags.ts` 是 6 情绪分类，需扩展为 5 维度结构（或新增 `EMOTION_TAG_DIMENSIONS` 分组常量），与 `emotion-scoring.ts` 的维度对齐。
- 一键编译：调 `emotion-compile` 云函数 `mode='compile'`，回填 `product_emotion`。
- 实时评分：编译后即时调 `scoreCompilation()`，分数 + 违规原因展示，<60 标红驳回、60–79 仅店铺展示、≥80 进推荐池。
- 提交审核：写 `products.review_status='pending'`，后台 `pages/admin-products` 审核流复用。

### 5.2 五屏情绪价值详情页（P0）

- 新建 `pages/product/emotion-detail`（或 `pages/emotion-detail`），读 `product_emotion` + 五屏规范（方案 §5.1）。
- 视觉：燕麦白底 + 轻武侠质感，动效"慢柔缓"。小程序 CSS 限制：**渐变必须用 scss class，不能用 inline**（历史坑，见 `campaign-claim/index.scss`）。
- 五屏：①场景共鸣（问句主标题，无商品名）②状态确认（逐行渐显）③情绪结果（朱砂红感官词）④身份确认（鎏金边框卡片）⑤信任闭环（确权数据大号字，不展示销量）。
- 底部固定栏：收藏/分享 + "去体验"主按钮 + 社会证明小字。

### 5.3 标签权限 / 角色设计（P0）

| 角色 | 操作权限 |
|---|---|
| 平台运营 | 新增/停用标准标签、维护词库、配置关联规则与权重 |
| 商家 | 仅从标准库选择，不可自定义；可申请新增标签，运营审核后生效 |
| 算法引擎 | 按功能描述自动推荐标签，辅助打标 |

工程落地：标签表增加 `status`（active/disabled）、`applicant_id`、`review_status`；后台 `pages/admin-products` 或新建 `pages/admin-tags` 管理。

### 5.4 激活码与情绪确权（P1）

- 新表 `activation_codes`（code / product_id / emotion_tag / store_id / status）、`emotion_claims`（user_id / code / selected_emotion / badge / tongbao）。
- 生成：商家后台按 SKU 批量生成，格式 `emoji+4字母+4数字`。
- 扫码：`pages/emotion-claim`（新建）扫码 → 自动跳转确权页 + 触发锁客（`user_store_relation`）。
- 确权：用户选 4–6 个预设情绪之一 → 发徽章 + 通宝 → 生成专属确权卡可分享。
- 裂变：分享卡扫码同样触发锁客，计入二级分销（`commissions`）。

### 5.5 数据闭环与资产（P1/P2）

- 漏斗埋点：曝光→点击 / 点击→下单 / 下单→确权 / 确权→复购 / 确权→分享。
- 滋养通宝：确权发放在 `points` 流水加 `source` 标记；犒赏铺 `pages/reward-shop` 接入抵扣。
- 我的情绪账单 / 侠客录情绪板块：读确权记录 + 资产变动时间轴。

---

## 6. 商家运营 SOP（指导商家）

1. **录入基础信息**：主图 + 功能参数（成分/规格/价格/用法）。
2. **五维打标**：从标准库勾选，系统实时推荐匹配标签。
3. **一键编译**：生成三阶段文案（标题/详情五屏/分享语）。
4. **人工微调**：可改文案，提交平台审核。
5. **看评分**：≥80 进推荐池，60–79 仅店铺展示，<60 驳回并看逐点优化建议。
6. **上架 + 激活码**：P1 后生成激活码随商品交付，引导用户扫码确权。

---

## 7. 数据闭环指标（运营迭代）

| 漏斗环节 | 指标 | 优化方向 |
|---|---|---|
| 曝光→点击 | 情绪点击率 | 优化首屏场景文案与主图 |
| 点击→下单 | 情绪转化率 | 优化二、三屏共鸣与身份确认 |
| 下单→确权 | 确权完成率 | 优化激活码引导 + 奖励力度 |
| 确权→复购 | 情绪复购率 | 基于情绪标签精准复购推荐 |
| 确权→分享 | 情绪分享率 | 优化确权卡视觉与文案 |

**标签迭代**：周维度淘汰低效标签、月维度更新句式库、季维度迭代评分权重。

---

## 8. 开发落地里程碑

| 阶段 | 周期 | 内容 |
|---|---|---|
| **P0 核心基础** | 20 天 | ① 五维标签库扩展 ② 商家编译工作台 ③ 五屏详情页 ④ 首页推荐联动评分 ⑤ 评分/违规检测（**本回合已落地 §4.2**）+ 规则库（**本回合已落地 §4.1**） |
| **P1 闭环完善** | 30 天 | 激活码全流程、情绪资产/徽章/通宝、转化看板、文章插商品卡、工作台完整版 |
| **P2 智能升级** | 迭代 | 大模型自动打标、千人千面推荐、情绪套餐、分层运营 |

---

## 9. 本回合已落地代码清单

| 文件 | 作用 | 状态 |
|---|---|---|
| `src/utils/emotion-compile-rules.ts` | 三阶段翻译规则库（§4.1），结构化常量 + `applyThreeStage()` | ✅ 新建 |
| `src/utils/emotion-scoring.ts` | 编译质量评分（§4.2）+ 违规检测（§4.3），`scoreCompilation()` + `EMOTION_TAG_DIMENSIONS` | ✅ 新建 |

**复用方式**：商家工作台、五屏详情页、云函数编译均 import 上述模块，避免规则/评分逻辑散落多端。

**后续必须动作（用户侧）**：
- `supabase/functions/emotion-compile/index.ts` 的 `ruleCompile` 升级为消费三阶段模板（保证前后端一致）。
- 五维标签库扩展（对齐 `EMOTION_TAG_DIMENSIONS`）。
- 构建验证：关闭微信开发者工具后 `pnpm exec taro build --type weapp`（Windows 锁目录坑，历史已记录）。
