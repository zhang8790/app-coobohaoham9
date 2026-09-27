#!/usr/bin/env bash
# ============================================================
# delete-dead-edge-functions.sh
# 【可选 · 手动执行】删除确认无用的 Edge Function（孤儿函数）
#
# 判定标准（2026-09-27 全仓复核）：以下函数在 src / admin-web / supabase/migrations /
# scripts 中均无 invoke 调用，也无 pg_cron 调度，亦无兄弟 EF 调用；仅存在于
# supabase/functions/<name>/ 自身代码 + supabase/config.toml 的 verify_jwt 配置项 +
# 迁移文件的注释说明（描述为"手动 curl 触发的回算/回填运维工具"）。
# 即：部署在线上但已脱离任何自动/业务链路，可安全删除。
#
# 用法（需先在 Git Bash 中登录并 link 项目）：
#   supabase login
#   supabase link --project-ref pyqgsxcjmijtbstwthbn
#   bash scripts/delete-dead-edge-functions.sh
#
# ⚠️ 删除后不可恢复（函数代码仍在仓库 supabase/functions/<name>/，可随时重建）。
#    若日后需要重新部署，进入对应目录 `supabase functions deploy <name>` 即可。
# ============================================================

set -euo pipefail

PROJECT_REF="pyqgsxcjmijtbstwthbn"

# 经全仓复核确认的 3 个孤儿 Edge Function（无任何调用/调度）
DEAD_EFS=(
  "food-backfill"          # 批量回算运维工具：手动 curl 触发，无自动化链路
  "subject-backfill"       # 科目 key 回算运维工具：手动 curl 触发，无自动化链路
  "product-therapy-sync"   # 食养报告回写工具：描述为手动/商家端保存触发，无调度
)

echo "🔍 待删除的孤儿 Edge Function（共 ${#DEAD_EFS[@]} 个）："
for ef in "${DEAD_EFS[@]}"; do
  echo "  - $ef"
done
echo ""
read -r -p "确认删除以上函数？输入 YES 继续，其他任意键取消: " ANS

if [ "$ANS" != "YES" ]; then
  echo "已取消。"
  exit 0
fi

for ef in "${DEAD_EFS[@]}"; do
  echo "🗑  删除 $ef ..."
  supabase functions delete "$ef" --project-ref "$PROJECT_REF" || {
    echo "  ⚠️  删除 $ef 失败（可能本机未 login/link，或函数已被删）。跳过。"
  }
done

echo "✅ 完成。"

# ------------------------------------------------------------
# 备注：历史工作记录曾提到"4 个死 EF"，本次全仓静态复核仅确认上述 3 个为真正孤儿
# （其余被记 0 引用的 biz-alert 实际被 distribute-commission / pay-reconcile /
# commission-retry 三个活函数调用，属活函数，已排除）。
# 若你记忆中第 4 个的具体名称，告知后可直接在 DEAD_EFS 数组补充对应行即可。
# ------------------------------------------------------------
