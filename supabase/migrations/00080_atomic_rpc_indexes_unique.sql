-- ============================================================================
-- 00080_atomic_rpc_indexes_unique.sql
-- 目的：补齐「本机执行」类根因修复中可安全叠加的迁移（测试期/生产期均可执行）
--  ① 原子余额增减 RPC（消除 read→compute→update 非原子，P1-D）
--  ② 高频查询索引（性能 P1）
--  ③ emotion_claims 唯一约束（防并发重复确权，P1）
-- 均为幂等（CREATE OR REPLACE / IF NOT EXISTS / ADD CONSTRAINT IF NOT EXISTS），可重复执行。
-- 依赖：之前各迁移已建 profiles / orders / commissions / emotion_claims / withdrawals 等表。
-- ============================================================================

-- ---------- ① 原子增减 RPC（单条 UPDATE，数据库内完成，无并发丢更新） ----------
CREATE OR REPLACE FUNCTION add_commission_balance(p_user_id uuid, p_delta numeric)
RETURNS void LANGUAGE sql AS $$
  UPDATE profiles SET commission_balance = commission_balance + p_delta WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION add_gold_beans(p_user_id uuid, p_delta integer)
RETURNS void LANGUAGE sql AS $$
  UPDATE profiles SET gold_beans = gold_beans + p_delta WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION add_points(p_user_id uuid, p_delta integer)
RETURNS void LANGUAGE sql AS $$
  UPDATE profiles SET points = points + p_delta WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION add_total_commission(p_user_id uuid, p_delta numeric)
RETURNS void LANGUAGE sql AS $$
  UPDATE profiles
     SET total_commission   = total_commission + p_delta,
         settled_commission = settled_commission + p_delta
   WHERE id = p_user_id;
$$;

-- 通用原子增减（供未来所有余额类字段复用，避免再散落 read→modify→write）
CREATE OR REPLACE FUNCTION atomic_add(p_user_id uuid, p_column text, p_delta numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('UPDATE profiles SET %I = %I + $1 WHERE id = $2', p_column, p_column)
  USING p_delta, p_user_id;
END;
$$;

-- ---------- ② 高频查询索引（避免全表扫描，P1 性能） ----------
CREATE INDEX IF NOT EXISTS idx_orders_user_id     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id    ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at  ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_beneficiary_id ON commissions(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order_id       ON commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status         ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_user_id    ON emotion_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_order_no    ON emotion_claims(order_no);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id       ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status        ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_profiles_invited_by       ON profiles(invited_by);

-- ---------- ③ emotion_claims 唯一约束（防并发重复确权，P1） ----------
-- 先去重：同一 (user_id, order_no) 仅保留 id 最小的一条，其余删除
DELETE FROM emotion_claims a
USING emotion_claims b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.order_no = b.order_no;

-- 用唯一索引代替 ADD CONSTRAINT（IF NOT EXISTS 对约束语法兼容性差，索引百分百兼容，效果相同）
CREATE UNIQUE INDEX IF NOT EXISTS uq_emotion_claims_user_order
  ON emotion_claims (user_id, order_no);
