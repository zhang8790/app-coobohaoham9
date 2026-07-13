-- =====================================================
-- 00076: 新建 gold_bean_logs（金豆流水表）
-- -----------------------------------------------------
-- 背景：
--   - 金豆（消费积分，1:1 抵扣）此前只有 profiles.gold_beans 余额，
--     没有任何逐笔流水表。资产流水中心只有「积分 / 情绪豆 / 佣金」三张，
--     缺金豆这张，导致「越来越详细的财务数据表」不完整。
--   - 金豆生命周期事件（已在小程序确认）：
--       · purchase_spend  下单消费抵扣（余额减少）
--       · refund_return   订单退款返还（余额增加）
--       · recharge        金豆充值（余额增加，预留）
--       · admin_grant     后台发放（余额增加，预留）
--       · admin_deduct    后台扣减（余额减少，预留）
--   - 结构照 points_logs（00003）建，delta / balance_after 用 int
--     （profiles.gold_beans 为 INTEGER，见 00030）。
--   - 测试期关闭 RLS（与 points_logs 在 00075、commissions 在 00015、
--     emotion_* 在 00053/00072 同口径），admin-web(anon key) 才能直读。
--   安全提示（生产环境）：
--     测试期关闭 RLS 是项目既定模式。上线前应改为
--     「仅 service_role / admin 角色可读全部」的 policy。
-- =====================================================

-- 1) 建表
CREATE TABLE IF NOT EXISTS public.gold_bean_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  order_id uuid REFERENCES public.orders(id),
  type text NOT NULL
    CHECK (type IN ('purchase_spend','refund_return','recharge','admin_grant','admin_deduct')),
  delta int NOT NULL,             -- 正=增加，负=减少
  balance_after int NOT NULL,     -- 变动后余额（冗余，方便对账）
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) 索引
CREATE INDEX IF NOT EXISTS idx_gold_bean_logs_user ON public.gold_bean_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_gold_bean_logs_order ON public.gold_bean_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_gold_bean_logs_created ON public.gold_bean_logs(created_at DESC);

-- 3) 测试期关闭 RLS（与 00075 同口径）
ALTER TABLE public.gold_bean_logs DISABLE ROW LEVEL SECURITY;

-- 4) 补齐客户端角色权限（anon=未登录只读；authenticated=已登录；service_role=后台写入）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gold_bean_logs TO anon, authenticated, service_role;
