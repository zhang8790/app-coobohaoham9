#!/usr/bin/env bash
# 部署来店有喜全部 Edge Functions 到 Supabase 云端
# 前置条件：
#   1) 修复本地 supabase CLI（当前 --version 报 node 内部错）：
#        npx supabase@latest --version
#   2) 登录（二选一）：
#        supabase login                      # 浏览器交互登录
#        # 或 export SUPABASE_ACCESS_TOKEN=你的token 后：
#        supabase login --token "$SUPABASE_ACCESS_TOKEN"
#   3) 链接项目（只需一次）：
#        supabase link --project-ref pyqgsxcjmijtbstwthbn
#
# 用法（Git Bash / WSL）：
#   bash scripts/deploy-functions.sh
set -e

PROJECT_REF="pyqgsxcjmijtbstwthbn"
FUNCS=(
  wechat_miniapp_login
  emotion-compile
  create-wechat-payment
  get-wechat-openid
  generate-qrcode
  delete-account
  send-redpacket
  article-fetch
  create-order
  refund-order
  distribute-commission
  wechat-payment-callback
  wechat-refund-callback
)

echo "==> 部署 $PROJECT_REF 的 ${#FUNCS[@]} 个云函数"
for fn in "${FUNCS[@]}"; do
  echo "==> deploy: $fn"
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

echo "==> 全部部署完成。可用下面的探测脚本复核："
echo "    node _fn_probe.mjs   （临时脚本，已在上次排查后清理，需要时重建）"
