-- 00059 PIPL 合规：隐私政策同意时间留痕
-- profiles 增加 privacy_consented_at，记录用户同意《隐私政策》的时间，供合规审计。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_consented_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.privacy_consented_at
  IS '用户同意《隐私政策》的时间；null 表示尚未同意（PIPL 合规审计留痕）';
