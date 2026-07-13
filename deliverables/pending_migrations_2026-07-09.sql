-- =====================================================================
-- 待执行迁移合并文件（来电有喜 V5 情绪系统 + 账户分离 + 合规）
-- 生成时间: 2026-07-09
-- 包含: 00050~00060 + 20260705_x2  （00060 为本次补建的 cv_total/tb_balance 漏洞修复）
--
-- 执行方式（任选其一）:
--   A. 推荐: supabase db push  （自动增量、按文件独立事务、记录 migration_history）
--   B. 本文件: 在 Supabase Dashboard → SQL Editor 粘贴整段执行，或 psql -f 本文件
--
-- 注意事项:
--   1. 所有语句均幂等(IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT)，可重复执行
--   2. 执行前建议先确认远端已跑过哪些: select * from supabase_migration_history order by inserted_at desc;
--   3. 若用方式B且部分已执行，幂等语句会跳过，非幂等的 UPDATE(00056/00058)重复执行无害
--   4. 00060 补建的 cv_total/tb_balance 供 00054 的回滚/封禁函数运行时调用，部署顺序无碍
-- =====================================================================


-- ===================== 00050_add_product_emotion_dimension_fields.sql =====================
-- 00050  商家情绪编译工作台：product_emotion 补全五维标签 / 质量分 / 审核态
-- ------------------------------------------------------------
-- 工作台（方案 §3）需要把商家「五维打标」结果、编译质量分、审核状态落库，
-- 原 product_emotion 仅有 emotion_title/emotion_detail/scene_tags_compiled/mood_tags_used，
-- 缺以下三列。本迁移补齐，全部幂等可重复执行。
--
-- 列说明：
--   dimension_tags  jsonb  —— 五维标签选择 {function:[],scene:[],emotion:[],identity:[],sensory:[]}
--   quality_score   smallint —— 编译质量评分（0~100，来自 emotion-scoring 引擎）
--   review_status   text   —— draft 草稿 / submitted 待审 / approved 通过 / rejected 驳回

-- 1. dimension_tags（默认空对象）
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS dimension_tags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. quality_score
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS quality_score smallint;

-- 3. review_status（带 CHECK 约束，默认 draft）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_emotion' AND column_name='review_status'
  ) THEN
    ALTER TABLE public.product_emotion
      ADD COLUMN review_status text NOT NULL DEFAULT 'draft';
  END IF;
END $$;

-- 4. CHECK 约束（幂等：先删后建）
ALTER TABLE public.product_emotion
  DROP CONSTRAINT IF EXISTS product_emotion_review_status_check;
ALTER TABLE public.product_emotion
  ADD CONSTRAINT product_emotion_review_status_check
  CHECK (review_status IN ('draft','submitted','approved','rejected'));

-- 5. 评分范围约束（0~100，可选）
ALTER TABLE public.product_emotion
  DROP CONSTRAINT IF EXISTS product_emotion_quality_score_check;
ALTER TABLE public.product_emotion
  ADD CONSTRAINT product_emotion_quality_score_check
  CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));

COMMENT ON COLUMN public.product_emotion.dimension_tags IS '五维情绪标签选择（功能/场景/情绪/身份/感官）';
COMMENT ON COLUMN public.product_emotion.quality_score IS '编译质量评分 0~100（emotion-scoring 引擎）';
COMMENT ON COLUMN public.product_emotion.review_status IS '情绪编译审核态：draft/submitted/approved/rejected';

SELECT '✅ 00050 完成：product_emotion 已补 dimension_tags / quality_score / review_status' AS result;

-- ===================== 00050_lower_rank_thresholds.sql =====================
-- 00050 下调 V5 段位阈值（个人累计消费门槛）
-- 执行时间：2026-07-07
-- 背景：移除团队业绩维度后，段位纯由个人累计消费决定，原阈值（掌门需 50000）过高。
--       用户要求调低段位门槛，使升级更易达（对应前端 commission-calculator-v5.ts 的改动）。
-- 新阈值（个人消费元）：江湖散修0 / 外门弟子200 / 内门弟子800 / 核心弟子2000 / 长老6000 / 掌门20000
-- 说明：返回类型与 00049 一致，PostgreSQL 允许 CREATE OR REPLACE 同签名函数；
--       但为与历史迁移保持一致、避免任何签名歧义，仍先 DROP 再 CREATE（幂等可重跑）。

-- 强制删除所有同名重载（避免旧签名残留导致 "cannot change return type" 42P13）
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE proname = 'get_rank_progress'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION get_rank_progress(user_id UUID)
RETURNS TABLE (
  current_rank TEXT,
  next_rank TEXT,
  current_count INTEGER,
  target_count INTEGER,
  direct_count INTEGER,
  l1_ratio NUMERIC,
  l2_ratio NUMERIC,
  points_ratio NUMERIC
) AS $$
DECLARE
  profile_record RECORD;
  dynamic_score NUMERIC;
  current_rank_name TEXT;
  next_rank_name TEXT;
  l1_ratio_value NUMERIC;
  l2_ratio_value NUMERIC;
  points_ratio_value NUMERIC;
