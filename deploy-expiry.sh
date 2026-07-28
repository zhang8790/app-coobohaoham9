#!/usr/bin/env bash
# ============================================================================
# 保质期预警 + AI 动态折扣引擎 · 一键部署
# 用法：  bash deploy-expiry.sh
# 前置：  已登录 supabase CLI（supabase login）
# 说明：  本脚本只负责把"代码+SQL"推到云端，不改动任何业务数据。
#        数据保持通用：扫描全店铺、折扣用各商品自身成本、阈值走 system_config。
# ============================================================================
set -e

echo ""
echo "== [1/3] 推送数据库迁移（含 00213_expiry_engine_data.sql）=="
supabase db push
echo "    ✅ 迁移已推（stock_batches 增强 / expiry_alert_log / v_near_expiry_products / fn_daily_sales）"

echo ""
echo "== [2/3] 部署 Edge Function: expiry-engine =="
supabase functions deploy expiry-engine
echo "    ✅ expiry-engine 已部署，可手动触发验证："
echo "       curl -X POST https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/expiry-engine \\"
echo "            -H 'Authorization: Bearer <YOUR-ANON-OR-SERVICE-KEY>'"

echo ""
echo "== [3/3] 可选：开启每日定时调度（pg_cron）=="
echo "    在 Supabase Dashboard → SQL Editor 执行以下 SQL 启用每日 02:00 自动跑："
echo "    （把 <YOUR-PROJECT-REF> 与 <KEY> 换成实际值；服务密钥见 Project Settings → API）"
cat <<'SQL'

-- 1) 启用扩展（仅需执行一次）
create extension if not exists pg_cron;

-- 2) 每日 02:00 触发 expiry-engine（幂等：同阶段只推一次预警、折扣可重算）
insert into cron.job (schedule, command, database, nodename)
values (
  '0 2 * * *',
  $$select net.http_post(
       url    := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/expiry-engine',
       headers := '{"Authorization":"Bearer <YOUR-ANON-OR-SERVICE-KEY>"}'::jsonb
     );$$,
  'postgres',
  'postgres'
)
on conflict do nothing;

-- 3) 若只想先对单店验证，可临时手动跑（不依赖定时器）：
--    select net.http_post('https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/expiry-engine?storeId=<STORE_UUID>',
--                         '{}', 'POST',
--                         '{"Authorization":"Bearer <YOUR-ANON-OR-SERVICE-KEY>"}'::jsonb);
SQL

echo ""
echo "🎉 部署脚本执行完毕。未提交改动仍在本地，按惯例等『归档/推送』指令统一提交。"
