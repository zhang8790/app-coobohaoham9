#!/usr/bin/env bash
# 部署 admin-update-user-identity Edge Function
# 用途：沙箱内无 Supabase 访问令牌（401），此脚本供你在本机（已 `supabase login`）执行。
#
# 执行前置：本机存在 supabase CLI（npx 会自动拉取），且已登录：
#   npx supabase login
#
# 用法：
#   bash scripts/deploy-ef-identity.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF=pyqgsxcjmijtbstwthbn
FN=admin-update-user-identity

echo "==> 部署 $FN 到 $PROJECT_REF"
npx supabase functions deploy "$FN" --project-ref "$PROJECT_REF"

echo "==> 探针校验（无 JWT 调用应返回 401 = 已部署；404 = 未部署）"
curl -s -o /dev/null -w "   HTTP=%{http_code}\n" -X POST \
  "https://${PROJECT_REF}.supabase.co/functions/v1/${FN}" \
  -H "Content-Type: application/json" -d '{}'

echo "==> 完成。若上面是 401，说明函数已上线（只是拒绝匿名调用），属正常。"
