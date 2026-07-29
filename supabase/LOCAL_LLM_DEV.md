# 本地大模型（Ollama）接入开发指南

> 目标：在开发期用**本机 Ollama** 跑通项目的大模型调用，零云费用、可离线自测；
> 上线时把 `LLM_BASE_URL / LLM_API_KEY / LLM_MODEL` 切回云端即可，业务代码零改动。

---

## 一、架构（已落地）

```
小程序 / 前端
   │  (HTTPS, 仅带用户态 JWT)
   ▼
Supabase Edge Function  (product-analyze / food-therapy-ai / emotion-compile ...)
   │  统一调用 _shared/llmConfig.ts
   ▼
LLM 适配层（开关切换）
   ├─ 生产：system_config 表（后台填 URL/Key/Model）  或  supabase secrets
   └─ 开发（LLM_LOCAL_DEV=1）：本机 Ollama  http://localhost:11434/v1
```

关键点（安全 / 解耦）：
- 前端**永不**接触 LLM Key；Key 只在 Edge Function 服务端被读取。
- `llmConfig.ts` 优先级：① `system_config` 表 → ② Deno.env 回退。
- 本地模式 `LLM_LOCAL_DEV=1` 会**短路**到 env，直接指向本机 Ollama，不读远端表。

---

## 二、本机准备（一次性）

### 1. 安装 Ollama
- Windows：https://ollama.com/download 下载安装，或 `winget install Ollama.Ollama`。
- 安装后 Ollama 会作为服务自启，监听 `127.0.0.1:11434`。

### 2. 拉取本地模型
```powershell
ollama pull qwen2.5:3b      # ~2GB，整卡流畅，推荐开发默认
# 备选（显存够且想要更强）：
ollama pull qwen2.5:7b      # ~4.5GB，本机 4GB 显存为边界，可能走 CPU 部分卸载
```
> 本机显卡 AMD Radeon Pro 5500M 仅 4GB 显存：**不建议 14B+**。真大模型请走云端。

### 3. 验证 Ollama 端点
```powershell
curl http://localhost:11434/api/tags        # 应列出已装模型
ollama run qwen2.5:3b "你好"                 # 应直接对话
```

---

## 三、本地联调（开发期）

```powershell
# 在项目根目录，用本地 env 起函数服务
supabase functions serve product-analyze --env-file supabase/.env.local
```

另开终端，模拟前端请求（开发版无需 JWT 也可探活）：
```powershell
# 测试连接
curl -X POST "http://127.0.0.1:54321/functions/v1/product-analyze" `
  -H "Content-Type: application/json" `
  -d '{"test":true}'

# 真实识别
curl -X POST "http://127.0.0.1:54321/functions/v1/product-analyze" `
  -H "Content-Type: application/json" `
  -d '{"name":"当归生姜羊肉汤"}'
```
返回 `source:"llm"` 即表示本机 Ollama 已成功驱动函数。

---

## 四、上线切换（生产）

把 `LLM_BASE_URL / LLM_API_KEY / LLM_MODEL` 指回云端大模型，二选一：
1. **后台集中配置**：管理后台「AI 模型配置」填 URL/Key/Model → 写入 `system_config` 表（全项目共用，无需改代码）。
2. **Supabase Secrets**：`supabase secrets set LLM_API_KEY=sk-xxx LLM_BASE_URL=https://.../v1 LLM_MODEL=...`。

生产环境**不要**设 `LLM_LOCAL_DEV`，函数会自动读 `system_config` / secrets。

---

## 五、已知本地环境注意

- 本机 `supabase` npm CLI 在 win32-x64 下二进制缺失（报错 `No matching Supabase CLI binary package`）。
  若 `supabase functions serve` 不可用，可改用独立版 CLI（scoop/winget 安装 `supabase`）或在本机用 Deno 直接验证调用逻辑。
- 部署到云端的函数**无法访问** `localhost:11434`（那是你本机），所以本地模型仅用于开发自测；
  上线必须切云端端点，这正是 `LLM_LOCAL_DEV` 开关的意义。
- 未配置任何 Key 时，函数返回 `source:"none"`，前端自动回退「小程序本地规则识别」，保证无密钥也能用。