BEGIN
  -- 获取用户资料和推荐关系（仅取个人累计消费）
  SELECT
    p.total_consumption,
    COUNT(DISTINCT r.id) as direct_count
  INTO profile_record
  FROM profiles p
  LEFT JOIN profiles r ON r.referrer_id = p.id
  WHERE p.id = user_id
  GROUP BY p.id, p.total_consumption;

  -- 动态分数 = 个人累计消费（不再含团队业绩）
  dynamic_score := COALESCE(profile_record.total_consumption, 0);

  -- 判定当前段位（阈值下调：江湖散修0 / 外门弟子200 / 内门弟子800 / 核心弟子2000 / 长老6000 / 掌门20000）
  SELECT rank_name, l1_ratio, l2_ratio, points_ratio
  INTO current_rank_name, l1_ratio_value, l2_ratio_value, points_ratio_value
  FROM (
    VALUES
      ('江湖散修', 0,     0.40, 0.15, 0.10),
      ('外门弟子', 200,   0.45, 0.18, 0.12),
      ('内门弟子', 800,   0.50, 0.20, 0.13),
      ('核心弟子', 2000,  0.54, 0.22, 0.14),
      ('长老',     6000,  0.57, 0.24, 0.15),
      ('掌门',     20000, 0.60, 0.25, 0.15)
  ) AS rank_table(rank_name, min_score, l1, l2, points)
  WHERE dynamic_score >= min_score
  ORDER BY min_score DESC
  LIMIT 1;

  -- 如果没有匹配（新用户），默认为江湖散修
  IF current_rank_name IS NULL THEN
    current_rank_name := '江湖散修';
    l1_ratio_value := 0.40;
    l2_ratio_value := 0.15;
    points_ratio_value := 0.10;
  END IF;

  -- 获取下一段位
  SELECT rank_name INTO next_rank_name
  FROM (
    VALUES
      ('外门弟子', 200),
      ('内门弟子', 800),
      ('核心弟子', 2000),
      ('长老', 6000),
      ('掌门', 20000)
  ) AS next_table(rank_name, min_score)
  WHERE min_score > dynamic_score
  ORDER BY min_score ASC
  LIMIT 1;

  -- 返回结果
  RETURN QUERY
  SELECT
    current_rank_name,
    COALESCE(next_rank_name, '已达最高段位'),
    profile_record.direct_count,
    CASE
      WHEN next_rank_name = '外门弟子' THEN 1
      WHEN next_rank_name = '内门弟子' THEN 3
      WHEN next_rank_name = '核心弟子' THEN 10
      WHEN next_rank_name = '长老' THEN 30
      WHEN next_rank_name = '掌门' THEN 100
      ELSE 0
    END,
    profile_record.direct_count,
    l1_ratio_value,
    l2_ratio_value,
    points_ratio_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===================== 00051_create_emotion_funnel_events.sql =====================
-- 情绪导购漏斗埋点表（对应方案 §5.5 数据闭环）
-- 记录五屏情绪详情页的用户行为：进入 / 各屏到达 / 点击购买 / 下单
-- 供商家「情绪漏斗」看板聚合分析，衡量情绪导购转化效果。
-- 测试期 RLS 全关（与项目其余表一致）；无 FK 约束，避免外键类型/存在性依赖导致插入失败。

