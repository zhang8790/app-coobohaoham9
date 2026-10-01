# Supabase 反向代理部署（来店有喜 V3）

用**一个已备案的 HTTPS 域名**反代 Supabase 全部子服务（`/rest/v1`、`/auth/v1`、`/storage/v1`、`/realtime/v1`、`/functions/v1`），
前端与小程序只需把这个域名填进「微信服务器域名」白名单一次，即可同源访问，
同时（路线2）经同机/同网回源云端 supabase.co，消除跨境延迟；未来（路线1）把 upstream 改本地 Kong 即彻底自托管。

## 前置（你亲自办）
1. 购买域名并完成 **ICP 备案**（最长 1–3 周，唯一硬阻塞）。
2. 申请 SSL 证书（Let's Encrypt / 腾讯云 DV），放到：
   `/etc/nginx/ssl/<域名>/fullchain.pem` 与 `privkey.pem`。
3. DNS：`api.<你的域名>` → 服务器公网 IP；微信公众平台「服务器域名」填 `https://api.<你的域名>`。

## 配置
编辑 `nginx-supabase-proxy.conf`：
- 把所有 `api.laidianyouxi.com` 改成你的域名；
- `ssl_certificate` / `ssl_certificate_key` 指向真实证书路径；
- 确认 `upstream` 与 `proxy_pass` scheme 符合所选路线（默认路线2 云端 HTTPS）。

## 启用
```bash
sudo bash enable-proxy.sh
```
（脚本会复制配置、启用站点、校验并重载 nginx。）

## 路线切换（三处改动，均在 conf 内）
| 项目 | 路线2（云端，默认） | 路线1（本地 Kong） |
|---|---|---|
| `upstream` server | `pyqgsxcjmijtbstwthbn.supabase.co:443` | `127.0.0.1:8000` |
| `proxy_pass` scheme | `https://supabase_backend` | `http://supabase_backend` |
| `proxy_set_header Host` | 云端项目域名 | `localhost` |

## 对应前端改动
- **admin-web（已完成）**：端点运行时注入，部署时传
  `SUPABASE_URL="https://api.<域名>" SUPABASE_ANON_KEY="<anon>" sudo -E bash deploy-admin-web.sh <dist.tar.gz>`。
- **小程序**：改 `.env`（Taro）`TARO_APP_SUPABASE_URL=https://api.<域名>`，重新 `build-weapp` 并上传微信后台审核发布；
  `src/utils/error-log.ts` 已改为读 `TARO_APP_SUPABASE_URL`（带云端兜底），上报通道同步生效。

## 验证
```bash
# 代理连通性
curl -s -o /dev/null -w "%{http_code}\n" https://api.<域名>/rest/v1/products?select=id&limit=1 \
  -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
# 期望 200（未登录受 RLS 约束可能返回 401/空，但能通即说明代理 OK）
```

## 注意
- 代理只转发 Supabase 路径；不要把根 `/` 当作业务站点（根仅返回 204，避免误当站点）。
- 证书续期：Let's Encrypt 用 certbot 自动续，记得 reload nginx。
- 真实头像/图片走 storage，已放宽 `client_max_body_size 20m`。
