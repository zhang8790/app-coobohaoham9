// 运行时配置占位（部署期由 deploy-admin-web.sh 覆写为真实端点）。
// 本地开发 / 未注入时保持为空，前端自动回退到构建期 VITE_ 环境变量。
// 切勿在此写入真实密钥 —— 该文件会被提交且随产物分发。
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {}
