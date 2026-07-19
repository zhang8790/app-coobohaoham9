# ============================================================
# deploy-and-fix.ps1 —— 一键修复 + 部署（接推荐分佣链路）
#
# 前置：
#   1) 在 https://supabase.com/dashboard/account/tokens 生成 access token
#   2) 把 token 设为环境变量后运行本脚本，或直接粘贴到下方提示
#   3) supabase CLI 已可用（本脚本会自检）
#
# 运行（PowerShell）：
#   $env:SUPABASE_ACCESS_TOKEN = "你的token"
#   cd C:\Users\zhanglin\Desktop\app-coobohaoham9
#   .\supabase\deploy-and-fix.ps1
#
# 本脚本会做：
#   A) 登录 CLI（用 token）
#   B) 通过 Management API 给 profiles 补 referrer_id 列（fix-referrer-id.sql）
#   C) 部署不需要外部密钥的函数（distribute-commission 等，避免 404）
#   D) 通过 Management API 把 18701410500 的 referrer_id 指向 18565613635（link_referrer.sql）
#   E) 校验结果
#
# 注意：wechat_miniapp_login / get-wechat-openid / create-wechat-payment / food-therapy-ai
#       依赖微信 / LLM 密钥，需先在 Supabase 后台设置 Secrets 后才会正常运行（部署本身不报错）。
# ============================================================

param(
  [string]$Token = ""
)

$ErrorActionPreference = "Stop"
$REF = "pyqgsxcjmijtbstwthbn"
$PROJECT_DIR = "C:\Users\zhanglin\Desktop\app-coobohaoham9"
Set-Location $PROJECT_DIR

# ---- 取 token ----
if (-not $Token) { $Token = $env:SUPABASE_ACCESS_TOKEN }
if (-not $Token) {
  $Token = Read-Host -Prompt "粘贴你的 Supabase access token"
}
if (-not $Token) { Write-Error "未提供 token，退出"; exit 1 }
$env:SUPABASE_ACCESS_TOKEN = $Token

# ---- 自检 CLI ----
supabase --version | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "supabase CLI 不可用，请先安装"; exit 1 }
Write-Host "✅ supabase CLI 就绪" -ForegroundColor Green

# ---- A) 登录 ----
Write-Host "`n=== A) supabase login ===" -ForegroundColor Cyan
supabase login --token $Token 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "登录失败"; exit 1 }
Write-Host "✅ 登录成功" -ForegroundColor Green

# ---- Management API 执行 SQL 的辅助函数 ----
function Invoke-SupabaseSql {
  param([string]$Sql)
  $body = @{ query = $Sql } | ConvertTo-Json -Compress
  $hdr = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }
  try {
    $r = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$REF/database/query" `
      -Method Post -Headers $hdr -Body $body -TimeoutSec 60
    return $r
  } catch {
    Write-Host "  ⚠️ SQL 执行异常: $_" -ForegroundColor Yellow
    return $null
  }
}

# ---- B) 补 referrer_id 列 ----
Write-Host "`n=== B) 补 profiles.referrer_id 列 ===" -ForegroundColor Cyan
$sqlFix = Get-Content -Raw "$PROJECT_DIR\supabase\fix-referrer-id.sql"
$res = Invoke-SupabaseSql -Sql $sqlFix
if ($null -ne $res) { Write-Host "✅ 列修复 SQL 已提交" -ForegroundColor Green }
else { Write-Host "❌ 列修复失败，请检查 token 权限" -ForegroundColor Red }

# ---- C) 部署不依赖外部密钥的函数 ----
Write-Host "`n=== C) 部署函数（无外部密钥）===" -ForegroundColor Cyan
$noSecretFns = @(
  "distribute-commission",
  "create-order",
  "wechat-payment-callback",
  "cleanup",
  "delete-account",
  "refund-order",
  "send-notification",
  "send-redpacket",
  "article-fetch",
  "generate-qrcode",
  "product-mutate",
  "emotion-compile"
)
foreach ($fn in $noSecretFns) {
  Write-Host "  → 部署 $fn ..." -ForegroundColor Gray
  supabase functions deploy $fn --project-ref $REF 2>&1 | Select-Object -Last 3
}

# ---- D) 绑定上级关系 ----
Write-Host "`n=== D) 绑定 18565613635 为 18701410500 的上级 ===" -ForegroundColor Cyan
# 先确认两个账号是否存在
$checkSql = "SELECT phone, id, referrer_id FROM public.profiles WHERE phone IN ('18565613635','18701410500') ORDER BY phone;"
$existing = Invoke-SupabaseSql -Sql $checkSql
if ($null -ne $existing) {
  $existing | Format-Table | Out-String | Write-Host
}
$sqlLink = Get-Content -Raw "$PROJECT_DIR\supabase\link_referrer.sql"
$res2 = Invoke-SupabaseSql -Sql $sqlLink
if ($null -ne $res2) { Write-Host "✅ 绑定 SQL 已提交" -ForegroundColor Green }
else { Write-Host "❌ 绑定失败（可能两账号尚未存在，需先用 service_role 建号）" -ForegroundColor Red }

# ---- E) 校验 ----
Write-Host "`n=== E) 校验结果 ===" -ForegroundColor Cyan
$verifySql = @"
SELECT sub.phone AS 下级, sup.phone AS 上级, sup.referral_code AS 上级推广码
FROM public.profiles sub
LEFT JOIN public.profiles sup ON sup.id = sub.referrer_id
WHERE sub.phone = '18701410500';
"@
$verify = Invoke-SupabaseSql -Sql $verifySql
if ($null -ne $verify) { $verify | Format-Table | Out-String | Write-Host }

Write-Host "`n--- 完成 ---" -ForegroundColor Green
