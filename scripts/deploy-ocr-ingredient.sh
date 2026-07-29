#!/usr/bin/env bash
# 来电有喜 · 部署 ocr-ingredient Edge Function 并配置百度 OCR 密钥
# 用法 (Git Bash):  bash scripts/deploy-ocr-ingredient.sh
# 前提: 已 `supabase login`（或设置环境变量 SUPABASE_ACCESS_TOKEN）
# 说明: 百度密钥仅写入云端加密 secrets，不进入代码仓库（.env.ocr 已被 .gitignore 忽略）

set -euo pipefail

PROJECT_REF="pyqgsxcjmijtbstwthbn"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 1) 读取密钥（专用 .env.ocr，不污染主 .env）
if [ -f "$ROOT/.env.ocr" ]; then
  set -a; . "$ROOT/.env.ocr"; set +a
fi
: "${BAIDU_OCR_API_KEY:?请在 .env.ocr 配置 BAIDU_OCR_API_KEY}"
: "${BAIDU_OCR_SECRET_KEY:?请在 .env.ocr 配置 BAIDU_OCR_SECRET_KEY}"

# 2) 选择 supabase CLI（优先全局，否则 npx 拉取）
if command -v supabase >/dev/null 2>&1; then SB="supabase"; else SB="npx --yes supabase"; fi

echo "▶ 校验登录态..."
if ! $SB functions list --project-ref "$PROJECT_REF" >/dev/null 2>&1; then
  echo "❌ 未登录或无权限。请先执行以下任一："
  echo "   supabase login"
  echo "   或 export SUPABASE_ACCESS_TOKEN=<你的 token>  （https://supabase.com/dashboard/account/tokens）"
  exit 1
fi

echo "▶ 部署 ocr-ingredient 函数（会自动同步 supabase/config.toml 中的 verify_jwt=false，即关掉 JWT 校验）..."
$SB functions deploy ocr-ingredient --project-ref "$PROJECT_REF"

echo "▶ 注入百度 OCR 密钥（云端加密 secrets，不入仓库）..."
$SB secrets set \
  BAIDU_OCR_API_KEY="$BAIDU_OCR_API_KEY" \
  BAIDU_OCR_SECRET_KEY="$BAIDU_OCR_SECRET_KEY" \
  --project-ref "$PROJECT_REF"

echo "▶ 校验部署结果..."
if $SB functions list --project-ref "$PROJECT_REF" 2>/dev/null | grep -qi "ocr-ingredient"; then
  echo "✅ ocr-ingredient 已在函数列表。"
else
  echo "⚠️ 请到 Supabase Dashboard → Edge Functions 确认 ocr-ingredient 已出现。"
fi

echo ""
echo "🎉 完成。去小程序「食品配料安全」重新拍照识别验证（先清缓存/重进页面）。"
