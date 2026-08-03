-- 打印机配置表（云打印对接：飞鹅 / 易联云 / 365）
-- 用于门店订单小票自动打印。凭证敏感，读写走 admin-web 受控后台，
-- RLS 复用 food 库的受控后台宽松模式（应用层按 store 过滤）。
-- Edge Function print-receipt 用 service_role 读取，不在前端暴露明文 key。

CREATE TABLE IF NOT EXISTS public.printer_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'feie' CHECK (provider IN ('feie', 'yilianyun', '365')),
  device_sn TEXT NOT NULL,                 -- 打印机设备编号 / 机器码
  api_user TEXT,                           -- 飞鹅 user / 易联云 client_id
  api_key TEXT,                            -- 飞鹅 UKEY / 易联云 client_secret
  printer_key TEXT,                        -- 飞鹅打印机密钥（可选，部分机型需要）
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_print_on_paid BOOLEAN NOT NULL DEFAULT false,  -- 订单完成/已支付后自动打印
  print_count INTEGER NOT NULL DEFAULT 0,
  last_print_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, device_sn)
);

CREATE INDEX IF NOT EXISTS idx_printer_configs_store
  ON public.printer_configs(store_id);

ALTER TABLE public.printer_configs ENABLE ROW LEVEL SECURITY;

-- 复用受控后台宽松 RLS（与 food 库一致）：admin-web 登录态由 JWT 保证，
-- 应用层按当前商家 store 过滤，密钥不在前端明文回显（掩码展示）。
DROP POLICY IF EXISTS pc_all ON public.printer_configs;
CREATE POLICY pc_all ON public.printer_configs
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.printer_configs IS '门店云打印机配置（飞鹅/易联云），用于订单小票自动打印';
COMMENT ON COLUMN public.printer_configs.auto_print_on_paid IS '订单确认完成(已支付/已结算)后是否自动推送小票到打印机';