CREATE TABLE IF NOT EXISTS emotion_funnel_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  product_id   uuid        NOT NULL,
  store_id     uuid,
  event_type   text        NOT NULL,   -- enter | screen_view | cta_click | order_created
  screen_index int,                     -- screen_view 时为 0~4
  source       text        DEFAULT 'emotion_detail',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_funnel_events_store
  ON emotion_funnel_events (store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_emotion_funnel_events_product
  ON emotion_funnel_events (product_id, event_type);

ALTER TABLE emotion_funnel_events DISABLE ROW LEVEL SECURITY;

-- ===================== 00052_create_emotion_claims.sql =====================
-- 情绪确权记录表（消费即确权路线）
-- 与方案 §5.4 原设计的「独立情绪激活码」不同：本项目采用「消费即确权」，
-- 用户走完 扫码购→加购→结算→支付成功 后，在支付成功页引导进入 emotion-claim 做情绪确权，
-- 不再新增第四套实体二维码。因此本表无需 activation_codes，仅记录确权行为 + 奖励发放。
--
-- 设计要点：
-- 1. 不加任何外键约束 —— 规避项目历史中 store_id UUID/INTEGER 类型漂移导致插入失败的坑。
-- 2. order_no 存订单号文本（非 order.id），与 payment 页既有的 orderNo 变量对齐，避免与外键类型纠缠。
-- 3. selected_emotion 用 text[] 存用户多选的情绪标签（如 ['治愈','温馨']）。
-- 4. RLS 关闭（与项目测试期所有表一致）。

CREATE TABLE IF NOT EXISTS emotion_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  order_no text,
  product_id text,
  store_id text,
  selected_emotion text[],
  badge_text text,
  tongbao_amount smallint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_claims_user ON emotion_claims (user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_product ON emotion_claims (product_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_order ON emotion_claims (order_no);

-- 与项目测试期所有表一致：关闭行级安全（上线前需重新评估）
ALTER TABLE emotion_claims DISABLE ROW LEVEL SECURITY;

-- ===================== 00053_create_emotion_assets_and_badges.sql =====================
-- =====================================================
-- V5 P2-1: 情绪通宝/徽章独立化
-- 之前的情绪通宝复用 profiles.points + points_logs(类型=emotion_claim)，
-- 现在抽出独立表与流水，避免和普通积分混淆。
-- 包含：emotion_assets(通宝余额/冻结) + emotion_tongbao_logs(通宝流水) +
--       emotion_badge_defs(徽章定义，前端只读) + emotion_badge_grants(徽章发放)
-- 全部 DISABLE RLS（测试期）；正式上线需按 user_id 收紧。
-- =====================================================

-- 1) 情绪通宝账户（一行一用户）
CREATE TABLE IF NOT EXISTS public.emotion_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE,
  balance       INTEGER NOT NULL DEFAULT 0,    -- 当前可用通宝
  frozen        INTEGER NOT NULL DEFAULT 0,    -- 冻结中（例如情绪喂养/兑换时扣的）
  total_earned  INTEGER NOT NULL DEFAULT 0,    -- 累计获得
  total_spent   INTEGER NOT NULL DEFAULT 0,    -- 累计消耗
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emotion_assets_user ON public.emotion_assets(user_id);

-- 2) 通宝流水（增/减都记）
CREATE TABLE IF NOT EXISTS public.emotion_tongbao_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  delta       INTEGER NOT NULL,                -- 正=获得，负=消耗
  balance_after INTEGER NOT NULL,             -- 流水后余额（冗余便于展示/对账）
  reason      TEXT NOT NULL,                  -- 'emotion_claim' / 'emotion_feed' / 'emotion_exchange' / 'admin_adjust' 等
  ref_id      TEXT,                           -- 关联订单号/商品ID/激活码
  remark      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emotion_tongbao_logs_user_time
  ON public.emotion_tongbao_logs(user_id, created_at DESC);

-- 3) 徽章定义（运营可改，前端读字典渲染）
-- 预置 5 枚 V5 上线徽章
CREATE TABLE IF NOT EXISTS public.emotion_badge_defs (
  code         TEXT PRIMARY KEY,              -- 'first_claim' / 'five_emotions' / 'empath' / 'tongbao_100' / 'share_claim'
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  icon         TEXT NOT NULL,                 -- emoji 或 icon key
  rarity       TEXT NOT NULL DEFAULT 'common',-- common / rare / epic / legend
  unlock_hint  TEXT NOT NULL,                 -- 解锁条件描述（前端展示）
  sort_order   INTEGER NOT NULL DEFAULT 100,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.emotion_badge_defs (code, name, description, icon, rarity, unlock_hint, sort_order) VALUES
  ('first_claim',   '初识情绪',     '完成首次情绪确权',         '🌱', 'common', '在情绪确权页确认 1 次商品情绪',  10),
  ('five_emotions', '五味杂陈',     '确权商品的情绪标签覆盖 5 个不同维度', '🎨', 'rare',   '在多次确权中累计 5 个不同情绪维度',  20),
  ('empath',        '共情者',       '累计确权商品达到 10 件',   '💝', 'rare',   '确权 10 件不同的商品',            30),
  ('tongbao_100',   '通宝藏家',     '通宝余额达到 100',         '🏆', 'epic',   '攒到 100 枚情绪通宝',            40),
  ('share_claim',   '情绪布道者',   '分享确权卡给好友并完成一次有效锁客', '📣', 'legend', '分享确权卡并成功锁客 1 人',     50)
ON CONFLICT (code) DO NOTHING;

-- 4) 徽章发放（一行一获得）
CREATE TABLE IF NOT EXISTS public.emotion_badge_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  badge_code   TEXT NOT NULL REFERENCES public.emotion_badge_defs(code) ON DELETE CASCADE,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_at    TIMESTAMPTZ,                  -- 可选过期
  source       TEXT,                         -- 'auto' / 'admin'
  UNIQUE (user_id, badge_code)               -- 同一徽章对同一用户只发一次
);
CREATE INDEX IF NOT EXISTS idx_emotion_badge_grants_user
  ON public.emotion_badge_grants(user_id);

-- 5) 维护 emotion_assets.updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_emotion_assets() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emotion_assets_updated_at ON public.emotion_assets;
CREATE TRIGGER trg_emotion_assets_updated_at
  BEFORE UPDATE ON public.emotion_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_emotion_assets();

-- RLS: 测试期关闭
ALTER TABLE public.emotion_assets        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_tongbao_logs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_badge_defs    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_badge_grants  DISABLE ROW LEVEL SECURITY;

-- 给 PostgREST 暴露（虽然 anon key 也能读，但加个备注）
COMMENT ON TABLE public.emotion_assets        IS 'V5 P2: 用户情绪通宝账户（独立于 profiles.points）';
COMMENT ON TABLE public.emotion_tongbao_logs  IS 'V5 P2: 情绪通宝流水（增/减/来源）';
COMMENT ON TABLE public.emotion_badge_defs    IS 'V5 P2: 情绪徽章定义字典（运营可改）';
COMMENT ON TABLE public.emotion_badge_grants  IS 'V5 P2: 情绪徽章发放记录';

-- ===================== 00054_emotion_rollback_and_rules.sql =====================
-- =====================================================================
-- 情绪确权：特殊场景回退与修正算法
--   §5.1 订单退款 / 确权作废 —— 回滚本次贡献值(含上级裂变附加分)
--   §5.2 用户违规封禁 —— 个人贡献值清零 + 上级裂变分同步扣回
--   §5.3 算法规则迭代 —— 版本化，仅对生效后确权生效、历史不回溯、提前≥7天公示
--
-- 依赖：00052(emotion_claims) / 00053(emotion_assets) / 00001(profiles,orders)
-- 幂等：所有 ALTER 用 IF NOT EXISTS，函数用 CREATE OR REPLACE，种子用 ON CONFLICT
--
-- 粘贴到 Supabase Dashboard → SQL Editor 执行即可（纯 SQL，非 TS）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) emotion_claims 增补字段
--    （同时修复 grantEmotionClaim 长期存在的列名 bug：原代码写 tb_amount/
--      cv_amount/badge_code，但表只有 tongbao_amount 且无后两者 → 正常确权静默失败）
-- ---------------------------------------------------------------------
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS tb_amount       numeric(12,2) NOT NULL DEFAULT 0; -- 本次发放的通宝
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS cv_amount       numeric(12,4) NOT NULL DEFAULT 0; -- 本次新增【个人贡献值 CV】——回滚的唯一依据
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS badge_code      text;                            -- 关联徽章定义(emotion_badge_defs.code)
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l1       uuid;                            -- 直接推荐人(L1)用户ID
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l2       uuid;                            -- 间接推荐人(L2)用户ID
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l1_cv    numeric(12,4) NOT NULL DEFAULT 0; -- 给 L1 的裂变附加分
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l2_cv    numeric(12,4) NOT NULL DEFAULT 0; -- 给 L2 的裂变附加分
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'active'
   CHECK (status IN ('active','voided'));                                                     -- 作废标记
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS rule_version    text;                            -- 确权生效时的规则版本(§5.3)
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS voided_at       timestamptz;
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS voided_reason   text;
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS refund_ratio    numeric(5,4) NOT NULL DEFAULT 1  -- 作废时按退款比例回滚(1=全额)
   CHECK (refund_ratio BETWEEN 0 AND 1);

