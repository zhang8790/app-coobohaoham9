#!/usr/bin/env bash
# ============================================================
# 启用 Supabase 反向代理站点（Ubuntu / nginx）
# 用法（需 sudo）：
#   sudo bash enable-proxy.sh
# 前置：
#   1) 已修改 nginx-supabase-proxy.conf 里的 server_name 为你的备案域名；
#   2) SSL 证书放到脚本中 SSL_CERT / SSL_KEY 指向的路径；
#   3) 域名 A 记录已指向本机公网 IP。
# 本脚本只动 nginx 站点配置，不动业务代码与数据库。
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CONF_SRC="$HERE/nginx-supabase-proxy.conf"
CONF_DST="/etc/nginx/sites-available/supabase-proxy"
ENABLED="/etc/nginx/sites-enabled/supabase-proxy"

# 如证书路径与 conf 中不一致，按需修改这里或 conf
SSL_CERT="/etc/nginx/ssl/api.laidianyouxi.com/fullchain.pem"
SSL_KEY="/etc/nginx/ssl/api.laidianyouxi.com/privkey.pem"

if [ ! -f "$CONF_SRC" ]; then
  echo "错误：找不到 $CONF_SRC" >&2
  exit 1
fi
if [ ! -f "$SSL_CERT" ] || [ ! -f "$SSL_KEY" ]; then
  echo "错误：SSL 证书缺失，请先放好证书：" >&2
  echo "  $SSL_CERT" >&2
  echo "  $SSL_KEY" >&2
  exit 1
fi

echo "==> 安装 nginx（如已装则跳过）"
if ! command -v nginx >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y && apt-get install -y nginx
fi

echo "==> 写入站点配置"
cp "$CONF_SRC" "$CONF_DST"
ln -sf "$CONF_DST" "$ENABLED"
rm -f /etc/nginx/sites-enabled/default

echo "==> 校验并重载 nginx"
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx

echo "✅ 反向代理已启用。请确认："
echo "   - DNS：api.laidianyouxi.com → 本机 IP"
echo "   - 微信后台「服务器域名」request/uploadFile/downloadFile 均填 https://api.laidianyouxi.com"
echo "   - 前端/小程序把 Supabase 端点改为 https://api.laidianyouxi.com（见 README）"
