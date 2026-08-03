/**
 * 前端错误集中上报（小程序端）
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
      source: 'mini_app',
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

/** 全局捕获：微信运行时错误 + 未处理 Promise 拒绝。在 app.tsx 入口调用一次即可。 */
export function initGlobalErrorCapture(): void {
  try {
    const g = globalThis as any
    if (g.wx?.onError) {
      g.wx.onError((e: any) => reportError(e, { phase: 'wx.onError' }))
    }
    if (g.wx?.onUnhandledRejection) {
      g.wx.onUnhandledRejection((e: any) => reportError(e?.reason ?? e, { phase: 'unhandledrejection' }))
    }
  } catch {
    /* 平台不支持则忽略 */
  }
}
