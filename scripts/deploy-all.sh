#!/usr/bin/env bash
# ============================================================
# 来电有喜 V5 一键部署脚本（本机执行，非沙箱）
# 串起：数据库迁移(dry-run 预览+确认+执行) + 云函数部署 + Dashboard 收尾提示
#
# 前置条件（本机已具备）：
#   1) 已安装 supabase CLI：npm i -g supabase  或  brew install supabase/tap/supabase
#   2) 已登录：supabase login
#   3) 已 link：supabase link --project-ref pyqgsxcjmijtbstwthbn
#
# 用法（Git Bash / WSL / macOS Terminal）：
#   bash scripts/deploy-all.sh
# ============================================================
set -euo pipefail

PROJECT_REF="pyqgsxcjmijtbstwthbn"

# 回到项目根目录（本脚本位于 scripts/ 下）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "📍 当前目录: $(pwd)"
echo "🎯 项目 ref: $PROJECT_REF"
echo ""

# ---- [0] 环境检查 ----
echo "===== [0] 环境检查 ====="
if ! command -v supabase >/dev/null 2>&1; then
  echo "❌ 未找到 supabase CLI，请先安装："
  echo "   npm install -g supabase"
  echo "   或  brew install supabase/tap/supabase"
  exit 1
fi
echo "✅ supabase CLI 就绪: $(supabase --version 2>/dev/null || echo '已安装')"

# ---- [1] 迁移 dry-run 预览（同时验证登录/link）----
echo ""
echo "===== [1] 数据库迁移 dry-run（预览将要执行的迁移）====="
echo ">>> supabase db push --dry-run"
if ! supabase db push --dry-run; then
  echo ""
  echo "❌ dry-run 失败。请确认："
  echo "   1) 已登录: supabase login"
  echo "   2) 已 link: supabase link --project-ref $PROJECT_REF"
  echo "   3) 本地 supabase/config.toml 存在"
  exit 1
fi

echo ""
read -r -p ">>> 以上为将要执行的迁移清单。确认正式执行数据库迁移？(y/N) " CONFIRM
if [[ "${CONFIRM:-n}" != "y" && "${CONFIRM:-n}" != "Y" ]]; then
  echo "⏸️  已取消数据库迁移，脚本退出。"
  exit 0
fi

# ---- [2] 正式执行迁移 ----
echo ""
echo "===== [2] 执行数据库迁移 ====="
supabase db push

# ---- [3] 部署云函数 ----
echo ""
echo "===== [3] 部署全部云函数 ====="
bash scripts/deploy-functions.sh

# ---- [4] Dashboard 手动收尾（脚本无法自动操作 Web UI）----
echo ""
echo "===== [4] 需你在 Supabase Dashboard 手动完成的收尾 ====="
echo "🌐 打开: https://supabase.com/dashboard/project/$PROJECT_REF/functions"
echo ""
echo "  1. 删除 generate-qrcode 的旧 slug '/qrcodes' 死函数（只保留 '/generate-qrcode'）"
echo "  2. 确认 wechat_miniapp_login 已部署成功（微信小程序登录函数，本次新建）"
echo "  3. 确认 Secrets 已配置:"
echo "       MERCHANT_APP_ID = 微信小程序 appid"
echo "       WX_SECRET       = 微信小程序 app secret"
echo ""
echo "✅ deploy-all 执行完毕。"
