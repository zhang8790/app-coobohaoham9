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