COMMENT ON COLUMN emotion_claims.cv_amount    IS '本次确权新增的个人贡献值(CV)，回滚的唯一依据';
COMMENT ON COLUMN emotion_claims.upline_l1_cv IS '因本次确权给直接推荐人(L1)的裂变附加分';
COMMENT ON COLUMN emotion_claims.upline_l2_cv IS '因本次确权给间接推荐人(L2)的裂变附加分';
COMMENT ON COLUMN emotion_claims.status       IS 'active=有效, voided=已作废(退款/封禁)';
COMMENT ON COLUMN emotion_claims.rule_version IS '确权时生效的规则版本，保证历史数据不回溯(§5.3)';

CREATE INDEX IF NOT EXISTS idx_emotion_claims_status     ON emotion_claims(status);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_rule_ver   ON emotion_claims(rule_version);

-- ---------------------------------------------------------------------
-- 2) profiles：违规封禁标记(§5.2)
-- ---------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned  boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at  timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
COMMENT ON COLUMN profiles.is_banned IS '违规封禁(§5.2)：封禁后贡献值清零且不计入全平台总贡献';

-- ---------------------------------------------------------------------
-- 3) orders：退款比例(§5.1 部分退款同比例扣减)
-- ---------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_ratio   numeric(5,4) NOT NULL DEFAULT 0
   CHECK (refund_ratio BETWEEN 0 AND 1);   -- 0=无退款, 1=全额退款
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount  numeric(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN orders.refund_ratio IS '退款比例，触发确权按同比例回滚(§5.1)';

-- ---------------------------------------------------------------------
-- 4) emotion_rule_versions：规则版本表(§5.3)
--    const_json 保存该版本的算法常量；生效时间必须晚于公示时间≥7天
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emotion_rule_versions (
  version      text PRIMARY KEY,
  announced_at timestamptz NOT NULL,                 -- 公示时间
  effective_at timestamptz NOT NULL,                 -- 生效时间（必须 ≥ announced_at + 7天）
  const_json   jsonb NOT NULL,                       -- 该版本算法常量
  note         text,
  is_active    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_notice_7d CHECK (effective_at >= announced_at + interval '7 days')
);
COMMENT ON TABLE emotion_rule_versions IS '确权算法规则版本(§5.3)：调整仅对生效后确权生效、历史不回溯、需提前≥7天公示';

