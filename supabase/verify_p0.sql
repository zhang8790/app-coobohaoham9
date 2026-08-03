SELECT
  (SELECT value FROM public.system_flags WHERE key='trigger_logs_enabled') AS flag,
  (SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_diag_log')::text) AS fn_diag_log,
  (SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_cleanup_trigger_logs')::text) AS cleanup_fn,
  (SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname='cleanup_trigger_logs')::text) AS cron_job,
  (SELECT count(*)::text FROM pg_indexes WHERE indexname='idx_products_store_active_created') AS idx_products,
  (SELECT count(*)::text FROM pg_indexes WHERE indexname='idx_orders_store_status_created') AS idx_orders_store,
  (SELECT count(*)::text FROM pg_indexes WHERE indexname='idx_orders_user_status_created') AS idx_orders_user,
  (SELECT count(*)::text FROM pg_indexes WHERE indexname='idx_orders_commission_distributed') AS idx_orders_comm,
  (SELECT count(*)::text FROM pg_indexes WHERE indexname='idx_profiles_referrer') AS idx_profiles_ref,
  (SELECT count(*)::text FROM pg_indexes WHERE indexname='idx_trigger_logs_created') AS idx_tl_created,
  (SELECT count(*)::text FROM public.trigger_logs) AS tl_rows;
