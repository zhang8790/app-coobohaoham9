#!/bin/bash
# 停止本地开发环境

echo "🛑 正在停止来店有喜 - 管理后台（本地开发模式）..."
echo ""

# 停止 Mock API 服务器
if lsof -i:54321 >/dev/null 2>&1; then
  echo "📡 停止 Mock API 服务器..."
  kill $(lsof -t -i:54321) 2>/dev/null
  echo "   ✅ 已停止"
else
  echo "📡 Mock API 服务器未运行"
fi

# 停止管理后台 Dev Server
if lsof -i:5173 >/dev/null 2>&1; then
  echo "🌐 停止管理后台 Dev Server..."
  kill $(lsof -t -i:5173) 2>/dev/null
  echo "   ✅ 已停止"
else
  echo "🌐 管理后台 Dev Server 未运行"
fi

echo ""
echo "✅ 本地开发环境已停止"
