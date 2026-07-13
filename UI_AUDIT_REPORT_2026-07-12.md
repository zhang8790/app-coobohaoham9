# 小程序全量 UI 体检报告（2026-07-12）

> 范围：`src/pages` 下 73 个页面 + 公共组件
> 方法：全量 grep + 关键文件精读 + 跳转目标存在性核验
> 目标：摸排「看不清 / 违规 / 不能点击」三类问题

---

## 一、「不能点击」结果

### ✅ 无死链（好消息）
- 枚举全部 `navigateTo / redirectTo / switchTab / reLaunch` 调用，目标页面 **100% 真实存在**（含二级目录 `merchant-campaigns/create`、`content-center/make`、`content-center/my-articles`）。
- `admin` 页 `cards/platformCards` url、`user` 页「侠客中心」4 按钮 url 全部有效。
- 登录页协议跳转（上次修复）已验证编入 `dist`。

### 🟡 1 处潜在风险：messages 动态跳转静默失败
- **位置**：`src/pages/messages/index.tsx:91`
- **现象**：`target` 来自后端 `payload.page`，`catch` 后仅 `console.warn`，**用户点击无反应且无任何 toast 提示**。
- **风险**：若后端误配不存在的页面路径，用户感知「点了没用」。
- **建议**：`catch` 内补 `Taro.showToast({ title: '页面不存在', icon: 'none' })` 兜底。

---

## 二、「看不清」结果

### 🔴 1 处明确低对比度：商家端 `#CCC` 灰字
- **位置**：`merchant-products/index.tsx:694-695`（"支持 MP4/MOV 格式"、"最长 60 秒，最大 200MB"）
- **现象**：硬编码 `color:#CCC` 落在白底，对比度 ≈ 1.6:1，远低于 WCAG 3:1。
- **建议**：改为 `#999` 或 token `text-muted-foreground`。

### 🟡 一批偏弱灰字（可看清但偏灰，深浅模式不一致）
- `merchant-*` 端大量硬编码 `#999`（emotion-bill、user、content-center、store-home、merchant-* 等）+ `text-muted-foreground/50` + `text-gray-400/500`。
- 浅色模式下对比度约 3:1，偏灰偏弱；深色模式 OK。
- 建议：统一改用 token（`text-muted-foreground`），避免硬编码 `#999/#CCC`，保证深浅模式一致。

### ✅ 其余 `text-xs + text-muted-foreground` 在正常卡片背景上对比度可接受。

---

## 三、「违规」结果（合规）

### 🔴 高优先级：小程序内置管理端明文展示敏感信息（脱敏漏网）
之前脱敏只做了**网页版 admin-web**，漏了小程序内的 `admin-*` 管理端：
- `admin-withdrawals/index.tsx:96` → 提现审核列表手机明文
- `admin-refunds/index.tsx:131` → 退款审核手机明文
- `admin-users/index.tsx:96` → 用户管理手机明文
- `admin-merchants/index.tsx:90` → 商家联系电线明文

- **风险**：《个人信息保护法》要求个人信息展示脱敏，小程序管理端同样适用。
- **建议**：移植统一脱敏逻辑到小程序端工具函数（网页版已有 `mask.ts` 可作为参照），管理端列表/详情接上。

### 🟡 中优先级：「治愈」措辞的疗效暗示风险
- **位置**：`index/index.tsx:16` '治愈空间'、`search/index.tsx:12` '想要治愈'、`ugc-publish/index.tsx:8` '治愈' 等。
- **现象**：食养商品 + 情绪营销语境用「治愈」，易被监管认定暗示商品疗效。
- **已正确示范**：`emotion-check` 用「传统食养参考」措辞（合规正确，无疗效承诺）。
- **建议**：商品/食养相关「治愈」→ 改「舒缓 / 放松 / 疗愈」；纯情绪心理类可保留「治愈情绪」但需与商品脱钩。

### ✅ 绝对化用语：未发现违规（协议「唯一依据」系结算条款，非广告语）。
### ✅ 医疗宣称：未发现（emotion 模块已用「传统食养参考」合规措辞）。

---

## 四、修复优先级建议

| 优先级 | 问题 | 位置 | 类型 |
|---|---|---|---|
| 🔴 高 | 小程序 `admin-*` 管理端手机/电话明文 | admin-withdrawals:96 / admin-refunds:131 / admin-users:96 / admin-merchants:90 | 违规 |
| 🔴 高 | 商家端 `#CCC` 灰字看不清 | merchant-products:694-695 | 看不清 |
| 🟡 中 | messages 跳转失败无提示 | messages:91 | 不能点击 |
| 🟡 中 | 「治愈」措辞疗效暗示 | index/search/ugc-publish | 违规 |
| 🟢 低 | 商家端硬编码 `#999/#CCC` 统一 token | merchant-* / content-center 多处 | 看不清 |

---

## 五、结论
- **结构健康**：跳转链路无死链，登录页协议跳转已修复。
- **主要短板在合规与可读性**：小程序管理端脱敏是上次网页版整改的漏网之鱼（🔴）；商家端硬编码浅灰字导致个别处真正看不清（🔴）。
- 建议优先处理 2 个 🔴，再清 2 个 🟡。
