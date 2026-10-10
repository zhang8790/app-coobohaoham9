-- 00238 后端 clamp stores.referral_rate（审计修复 B 的「低风险缺口」）
-- 背景：店铺级 referral_rate 的 3~30% 上限仅前端 onBlur 校验（ReferralConfig.tsx:39），
--       后端 / admin-web 直写无校验，技术用户可写 >30%，放大让利池亏损风险。
-- 方案：BEFORE 触发器，写入时
--   1) 兼容旧百分比口径（值 >1 视为百分比，先 /100）→ 小数口径
--   2) 归一化到 [0, 0.30]（= 0%~30%）
--   既防越界，又自动纠正历史百分比存量，且不破坏既有数据。
-- 铁律：幂等，可重复执行。

CREATE OR REPLACE FUNCTION clamp_store_referral_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_rate IS NULL THEN
    RETURN NEW;
  END IF;
  -- 兼容旧百分比口径：值 >1 视为百分比（如 15=15%），先转小数
  IF NEW.referral_rate > 1 THEN
    NEW.referral_rate := NEW.referral_rate / 100.0;
  END IF;
  -- clamp 到 [0, 0.30] 小数口径（= 0%~30%）
  NEW.referral_rate := LEAST(GREATEST(NEW.referral_rate, 0), 0.30);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clamp_store_referral_rate ON public.stores;

CREATE TRIGGER trg_clamp_store_referral_rate
  BEFORE INSERT OR UPDATE OF referral_rate ON public.stores
  FOR EACH ROW EXECUTE FUNCTION clamp_store_referral_rate();

-- 存量归一：把历史百分比值（>1）一次性转为小数口径，并限幅
UPDATE public.stores
SET referral_rate = LEAST(GREATEST(referral_rate / 100.0, 0), 0.30)
WHERE referral_rate > 1;

SELECT '✅ 00238 stores.referral_rate 后端 clamp 已就绪' AS result;
