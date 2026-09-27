select $q$table$q$ as obj, count(*) as cnt from information_schema.tables where table_name = $q$llm_call_logs$q$
union all
select $q$fn_stats$q$, count(*) from pg_proc where proname = $q$fn_llm_usage_stats$q$
union all
select $q$fn_recent$q$, count(*) from pg_proc where proname = $q$fn_llm_recent_logs$q$;
