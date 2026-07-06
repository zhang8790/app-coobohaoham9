-- 检查并创建 marketing_campaigns 表（如果不存在）
-- 执行前请先在 Supabase Dashboard 中运行 SELECT * FROM marketing_campaigns LIMIT 1; 检查表是否存在

-- 如果表不存在，创建它
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id SERIAL PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'redpacket',  -- redpacket:现金红包, physical:实物礼品
  gift_name TEXT,  -- 礼品名称（现金红包时为"现金红包"）
  gift_value NUMERIC(10,2) NOT NULL,  -- 红包金额或礼品价值
  total_limit INTEGER NOT NULL,  -- 发放总数
  daily_limit INTEGER DEFAULT 10,  -- 每日限领
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  claimed_count INTEGER DEFAULT 0,  -- 已领取数量
  commission_rate NUMERIC(5,2) DEFAULT 0.1,  -- 推广佣金比例
  status TEXT DEFAULT 'active',  -- active, paused, ended
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 如果表已存在，检查并添加缺失的字段
DO $$
BEGIN
  -- 检查 campaign_type 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'campaign_type'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN campaign_type TEXT DEFAULT 'redpacket';
    COMMENT ON COLUMN public.marketing_campaigns.campaign_type IS '活动类型：redpacket=现金红包, physical=实物礼品';
  END IF;

  -- 检查 gift_name 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'gift_name'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN gift_name TEXT;
    COMMENT ON COLUMN public.marketing_campaigns.gift_name IS '礼品名称（现金红包时为"现金红包"）';
  END IF;

  -- 检查 gift_value 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'gift_value'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN gift_value NUMERIC(10,2) NOT NULL DEFAULT 0;
    COMMENT ON COLUMN public.marketing_campaigns.gift_value IS '红包金额或礼品价值';
  END IF;

  -- 检查 commission_rate 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'commission_rate'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN commission_rate NUMERIC(5,2) DEFAULT 0.1;
    COMMENT ON COLUMN public.marketing_campaigns.commission_rate IS '推广佣金比例（0.1表示10%）';
  END IF;

  -- 检查 claimed_count 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'claimed_count'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN claimed_count INTEGER DEFAULT 0;
    COMMENT ON COLUMN public.marketing_campaigns.claimed_count IS '已领取数量';
  END IF;

END $$;

-- 添加表注释
COMMENT ON TABLE public.marketing_campaigns IS '营销活动表（红包/实物礼品）';

-- 添加 RLS 策略（如果不存在）
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

-- 删除已有的策略（如果有）
DROP POLICY IF EXISTS "Merchants can manage own campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Users can view active campaigns" ON public.marketing_campaigns;

-- 商家可以管理自己的活动
CREATE POLICY "Merchants can manage own campaigns" ON public.marketing_campaigns
  FOR ALL USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- 用户可以查看活跃的活动
CREATE POLICY "Users can view active campaigns" ON public.marketing_campaigns
  FOR SELECT USING (status = 'active');

-- 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_store_id ON public.marketing_campaigns(store_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_start_date ON public.marketing_campaigns(start_date);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_end_date ON public.marketing_campaigns(end_date);
