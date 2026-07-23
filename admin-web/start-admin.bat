@echo off
chcp 65001 >nul
REM 管理后台(admin-web)一键启动
REM 绕过 `npm run dev` 在 Windows 上的 cmd.exe 崩溃 (npm error code 1073807364)
REM 直接用 managed node 调 vite.js 启动 dev server

cd /d "%~dp0"

set "NODE_BIN=C:\Users\zhanglin\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if not exist "%NODE_BIN%" set NODE_BIN=node

echo [admin-web] 用 %NODE_BIN% 启动 vite dev ...
"%NODE_BIN%" node_modules\vite\bin\vite.js --host --port 5173
