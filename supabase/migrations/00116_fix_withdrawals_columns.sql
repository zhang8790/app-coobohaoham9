-- 00116：补齐 withdrawals 表前端所需列（修复 PGRST204: bank_account 列缺失）
--
-- 根因：
--   migrations 中 00007 与 00015 都对同一张 withdrawals 表执行了
--   `CREATE TABLE IF NOT EXISTS`，二者列结构不一致：
--     00007 → bank_name / bank_account / bank_holder / alipay_account / withdraw_method
--     00015 → method / account_info(jsonb)  （无 bank_account 等列）
--   实际生效的表可能不含 00007 的列；且前端额外写入的 real_name / id_card
--   在任一版本中均未定义。前端 applyWithdraw 显式写入这些列 → PostgREST 校验
--   schema cache 时找不到 bank_account → 报 PGRST204。
--
-- 修复：用 ADD COLUMN IF NOT EXISTS 幂等补齐前端所需全部列，不影响已有数据。

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS bank_name       TEXT,
  ADD COLUMN IF NOT EXISTS bank_account    TEXT,
  ADD COLUMN IF NOT EXISTS bank_holder     TEXT,
  ADD COLUMN IF NOT EXISTS alipay_account  TEXT,
  ADD COLUMN IF NOT EXISTS withdraw_method TEXT DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS real_name       TEXT,
  ADD COLUMN IF NOT EXISTS id_card         TEXT;

-- 诊断：打印补齐后的列清单，方便确认
DO $$
DECLARE
  col text;
BEGIN
  RAISE NOTICE '===== withdrawals 当前列 =====';
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'withdrawals' ORDER BY ordinal_position
  LOOP
    RAISE NOTICE '  - %', col;
  END LOOP;
  RAISE NOTICE '✅ 已确保 bank_account / bank_name / bank_holder / alipay_account / withdraw_method / real_name / id_card 存在';
END $$;

-- 尝试刷新 PostgREST schema cache（兼容新旧两种写法；失败则提示手动 Reload）
DO $$
BEGIN
  BEGIN
    PERFORM pg_notify('pgrst', 'reload schema');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      EXECUTE 'NOTIFY pgrst, ''reload schema''';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '⚠️ 自动刷新 schema cache 失败，请到 Supabase Dashboard → Database → 点 "Reload schema cache"';
    END;
  END;
END $$;
