import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // 相对 base：构建产物(dist)可经任意静态服务器/子路径打开，
  // 避免默认绝对路径(/assets/...)在 file:// 或子目录部署下白屏。
  base: './',
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
})
