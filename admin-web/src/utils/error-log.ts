/**
 * 前端错误集中上报（admin-web 端）
 * 统一经 client-error-log Edge Function 写入 error_logs 表，便于故障排查。
 * 自包含：直接 fetch，不依赖项目 supabase 单例；anon key 随端包发布，非机密。
 */
const SUPABASE_URL = 'https://pyqgsxcjmijtbstwthbn.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM'

export function reportError(err: unknown, ctx?: Record<string, unknown>): void {
  try {
    const message = typeof err === 'string' ? err : ((err as any)?.message ?? String(err))
    const stack = (err as any)?.stack
    const body = JSON.stringify({
      source: 'admin',
      level: 'error',
      message: String(message).slice(0, 4000),
      stack: stack ? String(stack).slice(0, 8000) : undefined,
      ctx: ctx ?? {},
    })
    fetch(`${SUPABASE_URL}/functions/v1/client-error-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
      body,
    }).catch(() => {})
  } catch {
    /* 上报失败静默 */
  }
}

/** 全局捕获：window.onerror + 未处理 Promise 拒绝。在 main.tsx 入口调用一次即可。 */
export function initGlobalErrorCapture(): void {
  try {
    if (typeof window !== 'undefined') {
      window.onerror = (msg, _src, _line, _col, err) => {
        reportError(err ?? msg, { phase: 'window.onerror' })
        return false
      }
      window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        reportError((e as any)?.reason, { phase: 'unhandledrejection' })
      })
    }
  } catch {
    /* 忽略 */
  }
}
