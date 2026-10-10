-- 00239 补齐门店 short_code（扫码进店反查依赖）
-- 背景：2026-10-01 排查「扫门店二维码进不去门店」时，发现全部 5 个门店的
--       short_code 均为 NULL。store-home 按 scene 里的 s=短码 去 stores.short_code
--       反查门店，没有短码 → 永远查不到 → 进不去店。这是扫码进店的第二重断点
--       （第一重是 generate-qrcode 用了错误的第三方 AppID 凭据，见 00237 前后）。
-- 已线上手工补齐；本迁移幂等固化，供新环境 / seed 重跑，防止复发。

-- 1) 补齐 NULL：用 md5(name||id) 前 8 位大写字母数字（足够分散、满足 store-home 正则 [A-Za-z0-9]{4,12}）
UPDATE stores
SET short_code = upper(substr(md5(coalesce(name, '') || id::text), 1, 8))
WHERE short_code IS NULL;

-- 2) 唯一索引保护（幂等，已存在则跳过）
CREATE UNIQUE INDEX IF NOT EXISTS stores_short_code_key ON stores(short_code);
