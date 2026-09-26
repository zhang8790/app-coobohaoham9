-- ============================================================
-- 打印机绑定到「杭州礼品店」
-- store_id = 70778d6b-d819-41fc-87a3-8766a78eb60d (杭州礼品店)
-- 表: printer_configs
-- 约束: provider IN ('feie','yilianyun','365'); device_sn NOT NULL;
--       UNIQUE(store_id, device_sn)
-- 服务商: 易联云 (yilianyun) — OAuth V2 开放平台
-- 字段映射来源: supabase/functions/print-receipt/index.ts:252-316
--   cfg.api_user  -> client_id  (应用ID)    = 1063021628
--   cfg.api_key   -> client_secret(应用密钥) = d53a9ff9fb04f345a7e5633e65c6f271
--   cfg.device_sn -> machine_code(打印机机器码) = 见下方说明
-- ============================================================

-- 1) 确认目标门店存在
SELECT id, name, is_active
FROM stores
WHERE id = '70778d6b-d819-41fc-87a3-8766a78eb60d';

-- 2) 插入打印机配置
--    ⚠️ device_sn 应为易联云「终端号」(machine_code)，【不是】用户ID。
--    用户截图只提供了 用户ID=43398252 / 应用ID=1063021628 / 密钥。
--    应用ID+密钥 已正确映射；终端号未在截图中，先用 用户ID(43398252) 作占位落地，
--    ⚠️ 该占位值【已证实无效】（见文末对照实验），必须换成打印机真实终端号。
--    详见文末【执行记录】与【最终结论】。
INSERT INTO printer_configs (
  store_id,
  provider,
  device_sn,
  api_user,
  api_key,
  printer_key,
  enabled,
  auto_print_on_paid
)
VALUES (
  '70778d6b-d819-41fc-87a3-8766a78eb60d',  -- 杭州礼品店
  'yilianyun',
  '43398252',                              -- 候选机器码（用户ID）；验证失败则改为真实打印机设备号
  '1063021628',                            -- 应用ID -> client_id
  'd53a9ff9fb04f345a7e5633e65c6f271',      -- 应用密钥 -> client_secret（仅签名用，不进请求体）
  NULL,
  true,
  false
)
ON CONFLICT (store_id, device_sn) DO UPDATE SET
  provider = EXCLUDED.provider,
  api_user = EXCLUDED.api_user,
  api_key = EXCLUDED.api_key,
  enabled = EXCLUDED.enabled;

-- 3) 校验
SELECT id, store_id, provider, device_sn, api_user, enabled, print_count, last_print_at
FROM printer_configs
WHERE store_id = '70778d6b-d819-41fc-87a3-8766a78eb60d';

-- ============================================================
-- ⚠️ 已知隐患（与本次绑定无关，配好后会触发）：
--   触发器 trg_print_receipt 不读 auto_print_on_paid，只要订单离开 pending_pay 就无条件点火。
--   即：绑定成功后杭州礼品店所有已支付订单都会自动出单，auto_print_on_paid=false 当前无效。
--   若要让开关真正生效，需改触发器加判断（一行 IF），要的话我出补丁。
-- ============================================================