-- 种子：当前上线版本 v1.0（announced 与 effective 都已过去且间隔≥7天，满足约束）
INSERT INTO emotion_rule_versions (version, announced_at, effective_at, const_json, note, is_active)
VALUES (
  '1.0',
  '2026-06-01 00:00:00+08',
  '2026-06-08 00:00:00+08',
  '{
    "EMOTION_TB_PER_CLAIM": 10,
    "R_TB": 0.15,
    "R_DIV": 0.30,
    "M_MIN": 10,
    "P_BASE": 100,
    "W_BEH_MAX": 1.5,
    "EMOTION_CV_RATE": 0.12,
    "R_FISS_L1": 0.05,
    "R_FISS_L2": 0.02,
    "GROSS_MARGIN_FALLBACK": 0.15
  }'::jsonb,
  '初始上线版本',
  true
)
ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5) §5.1 退款/作废：原子回滚函数
--    回滚贡献值 = -(本次个人CV×比例 + L1裂变分×比例 + L2裂变分×比例)
--    全额退款比例=1；部分退款比例=refund_ratio（同比例扣减消费权重后扣差额）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_void_emotion_claim(
  p_claim_id     uuid,
  p_reason       text DEFAULT 'refund',
  p_refund_ratio numeric DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v          record;
  v_factor   numeric;
  v_cv_back  numeric;
  v_tb_back  numeric;
  v_l1_back  numeric;
  v_l2_back  numeric;
BEGIN
  -- 行锁，避免并发重复回滚
  SELECT * INTO v FROM emotion_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'claim not found');
  END IF;
  IF v.status = 'voided' THEN
    RETURN jsonb_build_object('ok', true, 'msg', 'already voided');
  END IF;

  v_factor := COALESCE(p_refund_ratio, 1);
  IF v_factor < 0 THEN v_factor := 0; END IF;
  IF v_factor > 1 THEN v_factor := 1; END IF;

  -- §5.1：仅回滚本次确权产生的所有贡献值（按退款比例同比例）
  v_cv_back := ROUND((v.cv_amount   * v_factor)::numeric, 4);
  v_l1_back := ROUND((v.upline_l1_cv * v_factor)::numeric, 4);
  v_l2_back := ROUND((v.upline_l2_cv * v_factor)::numeric, 4);
  v_tb_back := ROUND((v.tb_amount   * v_factor)::numeric, 2);

  -- 回滚本人：贡献值 + 通宝（不低于 0）
  UPDATE profiles
     SET cv_total   = GREATEST(0, ROUND((COALESCE(cv_total,0)   - v_cv_back)::numeric, 4)),
         tb_balance = GREATEST(0, ROUND((COALESCE(tb_balance,0) - v_tb_back)::numeric, 2))
   WHERE id = v.user_id;

  -- 回滚直接上级裂变附加分
  IF v_l1_back > 0 AND v.upline_l1 IS NOT NULL THEN
    UPDATE profiles
       SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - v_l1_back)::numeric, 4))
     WHERE id = v.upline_l1;
  END IF;

  -- 回滚间接上级裂变附加分
  IF v_l2_back > 0 AND v.upline_l2 IS NOT NULL THEN
    UPDATE profiles
       SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - v_l2_back)::numeric, 4))
     WHERE id = v.upline_l2;
  END IF;

  -- 标记作废（不影响历史其他确权）
  UPDATE emotion_claims
     SET status = 'voided',
         voided_at = now(),
         voided_reason = p_reason,
         refund_ratio = v_factor
   WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cv_back', v_cv_back, 'tb_back', v_tb_back,
    'l1_back', v_l1_back, 'l2_back', v_l2_back, 'factor', v_factor
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6) §5.2 违规封禁：原子清零 + 上级裂变分同步扣回
--    个人所有贡献值清零、不计入总贡献；其上级因该用户获得的裂变分全额扣回
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ban_user_rollback(
  p_user_id uuid,
  p_reason  text DEFAULT 'violation'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        record;
  tot_l1   numeric := 0;
  tot_l2   numeric := 0;
BEGIN
  -- 标记封禁 + 本人贡献值/通宝清零（清零即“不计入全平台总贡献值”）
  UPDATE profiles
     SET is_banned  = true,
         banned_at  = now(),
         ban_reason = p_reason,
         cv_total   = 0,
         tb_balance = 0
   WHERE id = p_user_id;

  -- 回滚其上级曾因该用户获得的裂变贡献值（全额扣回）
  FOR r IN
    SELECT upline_l1, upline_l2, upline_l1_cv, upline_l2_cv
      FROM emotion_claims
     WHERE user_id = p_user_id AND status = 'active'
  LOOP
    IF r.upline_l1 IS NOT NULL AND r.upline_l1_cv > 0 THEN
      UPDATE profiles
         SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - r.upline_l1_cv)::numeric, 4))
       WHERE id = r.upline_l1;
      tot_l1 := tot_l1 + r.upline_l1_cv;
    END IF;
    IF r.upline_l2 IS NOT NULL AND r.upline_l2_cv > 0 THEN
      UPDATE profiles
         SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - r.upline_l2_cv)::numeric, 4))
       WHERE id = r.upline_l2;
      tot_l2 := tot_l2 + r.upline_l2_cv;
    END IF;
  END LOOP;

  -- 该用户所有有效确权标记作废（避免被重新计入总贡献）
  UPDATE emotion_claims
     SET status = 'voided', voided_at = now(), voided_reason = 'ban:' || p_reason
   WHERE user_id = p_user_id AND status = 'active';

  RETURN jsonb_build_object(
    'ok', true,
    'upline_l1_back', ROUND(tot_l1, 4),
    'upline_l2_back', ROUND(tot_l2, 4)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 7) 全平台总贡献值（排除封禁用户 & 已作废确权已各自扣减）
--    供 getPlatformMetrics 回退使用，保证占比分母实时准确(§5.2 不计入)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_total_cv() RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cv_total), 0)::numeric
    FROM profiles
   WHERE NOT is_banned;
$$;

-- ---------------------------------------------------------------------
-- 8) 权限：函数可被 anon/authenticated 调用（本项目 anon 受信任；
--    生产环境建议改为仅 service_role / admin 角色调用）
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_void_emotion_claim(uuid, text, numeric)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_ban_user_rollback(uuid, text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_total_cv()                                TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 9) emotion_rule_versions 行级安全：规则版本属公开配置，允许只读
-- ---------------------------------------------------------------------
ALTER TABLE emotion_rule_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rule_versions_public_read" ON emotion_rule_versions;
CREATE POLICY "rule_versions_public_read" ON emotion_rule_versions
  FOR SELECT USING (true);
GRANT SELECT ON emotion_rule_versions TO anon, authenticated;

-- ===================== 00055_add_ship_and_verify_columns.sql =====================
-- 00055: 补全 orders 表发货/核销相关字段
-- 商家端「发货」与「到店核销」需要持久化物流信息与核销时间。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴运行（纯 SQL，非 Edge Function）

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ship_company text,
  ADD COLUMN IF NOT EXISTS ship_no text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- 校验
DO $$
DECLARE
  v_found text;
BEGIN
  SELECT ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('ship_company','ship_no','verified_at'))
    INTO v_found
  FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name IN ('ship_company','ship_no','verified_at');
  RAISE NOTICE 'orders 发货/核销字段: %', COALESCE(v_found::text, '无');
END $$;

-- ===================== 00056_enhance_product_mood_dimensions.sql =====================
-- 00056 增强存量商品情绪标签维度（让"说心情"匹配率更高）
-- 在 00019 基础上，补充 孤独 / 陪伴 / 治愈 / 想念 / 放松 等用户常见心情词维度。
-- 用 array_cat + DISTINCT 追加，不覆盖 00019 已打的标签。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴执行（纯 SQL，非 Edge Function）。

-- 图书 / 文创 / 文具 → 孤独、安静、治愈、陪伴、学习空间、想念
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['孤独','安静','治愈','陪伴','学习空间','想念'])))
)
WHERE name ILIKE ANY(ARRAY['%书%','%笔%','%本%','%文具%','%文创%','%手账%','%笔记本%','%纸%','%日历%','%贴纸%']);

