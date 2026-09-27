select function_name, module, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, success, created_at
from public.llm_call_logs
order by created_at desc
limit 5;
