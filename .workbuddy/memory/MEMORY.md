# 项目长期记忆：app-coobohaoham9（来电有喜 小程序 + admin-web + 商家端）

## 一、沙箱与构建
- Taro 编译：`rm -rf .taro && node node_modules/@tarojs/cli/bin/taro build --type weapp`（JS 入口，非 .bin/taro；微信开发者工具只读 dist/）。
- admin-web：`cd admin-web && node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build`。
- ⚠️ 批量删未使用 import 铁律：oxlint 对 barrel/@ts-nocheck 假阳性误删 → 构建绿灯但运行时 ReferenceError。清理后必须 grep 或真机校验。
- 修改小程序源码后**必须重传 dist/**（微信开发者工具跑旧 lib/ 产物，否则「我的推荐」空白、分佣链断裂）。

## 二、Supabase 约束（沙箱已可直连）
- CLI 二进制绝对路径：`C:\Users\zhanglin\AppData\Roaming\npm\node_modules\@supabase\cli-windows-x64\bin\supabase.exe`（勿用 `npx supabase@latest`，win32 报 null）。
- 调用前 `unset SUPABASE_ACCESS_TOKEN` 靠缓存会话；`supabase link --project-ref pyqgsxcjmijtbstwthbn --yes` → `supabase db query --linked --file <迁移>` 直连 DDL（无 `supabase sql` 子命令，v2.109.1 用 `db query`）。
- ⚠️ `sb_secret_...` 实为 **service_role key（非 CLI PAT）**：CLI 登录报格式错，但可直接用于 REST/Function（Node fetch 带 `Authorization: Bearer <key>` + `apikey: <key>`）。CLI PAT 格式 `sbp_...`。
- 微信/LLM 类 EF 缺 Secrets 运行时 400；账号密码/手机号 OTP 登录直连 Auth 正常。
- admin-web 用 anon key → ENABLE RLS 读 0 行；运营/财务表须 DISABLE RLS。

## 三、余额与货币模型
- ⚠️ **单一货币（2026-07-17 合并）**：`tb_balance`=情绪豆（平台唯一内部货币，人民币 1:1 锚定，充值获得→消费抵扣+确权返利）；`balance` 列已废弃清零；`commission_balance`=可提现推广佣金，与 tb_balance 严格隔离。
- 充值只动 tb_balance+tongbao_logs(type='recharge')，绝不动 commission_balance。
- ⚠️ **2026-07-19 用户推翻资产隔离铁律**：裁定「情绪豆也要分佣，佣金打通情绪豆，可直接支付回流，纯豆订单也发佣，佣金提现通道关闭」。故 distribute-commission 佣金发放目标由 commission_balance 改为 tb_balance。属用户最终业务决策，优先级最高。
- 经济飞轮前提=「在平台发生消费行为」，非「先充值」。

## 四、分佣与推荐（涉及钱必看）
- 推广两层封顶：一级=我的好友、二级=我的粉丝。
- 充值绝对不分佣；消费每单只分佣一次（幂等守卫 commission_distributed）。混合支付佣金基数=net_amount(总-情绪豆)。
- ⚠️ **纯情绪豆订单分佣闭环已落地（2026-07-19）**：create-order v14 纯豆分支真正 invoke distribute-commission；wechat-payment-callback v8；distribute-commission v3（佣金发 tb_balance+tongbao_logs type='commission_earn'，按 total_amount 全额）。backfill-commission.mjs 历史漏单 16 笔全成功。
- backfill 脚本坑（已修，下次直接用）：①PATCH 空 body `res.json()` 抛错 → 先 `res.text()` 安全 parse；②order_items 无外键 join products(discount_rate) 报 PGRST200 → try/catch 降级店铺 referral_rate。
- 推荐绑定：profiles.referrer_id=上级 id；referral_code(00005 自动生成) 优先，回退 invite_code(00015)。
- ⚠️ **商家货款补结算（2026-07-20）**：fn_settle_order 原写死 status='completed' 才结算 → 00131_relax_settle_status.sql 放宽入口状态为已成交全集；backfill-merchant.mjs 补跑 82 笔真实门店全结算。新订单进已成交即自动结算，与分销佣金口径对齐。

## 五、合规红线
- 禁医疗宣称（治疗/治愈/抗炎/降血压）、绝对化用语（最/第一/顶级）；食养措辞附「不替代医嘱」。
- 推广两层封顶；协议页用语义 token 禁硬编码灰度。
- 不出现「团队业绩」等触碰合规红线措辞。

## 六、食材食疗 / AI 策略
- 引擎 src/utils/food-therapy/ + 自测 scripts/food-therapy-self-test.ts（31 绿）；00100 迁移须本机，引擎 ingredients 兜底。
- 症状规则库：00101 symptom_rules + getActiveRules()；AI 决策在规则引擎（纯函数），LLM 仅 NLU+润色。

## 七、Supabase 裸建号身份坑
- INSERT auth.users 必须同时插 auth.identities，否则登录报 `Database error querying schema`。
- 致命点：①email 是生成列，禁手工 INSERT；②provider_id NOT NULL，标准 email 登录填 **user_id 本身**（非字符串 'email'）。

## 八、迁移结构陷阱
- ⚠️ 某表被多个 migration 用 `CREATE TABLE IF NOT EXISTS` 重复建过 → 列体系分裂（如 withdrawals 00007 vs 00015；修复 00116）。开发前先 `SELECT column_name FROM information_schema.columns WHERE table_name='<表>'` 确认**线上实际列**，对照前端 types。

## 九、首页「江湖动态」order feed（2026-07-20）
- 00132_order_feed_rpc.sql 新增 `get_recent_order_feed(p_limit)`（SECURITY DEFINER，授权 anon/authenticated）；前端 getOrderFeed() 合并 announcement+orderFeed 单条轮播。
- 踩坑：RPC 参数走 POST body `{"p_limit":5}`（非 query string，否则 PGRST100）；函数内 product_name 与返回列重名 42702 → lateral 内先别名 pn。

## 十、移动端 App（mobile-app/）
- RN + Expo + TS，Supabase/食疗引擎复用；@/ 别名须 babel-plugin-module-resolver。运行：cp .env.example .env → npm install → npx expo start；国区用 EAS Dev Build。
