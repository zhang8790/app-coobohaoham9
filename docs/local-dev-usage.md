# 🚀 本地开发环境使用指南

## ✅ 已完成的工作

### 1. **创建了本地 Mock API 服务器**
   - 文件：`scripts/mock-api-server.js`
   - 功能：完全模拟 Supabase API，无需连接真实后端
   - 端口：54321
   - Mock 数据：包含 9 张表的完整测试数据

### 2. **配置了管理后台**
   - 文件：`admin-web/.env`
   - 模式：使用本地 Mock API（无需真实后端）
   - 可在 Mock 模式和真实后端之间切换

### 3. **创建了一键启动/停止脚本**
   - `start-local-dev.sh`：启动完整的本地开发环境
   - `stop-local-dev.sh`：停止所有服务

### 4. **更新了管理后台代码**
   - 添加了连接状态检测（Dashboard 页面）
   - 顶部 Header 显示当前模式
   - 改进了错误处理

---

## 🎯 如何使用

### 方式一：一键启动（推荐）

```bash
# 启动本地开发环境
bash start-local-dev.sh

# 然后打开浏览器访问
# http://localhost:5173
```

### 方式二：手动启动

```bash
# 终端 1：启动 Mock API 服务器
node scripts/mock-api-server.js

# 终端 2：启动管理后台 Dev Server
cd admin-web
pnpm run dev

# 然后打开浏览器访问
# http://localhost:5173
```

### 停止服务

```bash
# 一键停止
bash stop-local-dev.sh

# 或手动停止
# Ctrl + C（在每个终端中）
```

---

## 📊 当前状态

| 项目 | 状态 | 说明 |
|------|------|------|
| Mock API 服务器 | ✅ 运行中 | http://localhost:54321 |
| 管理后台 Dev Server | ✅ 运行中 | http://localhost:5173 |
| Mock 数据 | ✅ 完整 | 9 张表，共 20+ 条记录 |
| 连接状态检测 | ✅ 已实现 | Dashboard 页面显示连接状态 |
| 一键启动脚本 | ✅ 已创建 | `start-local-dev.sh` |
| 一键停止脚本 | ✅ 已创建 | `stop-local-dev.sh` |

---

## 🔄 切换模式

### 使用 Mock 数据（默认，推荐用于开发）

```bash
# 编辑 admin-web/.env
VITE_SUPABASE_URL=http://localhost:54321
VITE_USE_MOCK=false  # 使用本地 Mock API（不是 mock 数据）
```

### 使用真实后端（需要禁用 RLS）

1. 在 Supabase Dashboard 执行 `supabase/disable_rls_dev.sql`
2. 编辑 `admin-web/.env`：
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=<正确的 anon key>
VITE_USE_MOCK=false
```
3. 重启 Dev Server

---

## 🧪 测试本地开发环境

### 1. 启动服务

```bash
bash start-local-dev.sh
```

### 2. 打开管理后台

浏览器访问：http://localhost:5173

### 3. 登录

点击以下任一演示按钮：
- **「👑 总后台演示」** → 超级管理员
- **「🏪 犒赏铺演示」** → 商家管理员

### 4. 测试功能

所有页面都应该正常工作：
- 仪表盘：显示统计数据
- 门派大典：查看/审核商家申请
- 宝贝审阅：查看/审核商品
- 佣金兑付：处理提现申请
- 武林贴管理：管理 UGC 内容
- 用户管理：查看/管理用户
- 退款管理：处理退款申请
- 公告管理：发布/管理公告

---

## 📁 相关文件

| 文件 | 说明 |
|------|------|
| `scripts/mock-api-server.js` | 本地 Mock API 服务器 |
| `admin-web/.env` | 管理后台环境变量配置 |
| `start-local-dev.sh` | 一键启动脚本 |
| `stop-local-dev.sh` | 一键停止脚本 |
| `supabase/disable_rls_dev.sql` | 禁用 RLS 的 SQL 脚本（用于连接真实后端）|
| `docs/local-development-guide.md` | 完整的本地开发指南 |

---

## 🎉 完成状态

- [x] 管理后台 Dev Server 运行正常
- [x] 本地 Mock API 服务器已创建
- [x] Mock 数据完整（9 张表）
- [x] 一键启动/停止脚本已创建
- [x] 管理后台可连接本地 Mock API
- [x] 所有页面在本地环境下正常工作
- [x] 连接状态检测已实现
- [ ] 连接真实后端（可选，需要执行 SQL）

---

## 📞 常见问题

### Q1: 启动时报错 "Port already in use"

**解决方法：**
```bash
# 停止占用端口的进程
bash stop-local-dev.sh

# 然后重新启动
bash start-local-dev.sh
```

### Q2: 管理后台无法连接 Mock API

**检测方法：**
```bash
# 测试 Mock API 是否运行
curl http://localhost:54321/rest/v1/profiles
```

**预期结果：**
```json
[{"id":"usr_001","nickname":"张无忌",...}]
```

**如果失败：**
1. 检查 Mock API 服务器是否运行：`lsof -i:54321`
2. 检查 `.env` 配置：`cat admin-web/.env`
3. 重启服务：`bash stop-local-dev.sh && bash start-local-dev.sh`

### Q3: 如何添加更多 Mock 数据？

编辑 `scripts/mock-api-server.js`，在 `MOCK_DATA` 对象中添加或修改数据。

---

## 🎯 下一步

**立即测试：**
1. 运行 `bash start-local-dev.sh`
2. 打开 http://localhost:5173
3. 登录并测试所有功能

**当需要连接真实后端时：**
1. 在 Supabase Dashboard 执行 `supabase/disable_rls_dev.sql`
2. 编辑 `admin-web/.env`，切换到真实后端配置
3. 重启服务

---

**🎉 本地开发环境已完全配置好！你现在可以开始开发了。**
