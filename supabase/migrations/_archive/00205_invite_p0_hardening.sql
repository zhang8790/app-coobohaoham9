-- 00205 邀请码绑定门店 · P0 加固
-- 依据：《邀请码绑定门店_运营与交互方案.md》第 6 节
-- 设计原则：全部 additive + 向后兼容
--   · create_store_invite 保持返回 text（admin-web 已按 string 消费），新增参数全部带 DEFAULT → 老调用不破
--   · redeem_store_invite 保持 {ok, ...} 结构，仅把笼统的 invalid_or_expired 拆细；旧分支读 res.error 仍可用
--   · 不改 store_staff 结构；permissions ARRAY 沉淀到 P1（前端当前零引用，避免臆造权限 key）

BEGIN;

-- ---------- A. store_invites 扩展列 ----------
ALTER TABLE public.store_invites
  ADD COLUMN IF NOT EXISTS max_uses   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS use_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remark     text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid;

COMMENT ON COLUMN public.store_invites.max_uses   IS '可用次数上限。>1 时限定 staff/cashier 低权限角色';
COMMENT ON COLUMN public.store_invites.use_count  IS '已兑换次数';
COMMENT ON COLUMN public.store_invites.remark     IS '发放备注（发给谁/用途），运营可追溯';
COMMENT ON COLUMN public.store_invites.revoked_at IS '主动撤销时间。非空即失效，与 expires_at 并列判断';

CREATE INDEX IF NOT EXISTS idx_store_invites_live
  ON public.store_invites (store_id, expires_at)
  WHERE used_by IS NULL AND revoked_at IS NULL;

-- ---------- B. 兑换审计 / 撞库限速表 ----------
-- 一张表同时承担两个职责：成功绑定留痕（审计）+ 失败尝试计数（限速）
CREATE TABLE IF NOT EXISTS public.store_invite_redemptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id    uuid REFERENCES public.store_invites(id) ON DELETE SET NULL,
  code_attempt text NOT NULL,                 -- 记录尝试的码本身，码不存在时 invite_id 为 NULL 仍可追查撞库
  store_id     uuid,
  user_id      uuid NOT NULL,
  ok           boolean NOT NULL DEFAULT false,
  error_code   text,
  role         text,
  prev_role    text,                          -- 覆盖为本店成员时的旧角色，用于回溯提权/降权
  source       text NOT NULL DEFAULT 'code',  -- code / qrcode / admin
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_invite_redemptions
  IS '邀请码兑换流水：既做绑定审计（成功=一行），也做撞库限速（失败计数）';

CREATE INDEX IF NOT EXISTS idx_redemptions_user_time
  ON public.store_invite_redemptions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_store
  ON public.store_invite_redemptions (store_id, created_at DESC);

ALTER TABLE public.store_invite_redemptions ENABLE ROW LEVEL SECURITY;

-- 只读：管理员全量；本店成员仅本店。写权限不开放给任何角色 —— 只能走 SECURITY DEFINER 函数，
-- 防止伪造兑换流水或篡改审计。
DROP POLICY IF EXISTS rls_redemptions_select ON public.store_invite_redemptions;
CREATE POLICY rls_redemptions_select ON public.store_invite_redemptions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (store_id IS NOT NULL AND store_id = ANY (public.fn_my_store_ids(auth.uid())))
    OR user_id = auth.uid()
  );

-- ---------- C. 角色序 helper（供降级发放与角色冲突判定使用）----------
-- owner(4) > manager(3) > staff(2) > cashier(1)，未知角色记 0
CREATE OR REPLACE FUNCTION public.fn_role_rank(p_role text)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  RETURN CASE p_role
    WHEN 'owner'   THEN 4
    WHEN 'manager' THEN 3
    WHEN 'staff'   THEN 2
    WHEN 'cashier' THEN 1
    ELSE 0
  END;
END;
$fn$;

-- 调用者在指定门店的实际角色。owner_id 命中视同 owner(4)
CREATE OR REPLACE FUNCTION public.fn_my_store_role(p_store_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT GREATEST(
    COALESCE((SELECT public.fn_role_rank(ss.role)
              FROM public.store_staff ss
              WHERE ss.store_id = p_store_id AND ss.user_id = auth.uid() AND ss.is_active), 0),
    COALESCE((SELECT 4 FROM public.stores s
              WHERE s.id = p_store_id AND s.owner_id = auth.uid()), 0)
  );
$fn$;

COMMIT;
