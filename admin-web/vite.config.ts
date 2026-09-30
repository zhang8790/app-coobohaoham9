import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // 必须用绝对 base '/'。
  // 曾用 './'（相对）导致严重线上事故：SPA 深链/刷新页面时（如 /merchant/barcode-maker），
  // 浏览器把 '/merchant/' 当目录，把 './assets/x.js' 解析为 '/merchant/assets/x.js'；
  // 该路径不存在，又被 nginx `try_files ... /index.html` 兜底成 HTML 返回，
  // 浏览器把 HTML 当 JS 解析 → 静默失败 → 整页白屏（且无任何报错提示）。
  base: '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: true,        // 绑定 0.0.0.0，保证预览面板/容器可达
    port: 5173,
    strictPort: false, // 端口被占用时自动顺延，避免启动即崩
  },
  preview: {
    host: true,        // vite preview 同样对外可达
    port: 4173,
    strictPort: false,
  },
  build: {
    // 单包体积告警阈值：路由分割后应无 chunk 触顶，留 700KB 作回归预警
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // 第三方依赖单独成块：
        // 1) 与业务代码并行下载（HTTP/1.1 下尤其明显）
        // 2) 业务改动不会让 react/supabase 的 30 天强缓存失效
        // 注：Vite 8 的 manualChunks 只接受函数形式（对象形式类型不通过）
        manualChunks(id: string) {
          const n = id.replace(/\\/g, '/')
          if (!n.includes('node_modules')) return
          if (n.includes('/@supabase/')) return 'vendor-supabase'
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(n)) {
            return 'vendor-react'
          }
          return 'vendor-misc'
        },
      },
    },
  },
})