-- ============================================================
-- 【执行记录】2026-09-17
-- 1) INSERT 已执行成功（HTTP 201，行 id=ac96ff08-e07b-480c-a333-7d2347310e75，enabled=true）。
-- 2) 测试打印返回：{"success":false,"error":"打印推送失败: 不支持k1,k2,k3机型"}
-- 3) 沙箱直连易联云诊断（绕开 EF）：
--      - OAuth 成功（error 0，拿到 access_token）→ 应用ID(1063021628)+密钥 100% 正确。
--      - 极简纯文本 <CA>hello-test</CA> 打到 machine_code=43398252 → {"error":16,"error_description":"不支持k1,k2,k3机型"}。
-- 4) 【对照实验｜决定性】同一 token 分别打到三个不同编号：
--      machine_code=43398252   -> error 16 不支持k1,k2,k3机型
--      machine_code=9999999999 -> error 16 不支持k1,k2,k3机型   ← 明显不存在的编号
--      machine_code=4339825    -> error 16 不支持k1,k2,k3机型
--    三者返回【完全相同】⇒ 该报错与 machine_code 取值【无关】，是「应用/机型」级别的硬拒绝，
--    不是"这台设备机型不对"。故上一轮"43398252 是已注册 k 系列打印机"的推断【已被推翻】。
--
-- 【最终结论】
--   ① 易联云开放平台 print/index 接口对应用 1063021628 一律返回 error 16；
--      官方及多家第三方对接文档一致声明：易联云开放平台【仅支持 K4/K5/K6 及以上机型，
--      不支持 K1/K2/K3】。该账号下（或该应用）绑定的机型属被拒范围。
--   ② 另一个独立错误：device_sn 应填【终端号 machine_code】（打印机「关于本机」小票 /
--      云端中心「打印机列表」可见，通常 10 位数字），而 43398252 是【用户ID】，
--      二者是完全不同的概念 —— 即便机型支持，填用户ID 也打不出来。
--
-- 【修复路径｜需用户提供信息】
--   A. 先确认打印机型号：
--        - 若是 K1/K2/K3 → 开放平台打不了，需换 K4/K5/K6（建议 GPRS 版）或改用飞鹅。
--        - 若是 K4/K5/K6 → 继续走 B。
--   B. 取真实【终端号】：打印机开机 → 长按右键进菜单 → 「关于本机」，会打出自检小票，
--      上面的「终端号」即 machine_code；或登录 https://yilianyun.10ss.net 云端中心
--      →「打印机列表」→ 选中打印机 → 复制终端号。
--   C. 拿到后执行（把 <真实终端号> 换掉）：
--        UPDATE printer_configs SET device_sn = '<真实终端号>'
--        WHERE id = 'ac96ff08-e07b-480c-a333-7d2347310e75';

-- ============================================================
-- 【2026-09-17 晚｜重大更正】用户补充「前天还能打印」→ 根因改写
-- ============================================================
-- 上面第 4 点的机型推断虽然方向正确（易联云这套凭证确实打不了），
-- 但【不是本次故障的根因】。真正根因是：打印机配置被外键级联删除。
--
-- 【证据】
--   1) 迁移 20260803_printer_configs.sql:8
--        store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE
--   2) 迁移脚本 20260916_delete_test_stores.sql:7 注释明确记载：
--        products(10)、printer_configs(1)、… 均为 ON DELETE CASCADE → 自动级联删除
--      ⇒ 9/16 删除那 3 家门店时，当时存在的【1 条打印机配置被连带删除】。
--   3) 随后 restore_stores.sql 只恢复了门店，未恢复打印机凭证 → printer_configs 至今空表。
--   4) trigger_logs 显示：9/15 打印触发密集且正常；9/16 之后虽仍有 PRINT_NET_DONE，
--      但那只是 pg_net 的 HTTP 调用成功，EF 内部早已返回「未配置打印机」。
--
-- 【结论】既然 9/15 能打印，而当前这套易联云凭证无论填什么 terminal 都必失败（error 16 与应用
--  级别相关，与 machine_code 无关）⇒ 9/15 那条被删配置的 provider 几乎必然是【feie 飞鹅】。
--
-- 【修复】见 打印机配置_修复模板_2026-09-17.md 第三節。飞鹅只需 USER / UKEY / SN：
--
--   UPDATE printer_configs
--   SET provider='feie', api_user='<USER>', api_key='<UKEY>', device_sn='<SN>',
--       printer_key=NULL, enabled=true, updated_at=now()
--   WHERE id = 'ac96ff08-e07b-480c-a333-7d2347310e75';
--
-- 【顺带已修】print-receipt EF 原先在「无配置/推送失败」时完全静默（pg_net 异步调用，
--  触发器只记 PRINT_NET_DONE），导致本次事故两天无人察觉。现已在 4 个失败点写入
--  trigger_logs(action='PRINT_FAILED')，部署后可用：
--      select * from trigger_logs where action='PRINT_FAILED' order by id desc limit 50;
-- ============================================================
--      再次「测试打印」验证。
--   D. 若确定为 K 系列且不想换硬件 → 改用飞鹅打印机（provider='feie'，
--      EF 已支持 printFeie，需飞鹅云后台的 USER/UKEY + 打印机编号 SN）。
-- ============================================================