-- 家居 / 日用 → 治愈、安静、陪伴、放松
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','安静','陪伴','放松'])))
)
WHERE name ILIKE ANY(ARRAY['%家居%','%日用%','%杯%','%碗%','%盘%','%锅%','%壶%','%灯%','%香薰%','%蜡烛%','%靠垫%','%毛巾%']);

-- 饮品 / 咖啡 / 茶 → 治愈、放松、安静、独处
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','安静','独处'])))
)
WHERE name ILIKE ANY(ARRAY['%饮%','%咖啡%','%茶%','%奶茶%','%果汁%','%水%']);

-- 零食 / 甜品 → 治愈、满足、陪伴、甜蜜
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','满足','陪伴','甜蜜'])))
)
WHERE name ILIKE ANY(ARRAY['%零%','%糖%','%甜%','%饼%','%果%','%巧%','%布丁%','%冰淇淋%']);

-- 礼品 / 饰品 → 想念、分享、仪式感、治愈
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['想念','分享','仪式感','治愈'])))
)
WHERE name ILIKE ANY(ARRAY['%礼%','%饰%','%项链%','%手链%','%戒指%','%耳环%','%手镯%','%摆件%','%装饰%','%贺卡%']);

-- 美妆 / 护肤 → 治愈、放松、仪式感、精致
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','仪式感','精致'])))
)
WHERE name ILIKE ANY(ARRAY['%妆%','%护肤%','%面膜%','%精华%','%口红%','%防晒%','%洗面%','%乳液%','%面霜%']);

-- 养生 / 健康 → 治愈、放松、安静、陪伴
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','安静','陪伴'])))
)
WHERE name ILIKE ANY(ARRAY['%养生%','%枸杞%','%红枣%','%保健%','%按摩%','%足浴%','%泡脚%']);

-- 查看结果
-- SELECT id, name, mood_tags FROM products ORDER BY id LIMIT 20;

-- ===================== 00057_emotion_lexicon.sql =====================
-- 00057 情绪词库表（运营可维护的用户表达词 → 标准情绪标签）
-- 这是前端 EMOTION_KEYWORD_MAP 的 DB 化基础：运营/非技术也能加同义词，
-- 未来 analyzeEmotion 可优先读此表（未命中再走 LLM 兜底）。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴执行（纯 SQL，非 Edge Function）。

CREATE TABLE IF NOT EXISTS public.emotion_lexicon (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_expr text NOT NULL,                 -- 用户原始表达，如 "失恋"、"被甩"
  canonical_tag text NOT NULL,            -- 标准情绪标签，如 "治愈"（须属于 ALL_MOOD_TAGS）
  weight int NOT NULL DEFAULT 3,          -- 命中权重（主标签最高，后续递减）
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raw_expr, canonical_tag)
);

COMMENT ON TABLE public.emotion_lexicon IS '情绪用户表达词库：raw_expr(用户怎么说) → canonical_tag(标准情绪标签)。前端 EMOTION_KEYWORD_MAP 的 DB 化来源。';
COMMENT ON COLUMN public.emotion_lexicon.weight IS '命中权重：主情绪给 3，第二给 2，第三给 1；其余同义给 3。';

-- 种子：把当前前端 EMOTION_KEYWORD_MAP 高频条目搬入（节选，后续运营可补）
INSERT INTO public.emotion_lexicon (raw_expr, canonical_tag, weight) VALUES
  ('失恋','治愈',3),('失恋','孤独',2),('失恋','安静',1),
  ('分手','治愈',3),('分手','孤独',2),('分手','安静',1),
  ('被甩','治愈',3),('被甩','孤独',2),('被甩','安静',1),
  ('被绿','治愈',3),('被绿','孤独',2),('被绿','安静',1),
  ('心碎','治愈',3),('心碎','孤独',2),('心碎','安静',1),
  ('累','治愈',3),('累','放松',3),('累','安静',1),
  ('好累','治愈',3),('好累','放松',3),('好累','安静',1),
  ('心累','治愈',3),('心累','孤独',2),('心累','安静',1),
  ('emo','治愈',3),('emo','放松',2),('emo','孤独',1),
  ('孤独','孤独',3),('孤独','治愈',2),('孤独','安静',1),
  ('寂寞','孤独',3),('寂寞','治愈',2),
  ('想念','想念',3),('思念','想念',3),('想你','想念',3),
  ('开心','愉悦',3),('开心','快乐',2),('开心','甜蜜',1),
  ('高兴','愉悦',3),('高兴','快乐',2),
  ('犒赏','满足',3),('犒赏','幸福',2),('犒赏','品质',1),
  ('犒劳','满足',3),('犒劳','幸福',2),('犒劳','品质',1),
  ('治愈','治愈',3),
  ('焦虑','治愈',3),('焦虑','放松',2),('焦虑','安静',1),
  ('压力大','治愈',3),('压力大','放松',2),
  ('失眠','安静',3),('失眠','治愈',2),('失眠','放松',1),
  ('加班','治愈',3),('加班','放松',2),('加班','安静',1),
  ('约会','甜蜜',3),('约会','幸福',2),('约会','仪式感',1),
  ('生日','甜蜜',3),('生日','幸福',2),('生日','分享',1)
ON CONFLICT (raw_expr, canonical_tag) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_emotion_lexicon_raw ON public.emotion_lexicon (raw_expr);

