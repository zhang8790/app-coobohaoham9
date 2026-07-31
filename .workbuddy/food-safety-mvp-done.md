# 食品配料安全管理系统 · MVP 落地总结（建立在原有 API 上）

> 用户拍板：「全部完成，建立在原来的 APi 基础上」→ MVP 直接扩展「来电有喜」既有 Supabase/Taro 栈，不新建 Spring Boot 项目。
> 「原来的 API」= 已存在的 `src/db/food-api.ts` + `ocr-ingredient`/`product-analyze` Edge Function + `food_additives` 表。

## 已交付（端到端可用，已部署/校验）

### 1. 数据库迁移（已上线）
- `supabase/migrations/00220_food_safety_libs.sql` → `supabase db query --linked --file` 已执行。
- 新增三张可维护基础表 + 种子：
  - `food_allergens`（8 类：大豆/芝麻/花生/小麦/乳制品/虾/蟹/坚果）
  - `food_crowd_triggers`（12 条触发词→crowd_code：谷氨酸钠/食用盐/氯化钠→高血压；植物油/白砂糖/麦芽糖浆→高血脂；白砂糖/果葡糖浆/淀粉/麦芽糖→糖尿病；动物提取物/高嘌呤→痛风）
  - `food_crowd_tips`（13 条人群文案：高血压/高血脂/糖尿病/痛风/儿童 + 各过敏原提示）
- `food_analysis_reports`（标准报告持久化 + 绑定商品）
- `ingredient_ocr_tasks` 扩展 `safety_level`(4 档) + `report_json` 列
- 验证：food_allergens=8、food_crowd_triggers=12、food_crowd_tips=13、ocr 扩展列存在（线上真实查询确认）

### 2. 规范引擎 Edge Function（已部署上线）
- `supabase/functions/ingredient-analyze/index.ts` → `supabase functions deploy` 已部署。
- 流程：清洗 → 匹配三库(food_additives 含别名 / food_allergens / food_crowd_triggers) → **4 档评级** → 产出用户规格的标准 JSON → 持久化 `food_analysis_reports`。
- 4 档算法：高风险→C不推荐；限量≥3→B适度慎选；限量1-2→A含限量成分；全安全→A优选。
- 标准 JSON 字段：`safe_level` / `main_conclusion{general,children,fit_people,unfit_people}` / `health_shortboard_tip`(结合 user_health_profile 个性化) / `additive_list[{name,level,type,desc}]` / `crowd_tips[]`。
- `deno check` 类型校验通过。

### 3. 小程序前端（tsc 新增文件零错误）
- `src/db/food-safety.ts`：新类型 + 客户端（getFoodAllergens / getFoodCrowdTips / getFoodCrowdTriggers / getFoodAnalysisReport(s) / callIngredientAnalyze）。
- `src/pages/food/analysis-result/index.tsx`：**C 端标准报告页**（即用户截图格式：评级大卡 + 核心结论 + 健康短板提示 + 添加剂明细 + 人群提示标签 + 解析配料）。
- `src/pages/food/food-scan/index.tsx`：加「查看标准安全报告」入口（把当前配料文本传给新页面）。
- `src/app.config.ts`：注册 `pages/food/analysis-result` 路由。

### 4. 管理后台（admin-web，tsc -b 零错误）
- `admin-web/src/pages/FoodSafetyLibs.tsx`：**三库可维护页**（添加剂安全库 / 过敏原库 / 人群触发词 / 人群文案 四 Tab，增删改查，后台维护即生效、无需改代码）。
- `admin-web/src/App.tsx`：注册路由 `/food-safety-libs`。

## 验证结果
- 迁移上线真实查询：✅ 三表种子 + 扩展列均存在
- EF 部署：✅ `Deployed Functions ... ingredient-analyze`
- 前端 tsc --noEmit：✅ 新增文件零错误（仅环境级 `@types/minimatch`/`sass` 缺失，与改动无关）
- admin-web tsc -b：✅ 0 错误
- EF 实时联调：⚠️ 未在沙箱跑（无 `functions invoke` 子命令 + Docker 未运行）；请在微信开发者工具内点「查看标准安全报告」触发验证

## 关键决策修正（写入跨项目记忆）
- 旧 V1.0 规划里的「Spring Boot / 独立 food-safety-system/ 目录」方案**已废弃**——用户明确建立在原 Supabase/Taro API 上。后续勿新建独立后端。

## 下一步可选
- 小程序内联调 `ingredient-analyze`（点「查看标准安全报告」）
- 商品详情页加「配料安全」卡（读取最新 `food_analysis_reports` 绑定商品）
- 把 `code-review-standards.md` 纳入 PR 模板 + CI 门禁
