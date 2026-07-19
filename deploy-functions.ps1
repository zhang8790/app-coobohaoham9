# ============================================================
# 来店有喜 V3 · 全量云函数一键部署脚本
# 用法：
#   1) 复制 supabase/secrets.local.template.ps1 -> supabase/secrets.local.ps1，填入真实密钥
#   2) 本机（Windows）右键此文件 -> [用 PowerShell 运行]
#
# 说明：
#   - Supabase 自动注入 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY，无需填写
#   - 部署 supabase/functions/ 下的【全部】函数（幂等 upsert，重复运行安全）
#   - 缺密钥的函数仍可部署，仅运行时（被调用时）返回 400[配置缺失]，不影响其它函数
#   - 单个函数部署失败不中断整体，会列出 [失败] 继续下一个
#   - 若已生成 PAT，运行前先设环境变量避免浏览器登录：
#       $env:SB_TOKEN = "sbp_xxxxxxx"
# ============================================================

$ErrorActionPreference = "Stop"
$PROJECT_REF = "pyqgsxcjmijtbstwthbn"

# 切到脚本所在目录（项目根）
Set-Location $PSScriptRoot

Write-Host "`n[1/6] 检查 supabase CLI ..." -ForegroundColor Cyan
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "  未安装，正在 npm 全局安装 supabase CLI ..." -ForegroundColor Yellow
    npm i -g supabase
}

Write-Host "`n[2/6] 登录 Supabase ..." -ForegroundColor Cyan
if ($env:SB_TOKEN) {
    Write-Host "  使用环境变量 SB_TOKEN 登录 ..." -ForegroundColor Yellow
    supabase login --token $env:SB_TOKEN
} else {
    Write-Host "  将弹出浏览器授权，请完成登录 ..." -ForegroundColor Yellow
    supabase login
}

Write-Host "`n[3/6] 关联项目 ($PROJECT_REF) ..." -ForegroundColor Cyan
supabase link --project-ref $PROJECT_REF

# 读取本地密钥（不回显，从文件读）
$secretsFile = Join-Path $PSScriptRoot "supabase/secrets.local.ps1"
$sec = @{}
if (Test-Path $secretsFile) {
    Write-Host "`n[4/6] 读取本地密钥文件 secrets.local.ps1 ..." -ForegroundColor Cyan
    . $secretsFile
} else {
    Write-Host "`n[4/6] 未找到 secrets.local.ps1，将交互询问（留空=跳过该项）..." -ForegroundColor Yellow
}

# 交互补全（仅文件里没填的才问）
function Ask($name, $prompt) {
    if (-not $sec[$name]) { $sec[$name] = Read-Host -Prompt $prompt }
}
Ask "WX_SECRET"                "微信小程序 AppSecret (WX_SECRET)"
Ask "MERCHANT_APP_ID"         "微信 AppID (MERCHANT_APP_ID)"
Ask "MERCHANT_ID"             "微信商户号 MERCHANT_ID（留空跳过支付）"
Ask "MCH_CERT_SERIAL_NO"      "商户证书序列号 MCH_CERT_SERIAL_NO（留空跳过）"
Ask "MCH_PRIVATE_KEY"         "商户API私钥 MCH_PRIVATE_KEY（留空跳过）"
Ask "WECHAT_PAY_PUBLIC_KEY_ID" "微信支付公钥ID（留空跳过）"
Ask "WECHAT_PAY_PUBLIC_KEY"   "微信支付公钥内容（留空跳过）"
Ask "LLM_API_KEY"             "LLM_API_KEY（留空跳过 food-therapy-ai）"
Ask "LLM_BASE_URL"            "LLM_BASE_URL（留空用默认）"
Ask "LLM_MODEL"               "LLM_MODEL（留空用默认）"

# 设置密钥（仅非空；用数组 splat 避免值含空格被拆断）
$toSet = @()
foreach ($k in $sec.Keys) {
    if ($sec[$k]) { $toSet += "$k=$($sec[$k])" }
}
if ($toSet.Count) {
    Write-Host "`n[5/6] 设置 Secrets（仅非空项，$($toSet.Count) 个）..." -ForegroundColor Cyan
    supabase secrets set @toSet
} else {
    Write-Host "`n[5/6] 跳过 Secrets：未提供任何密钥" -ForegroundColor Yellow
}

# 部署 supabase/functions/ 下的全部函数
$fnsDir = Join-Path $PSScriptRoot "supabase/functions"
$fns = Get-ChildItem -Path $fnsDir -Directory | Select-Object -ExpandProperty Name
Write-Host "`n[6/6] 部署 $($fns.Count) 个云函数 ..." -ForegroundColor Cyan
$ok = 0; $fail = 0
foreach ($fn in $fns) {
    Write-Host "  > 部署 $fn ..." -ForegroundColor Green
    try {
        supabase functions deploy $fn
        $ok++
    } catch {
        Write-Host "    [失败] $fn 部署失败：$_" -ForegroundColor Red
        $fail++
    }
}

Write-Host "`n完成 [OK] 成功 $ok / 失败 $fail" -ForegroundColor Green
if ($fail -gt 0) {
    Write-Host "失败的请查看上方 [失败] 原因（多为缺密钥或函数代码语法问题）。" -ForegroundColor Yellow
}
Read-Host "`n按回车退出"