-- ===================== 00058_separate_commission_and_points.sql =====================
-- =============================================================
-- 00058 账户分离：推广佣金账户 vs 消费积分账户
-- =============================================================
-- 背景（合规动因）
--   原 gold_beans 字段同时承担两个互斥角色：
--     ① 订单 1:1 抵扣（消费积分，api.createOrderV2 / refund-order）
--     ② 被 withdraw / admin-withdrawals 当作「可提现余额」读取并扣减
--   而真正的分销佣金流水实际写在 commissions 表 + profiles.total_commission / settled_commission，
--   且 withdrawals 表已有 commission_ids 字段本应绑定具体佣金。
--   => 代码把「消费积分」当「可提现平台代币」提现，观感上等同「平台发币可提现」（合规红线）。
--
-- 目标模型
--   gold_beans       = 【消费积分（金豆）】仅用于本平台订单 1:1 抵扣，不可提现、不可兑现金
--   commission_balance= 【推广佣金账户】由分销佣金流水驱动，可提现（代扣个税），与 gold_beans 完全隔离
--   withdrawals       = 仅可动 commission_balance，并通过 commission_ids 关联具体佣金明细
--
-- 执行方式：Supabase → SQL Editor 粘贴 → Run（纯 SQL，非 Edge Function）
-- =============================================================

BEGIN;

