@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d C:\Users\zhanglin\Desktop\app-coobohaoham9

echo ============================================
echo  一键部署 Edge Functions（分佣修复版）
echo  项目：pyqgsxcjmijtbstwthbn
echo ============================================
echo.

:: 查找 supabase CLI
call :findSupabase
if errorlevel 1 goto :fail

echo 使用 CLI: %SUPABASE_BIN%
echo.

:: 确认已登录（先尝试列项目，失败则拉起浏览器登录）
%SUPABASE_BIN% projects list >nul 2>&1
if errorlevel 1 (
    echo [提示] 未检测到 Supabase 登录态，正在打开浏览器登录...
    %SUPABASE_BIN% login
    if errorlevel 1 goto :fail
)

:: 确认已 link 项目，若未 link 则自动 link
%SUPABASE_BIN% status >nul 2>&1
if errorlevel 1 (
    echo [提示] 未检测到项目关联，自动执行 link...
    %SUPABASE_BIN% link --project-ref pyqgsxcjmijtbstwthbn
    if errorlevel 1 goto :fail
)

echo [1/3] 部署 distribute-commission（分佣核心，发情绪豆）...
%SUPABASE_BIN% functions deploy distribute-commission
if errorlevel 1 goto :fail

echo [2/3] 部署 create-order（纯豆分支真正触发分佣）...
%SUPABASE_BIN% functions deploy create-order
if errorlevel 1 goto :fail

echo [3/3] 部署 wechat-payment-callback（读店铺让利开关）...
%SUPABASE_BIN% functions deploy wechat-payment-callback
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  全部部署成功！
echo  下一步：用微信开发者工具打开 dist 目录 → 点「上传」
echo ============================================
goto :end

:findSupabase
    :: 1. 检查 PATH 中是否有 supabase
    where supabase >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%i in ('where supabase') do set SUPABASE_BIN=%%i
        exit /b 0
    )
    :: 2. 检查常见 npm 全局目录
    if exist "%LOCALAPPDATA%\npm\supabase.cmd" (
        set SUPABASE_BIN=%LOCALAPPDATA%\npm\supabase.cmd
        exit /b 0
    )
    :: 3. 使用 npx 自动下载（无需全局安装）
    echo [提示] 本机未找到 supabase CLI，使用 npx 自动下载部署...
    set SUPABASE_BIN=npx supabase@latest
    exit /b 0

:fail
echo.
echo [错误] 部署失败。常见原因：
echo   1. 未登录 Supabase：请先在命令行执行  supabase login
echo   2. 网络问题导致 npx 无法下载 CLI
echo   3. 项目未 link：请执行  supabase link --project-ref pyqgsxcjmijtbstwthbn
echo.
echo 若你已有本机 supabase CLI，请把所在目录加到系统 PATH 后再运行本脚本。
echo.
pause
exit /b 1

:end
pause
