# admin-web 管理后台 — 部署上线说明

生成时间：2026-07-31 23:1x

---

## 一句话结论

**能部署。** CodeBuddy 那个托管链接我确实碰不到（没有 CLI、没有凭据、仓库里也没有可改的部署配置文件），
但我换了条路，已经把带新功能的管理后台**真实部署上线**了。

### 新地址（立即可用）

```
https://340524b91b7a490f80deddf3f03261cd.gz1.agentos-app.net
```

Token 统计页直达：`/settings`

---

## 二、为什么原链接推不动

| 项 | 状态 |
|---|---|
| 代码是否已就绪 | ✅ 已就绪，`origin/main` 含全部新功能 |
| 本地构建 | ✅ `tsc -b && vite build` 干净通过 |
| 云端实际服务的包 | ❌ 仍是旧 bundle `index-BTHlWT2V.js` |
| 我能否触发云端重建 | ❌ 无 codebuddy CLI / API token / 部署配置文件 |

根因回顾：仓库根 `package.json` 的 `build` 指向 `bash build-weapp.sh`（Taro **小程序**构建），
不是网页。云环境按根目录构建，永远产不出 `admin-web/dist`，于是一直服务旧缓存。

---

## 三、这次做了什么

### 1. 新增 `admin-web/scripts/make-static-cloud.mjs`

admin-web 用的是 `BrowserRouter`。丢到没有 history-fallback 的静态服务器上，
只有首页能开，直接访问 `/settings` 必 404。脚本解决三件事：

1. **资源路径绝对化** — `./assets/` → `/assets/`，子路径下也能正确解析
2. **路由入口预生成** — 从 `src/App.tsx` 正则抽取所有 `path="..."`，
   自动为 **31 条路由**各生成一份 `<route>/index.html`
3. **兜底文件** — 追加 `404.html` / `200.html`

用法：

```bash
cd admin-web
npm run build
node scripts/make-static-cloud.mjs   # 产出 dist-cloud/
```

`admin-web/dist-cloud/` 已加入 `.gitignore`，不污染仓库。

### 2. 部署 + 三项线上验证

| 验证项 | 结果 |
|---|---|
| 根路径 bundle | `index-DLeTL2d3.js` ✅ 新包 |
| `/settings` 直达 | HTTP `200` ✅ 不再 404 |
| JS 内含 `fn_llm_usage_stats` | 命中 1 ✅ token 统计已上线 |

### 3. 提交

`1b0d56d` — `chore(admin-web): 新增 make-static-cloud 脚本，SPA 产物适配无 history-fallback 的静态托管`
已 push 到 `origin/main`。

---

## 四、如果仍想救回原来那个 CodeBuddy 链接

需要你在 CodeBuddy 控制台改两处构建配置（我改不了）：

- **构建命令**：`cd admin-web && npm install && npm run build`
- **输出目录**：`admin-web/dist`
- **SPA 重写规则**（若有该选项）：`/* → /index.html`

改完点重新部署。验证方法：

```bash
curl -s "https://626c8aac26b546759be8d42c63598ea2.app.codebuddy.work/" \
  | grep -oE 'assets/[A-Za-z0-9._-]+\.js'
```

hash 从 `BTHlWT2V` 变成 `DLeTL2d3` 就说明生效了。
如果那边没有 SPA 重写选项，把输出目录改成 `admin-web/dist-cloud`
并在构建命令末尾追加 `&& node scripts/make-static-cloud.mjs` 也能绕过。
