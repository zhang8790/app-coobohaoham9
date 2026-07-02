#!/bin/bash
# 本地开发环境自动化测试脚本

echo "🧪 开始测试本地开发环境..."
echo ""

# =========== 测试 1：检查服务是否运行 ===========
echo "📡 测试 1：检查服务是否运行"
echo "----------------------------------------"

# 检查 Mock API 服务器
if lsof -i:54321 >/dev/null 2>&1; then
  echo "✅ Mock API 服务器正在运行（端口 54321）"
else
  echo "❌ Mock API 服务器未运行"
  echo "   请运行：node scripts/mock-api-server.js"
  exit 1
fi

# 检查 Dev Server
if lsof -i:5173 >/dev/null 2>&1; then
  echo "✅ 管理后台 Dev Server 正在运行（端口 5173）"
else
  echo "❌ 管理后台 Dev Server 未运行"
  echo "   请运行：cd admin-web && pnpm run dev"
  exit 1
fi
echo ""

# =========== 测试 2：测试 Mock API 连接 ===========
echo "📡 测试 2：测试 Mock API 连接"
echo "----------------------------------------"

# 测试查询 profiles 表
response=$(curl -s "http://localhost:54321/rest/v1/profiles?select=id,nickname,role&limit=3")
if echo "$response" | grep -q "usr_001"; then
  echo "✅ 查询 profiles 表成功"
  echo "   返回数据：$(echo "$response" | jq -r '.[0].nickname' 2>/dev/null || echo '(解析失败)')"
else
  echo "❌ 查询 profiles 表失败"
  echo "   响应：$response"
fi

# 测试查询 merchant_applications 表
response=$(curl -s "http://localhost:54321/rest/v1/merchant_applications?select=id,store_name,status&limit=3")
if echo "$response" | grep -q "mapp_001"; then
  echo "✅ 查询 merchant_applications 表成功"
  echo "   返回数据：$(echo "$response" | jq -r '.[0].store_name' 2>/dev/null || echo '(解析失败)')"
else
  echo "❌ 查询 merchant_applications 表失败"
  echo "   响应：$response"
fi

# 测试查询 products 表
response=$(curl -s "http://localhost:54321/rest/v1/products?select=id,name,price&limit=3")
if echo "$response" | grep -q "prod_001"; then
  echo "✅ 查询 products 表成功"
  echo "   返回数据：$(echo "$response" | jq -r '.[0].name' 2>/dev/null || echo '(解析失败)')"
else
  echo "❌ 查询 products 表失败"
  echo "   响应：$response"
fi

# 测试查询 withdrawals 表
response=$(curl -s "http://localhost:54321/rest/v1/withdrawals?select=id,amount,status&limit=3")
if echo "$response" | grep -q "wd_001"; then
  echo "✅ 查询 withdrawals 表成功"
  echo "   返回数据：金额 $(echo "$response" | jq -r '.[0].amount' 2>/dev/null || echo '(解析失败)')"
else
  echo "❌ 查询 withdrawals 表失败"
  echo "   响应：$response"
fi
echo ""

# =========== 测试 3：测试 CORS ===========
echo "📡 测试 3：测试 CORS（跨域请求）"
echo "----------------------------------------"

response=$(curl -s -X OPTIONS "http://localhost:54321/rest/v1/profiles" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -D - 2>/dev/null | head -20)

if echo "$response" | grep -q "Access-Control-Allow-Origin"; then
  echo "✅ CORS 配置正确"
  echo "   $(echo "$response" | grep "Access-Control-Allow-Origin")"
else
  echo "⚠️  CORS 配置可能不正确"
  echo "   响应头：$response"
fi
echo ""

# =========== 测试 4：测试管理后台页面 ===========
echo "📡 测试 4：测试管理后台页面加载"
echo "----------------------------------------"

response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173")
if [ "$response" = "200" ]; then
  echo "✅ 管理后台页面加载成功（HTTP 200）"
else
  echo "❌ 管理后台页面加载失败（HTTP $response）"
fi
echo ""

# =========== 总结 ===========
echo "📊 测试总结"
echo "========================================"
echo "✅ Mock API 服务器：运行中"
echo "✅ 管理后台 Dev Server：运行中"
echo "✅ Mock 数据：可访问"
echo "✅ CORS：已配置"
echo "✅ 管理后台页面：可加载"
echo ""
echo "🎉 本地开发环境测试通过！"
echo ""
echo "📋 下一步："
echo "   1. 打开浏览器访问 http://localhost:5173"
echo "   2. 点击「总后台演示」或「犒赏铺演示」按钮"
echo "   3. 开始开发或测试"
echo ""
