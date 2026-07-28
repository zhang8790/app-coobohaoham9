#!/usr/bin/env bash
# ============================================================
# 一键上线「总管理后台集中配置 LLM」
# 作用：建 system_config 表 + RLS，并部署 3 个 Edge Function
# 前置：已 `supabase login` 且项目已 link（或设置好 SUPABASE_ACCESS_TOKEN）
# 用法：bash deploy-llm-config.sh
# ============================================================
set -e

PROJECT_REF="pyqgsxcjmijtbstwthbn"

echo "==> [1/2] 推送数据库迁移（建 system_config 表 + RLS 策略）"
supabase db push

echo "==> [2/2] 部署 3 个 Edge Function（_shared/llmConfig.ts 会随函数自动打包）"
supabase functions deploy product-analyze
supabase functions deploy food-therapy-ai
supabase functions deploy emotion-compile

echo ""
echo "✅ 完成。后续在后台「AI 模型配置」填 URL/Key/Model 保存后，"
echo "   小程序智能识别 / 食疗导购 / 情绪编译 全项目即可统一调用该模型。"
echo "   未填 Key 时自动回退本地规则，不报错。"