-- 1. 新增推广佣金账户（可提现，单位：元）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_balance numeric(12,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.commission_balance
  IS '推广佣金账户余额（即推广服务费，可提现并代扣个税）；由分销佣金流水驱动，与消费积分(gold_beans)完全隔离';

COMMENT ON COLUMN public.profiles.gold_beans
  IS '消费积分（金豆）：仅用于本平台订单 1:1 抵扣，不可提现、不可兑现金；与推广佣金账户(commission_balance)隔离';

-- 2. 存量数据回填（过渡口径，执行前请确认）
--    现状：历史上 withdraw / admin-withdrawals 从 gold_beans 提现；而佣金发放只写
--          total_commission / settled_commission，且发放时二者同额增加、提现却不扣 settled，
--          故 total_commission - settled_commission 对存量数据恒为 0 —— 原「减差」回填会得到 0，
--          导致存量用户提现归零。
--    决策：把用户「历史上实际可提现的余额」(gold_beans) 显式挂到 commission_balance，
--          gold_beans 本身保留不动（仍可作消费抵扣，不抹除任何权益）。
--          => commission_balance 与 gold_beans 各持一份，提现只消耗 commission_balance、
--             消费抵扣只消耗 gold_beans，二者独立不双花。
--    后续若 gold_beans 引入独立发放源（签到/活动），需重新界定两账户关系。
UPDATE public.profiles
SET commission_balance = GREATEST(0, COALESCE(gold_beans, 0))
WHERE COALESCE(gold_beans, 0) > 0;

-- 3. 约束：佣金账户、消费积分均不可为负（DO 块防历史脏数据导致 ALTER 失败）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_commission_balance_nonneg'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_commission_balance_nonneg CHECK (commission_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_gold_beans_nonneg'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_gold_beans_nonneg CHECK (gold_beans >= 0);
  END IF;
END $$;

COMMIT;

-- =============================================================
-- 配套代码改造（本迁移不自动改代码，详见《账户分离改造方案.md》）
--   必须同步执行，否则「提现仍读 gold_beans」的错乱不会消失：
--   A. 提现改为读 commission_balance：api.ts approveWithdrawal(2214) / getMyBalance(1931) /
--      pages/withdraw/index.tsx(47) / pages/admin-withdrawals / pages/my-promotion(70,86,111)
--   B. 佣金发放维护 commission_balance：api.ts distributeCommissionV4(999-1024) 发放时 +=，
--      且退款须同步回滚 commission_balance（当前 refund 只回滚 gold_beans，未回滚佣金，存在资损）
--   C. 订单/退款的 gold_beans 保持「仅消费抵扣」语义，注释澄清，绝不与提现混用
--   D. types.ts：Profile 新增 commission_balance:number；gold_beans 注释改为「消费积分，不可提现」
-- =============================================================

-- ===================== 00059_pipi_privacy_consent.sql =====================
-- 00059 PIPL 合规：隐私政策同意时间留痕
-- profiles 增加 privacy_consented_at，记录用户同意《隐私政策》的时间，供合规审计。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_consented_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.privacy_consented_at
  IS '用户同意《隐私政策》的时间；null 表示尚未同意（PIPL 合规审计留痕）';

-- ===================== 00060_ensure_profiles_cv_tb.sql =====================
-- =============================================================
-- 00060 补建 profiles.cv_total / tb_balance
-- ------------------------------------------------------------
-- 漏洞修复：00054 的 fn_void_emotion_claim / fn_ban_user_rollback /
-- fn_total_cv 大量引用这两列，但此前任何迁移都未创建它们
-- （grep 全 migrations 仅 00054 引用，无 CREATE）。不补建则
-- 函数虽能创建成功，调用时必报 "column cv_total does not exist"。
-- 类型对齐 00054：cv_total numeric(12,4) / tb_balance numeric(12,2)
-- 幂等可重复执行。
-- =============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cv_total   numeric(12,4) NOT NULL DEFAULT 0;  -- 个人累计贡献值(CV)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tb_balance numeric(12,2) NOT NULL DEFAULT 0;  -- 情绪通宝余额(独立账户)

COMMENT ON COLUMN public.profiles.cv_total
  IS '个人累计贡献值(CV)：情绪确权/裂变附加分累加，封禁时清零(§5.2)';
COMMENT ON COLUMN public.profiles.tb_balance
  IS '情绪通宝余额(独立账户)：回滚时按退款比例扣减';

SELECT '✅ 00060 完成：profiles 已补 cv_total / tb_balance' AS result;

-- ===================== 20260705_fix_user_store_relation_schema.sql =====================
-- ============================================
-- 修复 user_store_relation 表结构
-- 执行日期：2026-07-05
-- ============================================

-- 1. 添加 referrer_id 字段（推荐人ID）
ALTER TABLE public.user_store_relation 
ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES public.profiles(id);

-- 2. 添加 expires_at 字段（锁客过期时间）
ALTER TABLE public.user_store_relation 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3. 添加 status 字段（锁客状态）
ALTER TABLE public.user_store_relation 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- 4. 添加索引（提高查询性能）
CREATE INDEX IF NOT EXISTS idx_user_store_relation_user_id ON public.user_store_relation(user_id);
CREATE INDEX IF NOT EXISTS idx_user_store_relation_store_id ON public.user_store_relation(store_id);
CREATE INDEX IF NOT EXISTS idx_user_store_relation_status ON public.user_store_relation(status);

-- 5. 添加字段注释
COMMENT ON COLUMN public.user_store_relation.referrer_id IS '推荐人ID（锁客的来源用户）';
COMMENT ON COLUMN public.user_store_relation.expires_at IS '锁客关系过期时间（默认180天）';
COMMENT ON COLUMN public.user_store_relation.status IS '锁客状态：active-有效，expired-已过期，cancelled-已取消';

-- 6. 验证表结构
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_store_relation' 
ORDER BY ordinal_position;

-- 7. 显示成功消息
SELECT 'user_store_relation 表结构已修复' AS result;

-- ===================== 20260705_update_claim_campaign_with_lock.sql =====================
-- ============================================
-- 更新 claim_campaign 函数（添加锁客逻辑）
-- 执行日期：2026-07-05（2026-07-07 修正 p_store_id 为 TEXT+双CAST）
-- ============================================

DROP FUNCTION IF EXISTS public.claim_campaign CASCADE;

CREATE OR REPLACE FUNCTION public.claim_campaign(
    p_user_id UUID,
    p_campaign_id INTEGER,
    p_store_id TEXT DEFAULT NULL,     -- TEXT 中间层，兼容 INTEGER(user_campaign_claims) 和 UUID(user_store_relation)
    p_device_id VARCHAR DEFAULT NULL,
    p_referrer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campaign RECORD;
    v_existing_claim INTEGER;
    v_daily_claims INTEGER;
    v_existing_lock INTEGER;
    v_result JSONB;
BEGIN
    -- 1. 获取活动信息
    SELECT * INTO v_campaign 
    FROM public.marketing_campaigns 
    WHERE id = p_campaign_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '活动不存在');
    END IF;
    
    -- 2. 检查活动状态
    IF v_campaign.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已结束');
    END IF;
    
    -- 3. 检查活动时间
    IF CURRENT_DATE < v_campaign.start_date OR CURRENT_DATE > v_campaign.end_date THEN
        RETURN jsonb_build_object('success', false, 'error', '活动未开始或已结束');
    END IF;
    
    -- 4. 检查领取上限
    IF v_campaign.claimed_count >= v_campaign.total_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已领完');
    END IF;
    
    -- 5. 检查每日限领
    SELECT COUNT(*) INTO v_daily_claims 
    FROM public.user_campaign_claims 
    WHERE campaign_id = p_campaign_id 
      AND claim_date = CURRENT_DATE;
      
    IF v_daily_claims >= v_campaign.daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '今日已领完，请明天再来');
    END IF;
    
    -- 6. 检查用户是否重复领取
    SELECT COUNT(*) INTO v_existing_claim 
    FROM public.user_campaign_claims 
    WHERE user_id = p_user_id 
      AND campaign_id = p_campaign_id 
      AND claim_date = CURRENT_DATE;
      
    IF v_existing_claim > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', '您今天已经领过这个奖励了');
    END IF;
    
    -- 7. 记录领取（user_campaign_claims.store_id 是 INTEGER）
    INSERT INTO public.user_campaign_claims (
        user_id, 
        campaign_id, 
        store_id, 
        device_id,
        claimed_at
    ) VALUES (
        p_user_id, 
        p_campaign_id, 
        CASE WHEN p_store_id IS NOT NULL THEN p_store_id::INTEGER ELSE NULL END,
        p_device_id,
        NOW()
    );
    
    -- 8. 更新领取计数
    UPDATE public.marketing_campaigns 
    SET claimed_count = claimed_count + 1 
    WHERE id = p_campaign_id;
    
    -- 9. 建立锁客关系（user_store_relation.store_id 是 UUID）
    SELECT COUNT(*) INTO v_existing_lock
    FROM public.user_store_relation
    WHERE user_id = p_user_id 
      AND store_id = CASE WHEN p_store_id IS NOT NULL THEN p_store_id::UUID ELSE NULL END;
    
    IF v_existing_lock = 0 THEN
        INSERT INTO public.user_store_relation (
            user_id, 
            store_id, 
            referrer_id, 
            lock_type, 
            locked_at,
            expires_at,
            status
        ) VALUES (
            p_user_id,
            CASE WHEN p_store_id IS NOT NULL THEN p_store_id::UUID ELSE NULL END,
            p_referrer_id,
            'campaign',
            NOW(),
            NOW() + INTERVAL '180 days',
            'active'
        );
    END IF;
    
    -- 10. 返回成功
    v_result := jsonb_build_object(
        'success', true,
        'campaign_type', v_campaign.campaign_type,
        'gift_name', v_campaign.gift_name,
        'gift_value', v_campaign.gift_value,
        'commission_rate', v_campaign.commission_rate,
        'locked', v_existing_lock = 0
    );
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.claim_campaign IS '领取营销活动奖励（含锁客逻辑）- 2026-07-07修正';

SELECT 'claim_campaign 函数已更新' AS result;
