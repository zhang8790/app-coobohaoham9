#!/usr/bin/env bash
# 管理后台(admin-web)一键启动
# 绕过 `npm run dev` 在 Windows 上的 cmd.exe 崩溃 (npm error code 1073807364)
# 直接用 managed node 调 vite.js 启动 dev server
set -e
cd "$(dirname "$0")"

NODE_BIN="/c/Users/zhanglin/.workbuddy/binaries/node/versions/22.22.2/node.exe"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="node"
fi

echo "[admin-web] 用 $NODE_BIN 启动 vite dev ..."
exec "$NODE_BIN" node_modules/vite/bin/vite.js --host --port 5173
