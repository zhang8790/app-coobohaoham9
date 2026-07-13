# 资金安全修复 · 云函数一键部署脚本
# 用法：在本机（Windows）右键此文件 →「用 PowerShell 运行」
# 脚本会自动处理：安装 CLI → 登录 → 关联项目 → 部署 4 个云函数
# 项目 ref 固定为 pyqgsxcjmijtbstwthbn

$ErrorActionPreference = "Stop"
$PROJECT_REF = "pyqgsxcjmijtbstwthbn"
# 若你已生成 PAT，可在运行前先设环境变量，避免浏览器登录：
#   $env:SB_TOKEN = "sbp_xxxxxxx"
# 不设则脚本会用浏览器 OAuth 登录（会自动弹浏览器授权）

# 切到脚本所在目录（项目根）
Set-Location $PSScriptRoot

Write-Host "`n[1/5] 检查 supabase CLI ..." -ForegroundColor Cyan
$hasCli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $hasCli) {
    Write-Host "  未安装，正在 npm 全局安装 supabase CLI ..." -ForegroundColor Yellow
    npm i -g supabase
}

Write-Host "`n[2/5] 登录 Supabase ..." -ForegroundColor Cyan
if ($env:SB_TOKEN) {
    Write-Host "  使用环境变量 SB_TOKEN 登录 ..." -ForegroundColor Yellow
    supabase login --token $env:SB_TOKEN
} else {
    Write-Host "  将弹出浏览器授权，请完成登录 ..." -ForegroundColor Yellow
    supabase login
}

Write-Host "`n[3/5] 关联项目 ($PROJECT_REF) ..." -ForegroundColor Cyan
supabase link --project-ref $PROJECT_REF

$functions = @("distribute-commission", "create-order", "wechat-payment-callback", "wechat-refund-callback")
Write-Host "`n[4/5] 依次部署 4 个云函数 ..." -ForegroundColor Cyan
foreach ($fn in $functions) {
    Write-Host "  ▶ 部署 $fn ..." -ForegroundColor Green
    supabase functions deploy $fn
}

Write-Host "`n[5/5] 完成 ✅" -ForegroundColor Green
Write-Host "部署后请用以下 SQL 验证 commission_balance 是否开始累加：" -ForegroundColor White
Write-Host "  SELECT id, commission_balance FROM profiles WHERE commission_balance > 0 LIMIT 5;" -ForegroundColor Gray
Write-Host "  SELECT * FROM commissions ORDER BY created_at DESC LIMIT 5;" -ForegroundColor Gray
Read-Host "`n按回车退出"
