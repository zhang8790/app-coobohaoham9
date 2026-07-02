# 🚀 本地开发完整指南

## 📊 当前状态

| 项目 | 状态 | 说明 |
|------|------|------|
| 管理后台 Dev Server | ✅ 运行中 | http://localhost:5173 |
| Mock 数据模式 | ✅ 可用 | 默认启用，顶部有提示条 |
| 真实后端连接 | ⚠️ RLS 阻止 | 需要禁用 RLS 才能访问 |
| 小程序端 | ⚠️ 待检测 | 需要测试生产模式连接 |

---

## 🎯 方案 A：禁用 RLS，连接真实后端

### 步骤 1：在 Supabase Dashboard 执行 SQL

1. 打开 [Supabase Dashboard](https://app.supabase.com)
2. 选择项目 `supabase330158129083891712`
3. 左侧菜单 → **SQL Editor**
4. 新建查询，粘贴以下 SQL：

```sql
-- ⚠️ 开发环境专用：禁用所有表的 RLS
-- 执行后，anon key 可访问所有数据

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'Disabled RLS on %', t;
  END LOOP;
END
$$;

-- 验证：查询所有表的 RLS 状态（应该全部显示 false）
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

5. 点击 **Run** 执行
6. 看到 `Disabled RLS on ...` 消息表示成功

### 步骤 2：更新环境变量

编辑 `admin-web/.env.local`（如果不存在则创建）：

```bash
# 禁用 mock 模式，连接真实后端
VITE_USE_MOCK=false
```

### 步骤 3：重启 Dev Server

```bash
cd admin-web
pnpm dev
```

### 步骤 4：测试连接

1. 打开 http://localhost:5173
2. 顶部应该显示 **"🔗 真实后端"**（绿色）
3. 登录后，数据应该从真实后端获取

---

## 🎯 方案 B：使用 Mock 数据（推荐用于 UI 开发）

### 当前状态

- ✅ 默认启用
- ✅ 所有页面都有完整的 mock 数据
- ✅ 顶部显示 **"🧪 Mock 模式"**（黄色提示条）

### 切换回 Mock 模式

编辑 `admin-web/.env.local`：

```bash
# 启用 mock 模式
VITE_USE_MOCK=true
```

重启 dev server 即可。

---

## 🔍 后端连接检测

### 自动检测

管理后台启动时会自动检测后端连接状态，并在顶部 header 显示：
- **🧪 Mock 模式**（黄色）→ 使用 mock 数据
- **🔗 真实后端**（绿色）→ 连接真实后端

### 手动检测

在浏览器控制台执行：

```javascript
// 测试后端连接
import { testConnection } from './src/api/admin.ts'
testConnection().then(console.log)
```

预期输出：
```javascript
// RLS 启用时（失败）
{ ok: false, message: "RLS 阻止访问...", details: ... }

// RLS 禁用后（成功）
{ ok: true, message: "连接成功！可访问数据（count=10）", details: { count: 10 } }
```

---

## 🛠️ 常见问题

### Q1: 执行 SQL 后仍然无法访问？

**可能原因：**
1. SQL 执行失败 → 检查 SQL Editor 是否有错误提示
2. 环境变量未更新 → 确认 `.env.local` 中 `VITE_USE_MOCK=false`
3. Dev server 未重启 → 重启 dev server
4. 浏览器缓存 → 清除缓存或硬刷新（Ctrl+Shift+R）

**解决步骤：**
```bash
# 1. 确认环境变量
cat admin-web/.env.local

# 2. 重启 dev server
cd admin-web
pnpm dev

# 3. 清除浏览器缓存后刷新
```

---

### Q2: 禁用 RLS 安全吗？

**开发环境：** ✅ 安全（仅用于本地开发）
**生产环境：** ❌ 不安全（必须启用 RLS）

**建议：**
- 开发完成后，立即重新启用 RLS
- 或者创建单独的开发数据库

**重新启用 RLS 的 SQL：**
```sql
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'Enabled RLS on %', t;
  END LOOP;
END
$$;
```

---

### Q3: 小程序端能连接后端吗？

**当前状态：** ⚠️ 不确定（需要检测）

**检测步骤：**

1. 编译小程序：
```bash
cd C:/Users/zhanglin/Desktop/app-coobohaoham9
pnpm exec taro build --type weapp
```

2. 打开微信开发者工具，导入 `dist/` 目录

3. 测试登录功能：
   - 输入手机号 `18701410500`
   - 验证码 `123456`
   - 或者使用测试模式开关

4. 查看控制台是否有 API 错误

**如果无法连接：**
- 检查 `project.private.config.json` 中 `urlCheck: false`
- 确认 `.env.production` 中的 Supabase URL 正确
- 检查微信小程序白名单设置

---

## 📁 相关文件

| 文件 | 说明 |
|------|------|
| `admin-web/.env` | 环境变量配置（默认启用 mock） |
| `admin-web/.env.local` | 本地覆盖配置（优先级更高） |
| `admin-web/src/api/admin.ts` | API 函数（含 mock 降级逻辑） |
| `admin-web/src/mock/data.ts` | Mock 数据 |
| `supabase/disable_rls_dev.sql` | 禁用 RLS 的 SQL 脚本 |
| `src/db/types.ts` | 小程序端类型定义 |
| `admin-web/src/types/index.ts` | 管理后台类型定义 |

---

## 🎉 完成状态

- [x] 管理后台 dev server 运行正常
- [x] Mock 数据完整（8 个页面）
- [x] 环境变量可配置（mock/real 模式）
- [x] UI 显示当前模式（顶部 header）
- [ ] 禁用 RLS（需要用户在 Dashboard 执行 SQL）
- [ ] 连接真实后端（依赖 RLS 禁用）
- [ ] 检测小程序端连接状态

---

## 📞 需要帮助？

如果遇到问题，请提供：
1. 浏览器控制台错误信息
2. 网络请求截图（DevTools → Network）
3. `.env.local` 文件内容
4. Supabase Dashboard → SQL Editor 执行结果截图
