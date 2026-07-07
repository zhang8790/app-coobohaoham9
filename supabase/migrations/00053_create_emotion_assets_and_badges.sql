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
