@echo off
chcp 65001 >nul
cd /d C:\Users\zhanglin\Desktop\app-coobohaoham9

:: 从 admin-web/.env.local 读取 service_role key（你只需填一次）
set KEY=
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "VITE_SUPABASE_SERVICE_ROLE_KEY" admin-web\.env.local`) do set KEY=%%b

if "%KEY%"=="" (
    echo [错误] 未在 admin-web\.env.local 找到 VITE_SUPABASE_SERVICE_ROLE_KEY
    echo.
    echo 请先操作（一次性）：
    echo   1. 打开 Supabase Dashboard → Project Settings → API
    echo   2. 复制 service_role 密钥
    echo   3. 粘贴到 admin-web\.env.local 的  VITE_SUPABASE_SERVICE_ROLE_KEY=  后面
    echo.
    pause
    exit /b 1
)

set SUPABASE_URL=https://pyqgsxcjmijtbstwthbn.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=%KEY%

echo ============================================
echo  补跑历史漏单分佣（纯豆 + 混合）
echo ============================================
echo.
node scripts/backfill-commission.mjs --apply
echo.
pause
