-- ============================================================
-- 食疗咨询智能化 · 切换大模型为「通义千问 Qwen」
-- ------------------------------------------------------------
-- 协议：OpenAI 兼容（DashScope compatible-mode/v1），本项目
--       food-therapy-ai Edge Function 与 llmConfig.ts 已原生支持，
--       无需改任何业务代码，只靠本配置切换模型。
--
-- 用法（二选一）：
--   A. 在 Supabase SQL Editor 以「管理员」身份执行本文件，
--      把下方 <YOUR_DASHSCOPE_API_KEY> 替换为你的真实密钥。
--   B. 或直接改 admin-web 后台「系统配置」里 key='llm' 的 value。
--
-- 密钥获取：阿里云百炼控制台 → API-KEY 管理 → 创建并复制。
--   文档：https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope
--
-- 回退规则兜底：把 enabled 改为 false（或删除此行），即自动退回本地规则，
--       零外部依赖、不调用任何接口。
-- ============================================================

insert into public.system_config (key, value, updated_at)
values (
  'llm',
  jsonb_build_object(
    'base_url', 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'api_key',  '<YOUR_DASHSCOPE_API_KEY>',   -- ← 替换为你的 DashScope API Key
    'model',    'qwen-plus',                   -- 可选：qwen-max(最强) / qwen-turbo(最快最省) / qwen-long(长文本)
    'enabled',  true
  ),
  now()
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

-- 确认写入结果（执行后查看）
-- select key, value->>'model' as model, value->>'enabled' as enabled, updated_at
-- from public.system_config where key = 'llm';
