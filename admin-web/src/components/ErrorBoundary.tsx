import React from 'react'

/**
 * admin-web 全局错误边界：渲染期异常不再整页白屏，
 * 显示可读错误 + 刷新提示，并上报到 error_logs（便于故障排查）。
 */
export class ErrorBoundary extends React.Component<
  { children?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: any, info: any) {
    import('../utils/error-log')
      .then((m) => m.reportError(error, { phase: 'ErrorBoundary', componentStack: (info as any)?.componentStack }))
      .catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
          页面出现异常，已自动上报，请刷新重试。
        </div>
      )
    }
    return this.props.children
  }
}
