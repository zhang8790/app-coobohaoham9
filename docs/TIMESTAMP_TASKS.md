# 定时任务配置说明

## 概述
V4分佣算法需要每月重置以下统计字段：
- `monthly_consumption`（当月消费金额）
- `team_monthly_gmv`（团队月度GMV）
- `consecutive_zero_months`（连续零消费月数）

## 定时任务SQL

### 方案A：使用 pg_cron 扩展（推荐）

```sql
-- 1. 启用 pg_cron 扩展（需要Supabase管理员权限）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 创建定时任务（每月1号凌晨0点执行）
SELECT cron.schedule(
  'reset-monthly-stats',  -- 任务名称
  '0 0 1 * *',           -- cron表达式（每月1号0点）
  $$
  -- 重置当月消费和团队GMV
  UPDATE profiles 
  SET 
    monthly_consumption = 0,
    team_monthly_gmv = 0,
    consecutive_zero_months = CASE 
      WHEN monthly_consumption = 0 THEN consecutive_zero_months + 1
      ELSE 0
    END
  WHERE monthly_consumption = 0 OR team_monthly_gmv = 0;
  $$
);
```

### 方案B：使用 Supabase Edge Function + 外部定时服务

#### 1. 创建 Edge Function

```typescript
// supabase/functions/reset-monthly-stats/index.ts
import { serve } from 'https://deno.land/x/supabase@0.36.3/functions/index.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'

serve(async (req) => {
  try {
    // 验证请求（仅允许授权服务调用）
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 重置统计
    const { error } = await supabaseAdmin.rpc('reset_monthly_stats')
    
    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, message: '月度统计已重置' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

#### 2. 创建数据库函数

```sql
-- supabase/migrations/00014_reset_monthly_stats.sql
CREATE OR REPLACE FUNCTION reset_monthly_stats()
RETURNS void AS $$
BEGIN
  UPDATE profiles 
  SET 
    monthly_consumption = 0,
    team_monthly_gmv = 0,
    consecutive_zero_months = CASE 
      WHEN monthly_consumption = 0 THEN consecutive_zero_months + 1
      ELSE 0
    END
  WHERE monthly_consumption = 0 OR team_monthly_gmv = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 3. 配置外部定时服务

**选项1：GitHub Actions**
```yaml
# .github/workflows/reset-monthly-stats.yml
name: Reset Monthly Stats
on:
  schedule:
    - cron: '0 0 1 * *'  # 每月1号0点（UTC时间）
  workflow_dispatch:      # 允许手动触发

jobs:
  reset:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.SUPABASE_URL }}/functions/v1/reset-monthly-stats"
```

**选项2：Vercel Cron Jobs**
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/reset-monthly-stats",
      "schedule": "0 0 1 * *"
    }
  ]
}
```

**选项3：Cloudflare Workers Cron Triggers**
```toml
# wrangler.toml
[triggers]
crons = ["0 0 1 * *"]
```

## 推荐方案

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **pg_cron** | 简单、可靠、无需外部服务 | 需要数据库管理员权限 | Supabase Pro/Enterprise用户 |
| **Edge Function + GitHub Actions** | 免费、灵活、可监控 | 需要配置GitHub仓库 | 个人项目、小团队 |
| **Edge Function + Vercel** | 集成方便、自动扩容 | 需要Vercel部署 | 已使用Vercel的项目 |

## 执行步骤（推荐：pg_cron）

1. **在Supabase SQL编辑器中执行**：
   ```sql
   -- 启用扩展
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   
   -- 创建定时任务
   SELECT cron.schedule(
     'reset-monthly-stats',
     '0 0 1 * *',
     'UPDATE profiles SET monthly_consumption = 0, team_monthly_gmv = 0, consecutive_zero_months = CASE WHEN monthly_consumption = 0 THEN consecutive_zero_months + 1 ELSE 0 END WHERE monthly_consumption = 0 OR team_monthly_gmv = 0;'
   );
   ```

2. **验证任务**：
   ```sql
   -- 查看所有定时任务
   SELECT * FROM cron.job;
   
   -- 查看任务执行历史
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```

3. **手动测试**：
   ```sql
   -- 立即执行一次（测试）
   SELECT cron.schedule('test-reset', '* * * * *', 'UPDATE profiles SET monthly_consumption = 0;');
   
   -- 删除测试任务
   SELECT cron.unschedule('test-reset');
   ```

## 注意事项

1. **时区问题**：pg_cron使用UTC时间，确保任务在正确的时区执行
2. **权限问题**：确保Edge Function有调用RPC的权限
3. **错误处理**：添加错误日志和告警机制
4. **数据备份**：在执行重置前，建议备份相关数据

## 监控和告警

```sql
-- 创建监控表
CREATE TABLE cron_monitoring (
  id SERIAL PRIMARY KEY,
  job_name TEXT,
  executed_at TIMESTAMP DEFAULT NOW(),
  status TEXT,
  message TEXT
);

-- 在Edge Function中添加监控
INSERT INTO cron_monitoring (job_name, status, message)
VALUES ('reset-monthly-stats', 'success', '月度统计已重置');
```

---

**下一步**：选择适合你的方案，执行对应的SQL/代码，并测试定时任务是否正常工作。
