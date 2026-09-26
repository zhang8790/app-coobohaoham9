-- 打印机配置 · 纯执行版（杭州礼品店）
-- 本文件不含任何装饰线，可整段粘贴进 Supabase SQL Editor，不会触发 42601。
-- 目标行 id = ac96ff08-e07b-480c-a333-7d2347310e75


-- 【方案 A｜飞鹅】把 USER / UKEY / SN 换成飞鹅云后台的真实值后再执行
-- 需要填入：USER（账号）、UKEY（密钥）、SN（打印机编号，机身底部贴纸也有）
UPDATE printer_configs
SET provider    = 'feie',
    api_user    = 'USER',
    api_key     = 'UKEY',
    device_sn   = 'SN',
    printer_key = NULL,
    enabled     = TRUE,
    updated_at  = now()
WHERE id = 'ac96ff08-e07b-480c-a333-7d2347310e75';


-- 【方案 B｜易联云】仅当机型为 K4/K5/K6 时可用
-- 把 TERMINAL 换成打印机自检小票上的「终端号」（不是用户ID）
-- UPDATE printer_configs
-- SET device_sn = 'TERMINAL', updated_at = now()
-- WHERE id = 'ac96ff08-e07b-480c-a333-7d2347310e75';


-- 【验证】执行后应当看到 provider / device_sn / enabled 符合预期
SELECT id, store_id, provider, device_sn, api_user, enabled, print_count, last_print_at
FROM printer_configs
WHERE store_id = '70778d6b-d819-41fc-87a3-8766a78eb60d';
