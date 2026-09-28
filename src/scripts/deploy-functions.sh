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
#   bash src/scripts/deploy-functions.sh
set -e

PROJECT_REF="pyqgsxcjmijtbstwthbn"

# 动态扫描 supabase/functions/ 下的真实函数目录（含 index.ts），排除 _ 开头的共享目录。
# 历史教训：这里曾硬编码函数名列表，函数删掉后列表没同步，导致全量部署必然失败。
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FUNCS=($(cd "$ROOT_DIR/supabase/functions" && ls -1 | grep -v '^_' | while read d; do [ -f "$d/index.ts" ] && echo "$d"; done))

if [ ${#FUNCS[@]} -eq 0 ]; then
  echo "!! 未扫描到任何函数目录，请检查 $ROOT_DIR/supabase/functions"
  exit 1
fi

echo "==> 部署 $PROJECT_REF 的 ${#FUNCS[@]} 个云函数：${FUNCS[*]}"
for fn in "${FUNCS[@]}"; do
  echo "==> deploy: $fn"
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

echo "==> 全部部署完成。可用下面的探测脚本复核："
echo "    node _fn_probe.mjs   （临时脚本，已在上次排查后清理，需要时重建）"
