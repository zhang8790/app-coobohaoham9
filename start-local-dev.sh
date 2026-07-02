#!/bin/bash
# 本地开发环境一键启动脚本

echo "🚀 启动来店有喜 - 管理后台（本地开发模式）"
echo ""

# 检查端口是否被占用
if lsof -i:54321 >/dev/null 2>&1; then
  echo "⚠️  端口 54321 已被占用，停止旧进程..."
  kill $(lsof -t -i:54321) 2>/dev/null
  sleep 1
fi

if lsof -i:5173 >/dev/null 2>&1; then
  echo "⚠️  端口 5173 已被占用，停止旧进程..."
  kill $(lsof -t -i:5173) 2>/dev/null
  sleep 1
fi

# 启动本地 Mock API 服务器
echo "📡 启动本地 Mock API 服务器..."
node "$(dirname "$0")/scripts/mock-api-server.js" &
MOCK_PID=$!
echo "   Mock API 服务器已启动（PID: $MOCK_PID）"
echo "   URL: http://localhost:54321"
echo ""

# 等待 Mock API 服务器就绪
sleep 2

# 启动管理后台 Dev Server
echo "🌐 启动管理后台 Dev Server..."
cd "$(dirname "$0")/admin-web"
pnpm run dev &
DEV_PID=$!
echo "   管理后台 Dev Server 已启动（PID: $DEV_PID）"
echo "   URL: http://localhost:5173"
echo ""

echo "✅ 本地开发环境已启动！"
echo ""
echo "📋 可用的 URL："
echo "   管理后台：http://localhost:5173"
echo "   Mock API：http://localhost:54321"
echo ""
echo "💡 使用方法："
echo "   1. 打开 http://localhost:5173"
echo "   2. 点击「总后台演示」或「犒赏铺演示」按钮"
echo "   3. 开始开发或测试"
echo ""
echo "🛑 停止方法：按 Ctrl+C 或运行 ./stop-local-dev.sh"
echo ""

# 等待用户中断
trap "echo ''; echo '🛑 正在停止服务...'; kill $MOCK_PID $DEV_PID 2>/dev/null; exit" INT TERM
wait
