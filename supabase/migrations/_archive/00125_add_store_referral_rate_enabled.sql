-- =============================================================
-- 00125 · 店铺整体让利总开关
-- 背景：原让利率只有 stores.referral_rate（门店默认率），商品未设 discount_rate 时回退门店率。
--       现增加总开关 referral_rate_enabled：
--         true  （默认）= 门店默认让利率照常参与分佣回退
--         false         = 关闭门店整体让利，仅商品级 discount_rate 参与分佣（无商品让利则该单让利=0）
-- 用途：运营/商家可一键关掉"店铺默认让利"，仅保留单品让利，避免整店被统一让利点吃掉利润。
-- =============================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS referral_rate_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN stores.referral_rate_enabled IS
  '店铺整体让利总开关；false=关闭门店默认让利率回退，仅商品级 discount_rate 参与分佣';

-- 幂等：若历史数据被误写为 null，统一纠正为 true（默认开启）
UPDATE stores SET referral_rate_enabled = true WHERE referral_rate_enabled IS NULL;
