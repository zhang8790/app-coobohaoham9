DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.stores'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%store_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stores DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_store_type_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_store_type_check
  CHECK (store_type IS NULL OR store_type IN ('hub', 'transfer', 'truck', 'branch', 'self'));

INSERT INTO public.stores
  (owner_id, name, phone, address, category, store_type, is_active, rating, short_code)
SELECT
  a.user_id,
  a.store_name,
  a.contact_phone,
  a.address,
  '其他',
  'branch',
  true,
  0,
  public.generate_store_short_code()
FROM public.merchant_applications a
WHERE a.status = 'approved'
  AND a.store_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.owner_id = a.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.stores s2 WHERE s2.name = a.store_name
  );

INSERT INTO public.store_staff (store_id, user_id, role, is_active)
SELECT s.id, s.owner_id, 'owner', true
FROM public.stores s
WHERE s.owner_id IS NOT NULL
ON CONFLICT (store_id, user_id)
DO UPDATE SET role = EXCLUDED.role, is_active = true;

SELECT
  a.status                AS app_status,
  a.store_name            AS app_store_name,
  a.contact_phone         AS app_phone,
  (SELECT count(*) FROM public.stores s WHERE s.owner_id = a.user_id) AS my_store_count,
  (SELECT string_agg(s.name || '(' || coalesce(s.store_type,'NULL') || ',active=' || s.is_active || ')', ', ')
     FROM public.stores s WHERE s.owner_id = a.user_id)              AS my_stores,
  (SELECT count(*) FROM public.store_staff t WHERE t.user_id = a.user_id AND t.is_active) AS staff_rows
FROM public.merchant_applications a
ORDER BY a.created_at DESC;
