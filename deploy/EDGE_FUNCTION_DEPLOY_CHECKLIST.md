# 来店有喜 · Supabase Edge Functions 部署清单（可直接照跑）

> 项目 ref：`pyqgsxcjmijtbstwthbn`（东北亚·东京）
> EF 目录：`supabase/functions/<name>/index.ts`，当前 31 个业务函数（不含 `_shared` / `_dashboard-paste`）
> CLI：`supabase` 2.109.1（本机已登录 + link）

---

## 0. 前置条件（一次性）

```bash
supabase login                                   # 或: supabase login --token $SUPABASE_ACCESS_TOKEN
supabase link --project-ref pyqgsxcjmijtbstwthbn
```

---

## 1. 部署单个 EF（最常用）

```bash
supabase functions deploy "ingredient-analyze" --project-ref pyqgsxcjmijtbstwthbn
```

- 必须 `cd` 到项目根（`supabase/` 同级目录）。
- **改了 `_shared/` 下的公共模块，所有依赖它的 EF 都要重新 deploy** —— CLI 不自动级联。
- 本地联调：`supabase functions serve ingredient-analyze --env-file supabase/.env.local`

---

## 2. 全量部署

```bash
bash src/scripts/deploy-functions.sh
```

脚本会自动扫描 `supabase/functions/` 下所有含 `index.ts` 的目录（排除 `_` 开头）并逐个 deploy。

---

## 3. 部署后验证（不要只信 "deploy 成功"）

```bash
# 列云端函数（确认状态 = ACTIVE，且出现在列表里）
supabase functions list --project-ref pyqgsxcjmijtbstwthbn

# 直接打端点冒烟（以 ingredient-analyze 为例）
curl -s -X POST https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/ingredient-analyze \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"text":"白砂糖、食用盐"}'
```

对照 `src/scripts/deploy-all.sh` 末尾的 Dashboard 收尾提示：
- 删除 `generate-qrcode` 的旧 slug `/qrcodes`（只保留 `/generate-qrcode`）
- 确认 `wechat_miniapp_login` 已部署成功
- 确认以下 Secrets 已配置

---

## 4. Secrets 配置（⚠️ 不会随代码自动设置）

**运行时自动注入（无需手动设）**：`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`

**需手动在 Dashboard → Settings → API/Edge Functions → Secrets 配置**：

| 分类 | 变量 |
|------|------|
| 微信小程序 | `MERCHANT_APP_ID`、`WX_SECRET`、`WX_APPID` |
| 微信支付 | `MERCHANT_ID`、`MCH_PRIVATE_KEY`、`MCH_CERT_SERIAL_NO`、`MCH_API_V3_KEY`、`WECHAT_PAY_PUBLIC_KEY_ID`、`WECHAT_PAY_PUBLIC_KEY` |
| 微信订阅消息 | `TMPL_ORDER_PAID`、`TMPL_REFUND_RESULT`、`TMPL_WITHDRAW_PROGRESS`、`TMPL_COMMISSION_ARRIVED`、`TMPL_ANNOUNCEMENT` |
| LLM 网关 | `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_LOCAL_DEV`（本地模式=1 时 `LLM_API_KEY` 可空） |
| 百度 OCR | `BAIDU_OCR_API_KEY`、`BAIDU_OCR_SECRET_KEY`（ocr-ingredient 用；未配时前端有回退到文本路径） |
| 分佣/渠道 | `COMMISSION_TAX_RATE`、`COMMISSION_TAX_THRESHOLD`、`COMMISSION_CASH_RATIO`、`CHANNEL_FEE_RATE` |
| 其他 | `AUTO_COMPLETE_DAYS`（auto-complete-orders）、`ALERT_WEBHOOK_URL`（biz-alert）、`SERVICE_ROLE_KEY`（见下） |

**`SERVICE_ROLE_KEY`（重点）**：因为 Supabase 禁止自定义 Secrets 以 `SUPABASE_` 开头，`product-mutate` 故意读 `Deno.env.get('SERVICE_ROLE_KEY')`（见 `supabase/functions/product-mutate/index.ts:81-84`）。**这个值不会自动注入，必须手动设**一个 `SERVICE_ROLE_KEY` Secret = 你的 service_role key，否则 `product-mutate` 部署后调用必失败。

设置命令（可一次多值）：
```bash
supabase secrets set MERCHANT_APP_ID=xxx WX_SECRET=yyy SERVICE_ROLE_KEY=zzz --project-ref pyqgsxcjmijtbstwthbn
```

---

## 5. ⚠️ 数据库迁移雷区（本项目特有，极易翻车）

本项目 244 个迁移是**手工/逐条执行**的，远程 `_supabase_migrations` 没有完整跟踪记录。

- 直接跑 `supabase db push` 会认为全部 244 个迁移都"未推送"，尝试重放 → 因表已存在而**报错中断**。
- **结论：本项目不要用 `supabase db push` 做常规迁移。** 正确做法二选一：
  1. **（推荐，最可控）** 在 Supabase Dashboard 的 SQL Editor 直接粘贴执行单条迁移 SQL；
  2. 或临时把其他迁移移出 `supabase/migrations/`，只留目标那条 `supabase db push`，推完再移回（见下方示例）。

```bash
# 例：只推一条新迁移
mkdir -p /tmp/mig-bak
mv supabase/migrations/!(20261010_add_enable_therapy.sql) /tmp/mig-bak/
supabase db push
find /tmp/mig-bak -name '*.sql' -exec mv {} supabase/migrations/ \;
```

- ⚠️ `src/scripts/deploy-all.sh` 里的 `supabase db push` 步骤在当前状态下是**危险**的，执行前务必确认远程跟踪已补齐，否则**跳过该步**。

---

## 6. 死函数清理（可选）

- 下线确认无引用的 EF：`supabase functions delete <name> --project-ref pyqgsxcjmijtbstwthbn`
- 脚本 `src/scripts/delete-dead-edge-functions.sh`（需本机 login/link，运行时会让你输入 `YES` 确认）

---

## 7. 推荐的标准上线流程

1. `supabase login` / `supabase link`（一次性）
2. **DB 变更**：按第 5 节单独执行单条迁移，不要整推
3. `bash src/scripts/deploy-functions.sh`（全量 EF；注意改了 `_shared` 要全量）
4. 配置第 4 节 Secrets（尤其是 `SERVICE_ROLE_KEY`）
5. Dashboard 验证函数状态 + 端点 curl 冒烟
