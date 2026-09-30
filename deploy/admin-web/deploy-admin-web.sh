#!/usr/bin/env bash
# ============================================================
# admin-web 静态站点一键部署（Ubuntu / nginx）
# 目标机：124.222.23.34  Ubuntu 26.04 LTS  (用户 ubuntu)
# 用法（在服务器上，需 sudo）：
#   sudo bash deploy-admin-web.sh /path/to/admin-web-dist.tar.gz
# 说明：dist 包内应直接是 index.html + assets/（vite build 产物）
# 环境变量：PORT（默认 80）
# ============================================================
set -euo pipefail

SITE_ROOT="/var/www/admin-web"
NGINX_CONF="/etc/nginx/sites-available/admin-web"
PORT="${PORT:-80}"

if [ "$#" -lt 1 ]; then
  echo "用法: sudo bash $0 /path/to/admin-web-dist.tar.gz" >&2
  exit 1
fi
PKG="$1"

echo "==> [1/6] 安装 nginx（如已装则跳过）"
if ! command -v nginx >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y nginx
else
  echo "    nginx 已安装: $(nginx -v 2>&1)"
fi

echo "==> [2/6] 准备站点目录 $SITE_ROOT"
mkdir -p "$SITE_ROOT"
find "$SITE_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

echo "==> [3/6] 解包 $PKG"
case "$PKG" in
  *.tar.gz|*.tgz) tar -xzf "$PKG" -C "$SITE_ROOT" ;;
  *.zip)
    command -v unzip >/dev/null 2>&1 || { export DEBIAN_FRONTEND=noninteractive; apt-get install -y unzip; }
    unzip -o "$PKG" -d "$SITE_ROOT" ;;
  *) echo "不支持的包格式（支持 .tar.gz/.tgz/.zip）" >&2; exit 1 ;;
esac

# 若包内多了一层目录，自动下移
if [ ! -f "$SITE_ROOT/index.html" ]; then
  inner="$(find "$SITE_ROOT" -maxdepth 3 -name index.html | head -1 || true)"
  if [ -n "$inner" ]; then
    d="$(dirname "$inner")"
    shopt -s dotglob
    mv "$d"/* "$SITE_ROOT"/ 2>/dev/null || true
    shopt -u dotglob
    rm -rf "$d"
  fi
fi

if [ ! -f "$SITE_ROOT/index.html" ]; then
  echo "错误：解包后未找到 index.html，请检查 dist 包结构" >&2
  exit 1
fi

echo "==> [4/6] 写入 nginx 配置 $NGINX_CONF"
cat > "$NGINX_CONF" <<EOF
server {
    listen $PORT default_server;
    listen [::]:$PORT default_server;
    server_name _;
    root $SITE_ROOT;
    index index.html;

    # ---------- 传输性能 ----------
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;

    # ---------- gzip 压缩 ----------
    # 注意：nginx.conf 里虽有 gzip on，但 gzip_types 默认只有 text/html，
    # 不加下面这行则 .js/.css 一律明文传输（首屏 986KB 的元凶）。
    gzip on;
    gzip_static on;              # 优先直接吐构建期预压缩的 .gz（省 CPU）
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_proxied any;
    gzip_http_version 1.1;
    gzip_types
        text/plain
        text/css
        text/xml
        application/javascript
        application/x-javascript
        application/json
        application/manifest+json
        application/xml
        application/xml+rss
        image/svg+xml;

    # SPA 路由回退
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # 静态资源长缓存（vite 产物带 hash）
    # 资源缺失必须明确 404，绝不兜底成 index.html。
    # 否则浏览器会把 HTML 当 JS/CSS 解析 → 静默失败 → 整页白屏（排查极其困难）。
    # 注意：本段 heredoc 无引号，注释里也不能出现未转义的美元变量，否则 set -u 会中断部署。
    location /assets/ {
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 其它构建产物（favicon.svg / icons.svg 等）
    location ~* \.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    # index.html 不缓存，保证发版即时生效
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}

# ============================================================
# 【HTTPS 就绪模板 —— 默认关闭，需手动启用】
# 启用条件（三者齐备）：
#   1) 一个已备案(ICP)域名，如 admin.laidianyouxi.com，A 记录指向本机 IP；
#   2) TLS 证书与私钥（腾讯云/Let's Encrypt 申请），放到下面 SSL_CERT/SSL_KEY 路径；
#   3) 微信小程序后台「业务域名」改为该 HTTPS 域名（否则真机图片白屏）。
#
# 启用步骤：
#   a) 取消下面整段注释；
#   b) 把 listen 80 的 server 段改成仅做 301 跳转（见下方 redirect 段）；
#   c) 将 SSL_CERT / SSL_KEY 换成真实路径；
#   d) 重新跑本脚本部署，nginx -t 通过后即生效。
#
# server {
#     listen 443 ssl default_server;
#     listen [::]:443 ssl default_server;
#     server_name admin.laidianyouxi.com;   # 改成你的域名
#     root $SITE_ROOT;
#     index index.html;
#
#     ssl_certificate     /etc/nginx/ssl/admin.laidianyouxi.com/fullchain.pem;
#     ssl_certificate_key /etc/nginx/ssl/admin.laidianyouxi.com/privkey.pem;
#     ssl_protocols TLSv1.2 TLSv1.3;
#     ssl_ciphers HIGH:!aNULL:!MD5;
#
#     sendfile on; tcp_nopush on; keepalive_timeout 65;
#     gzip on; gzip_static on; gzip_comp_level 6; gzip_vary on;
#     gzip_types text/plain text/css application/javascript application/json image/svg+xml;
#
#     location / { try_files \$uri \$uri/ /index.html; }
#     location /assets/ { expires 30d; add_header Cache-Control "public, immutable"; }
# }
#
# # 80 端口仅做 301 跳转到 HTTPS（启用 HTTPS 时把上面 listen 80 的 server 段替换为这段）
# # server {
# #     listen 80 default_server;
# #     listen [::]:80 default_server;
# #     server_name _;
# #     return 301 https://\$host\$request_uri;
# # }
EOF

echo "==> [5/6] 启用站点"
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/admin-web
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx

echo "==> [6/6] 完成 ✅"
echo "    站点目录: $SITE_ROOT"
echo "    访问: http://124.222.23.34:$PORT/"
echo "    提示：需在腾讯云控制台「防火墙」放通 TCP $PORT"
