import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '::', // IPv6 双栈监听（同时兼容 IPv4-mapped）
    port: 5173,
    proxy: {
      // 前后端分离：开发期由 Vite 代理到独立的后端 API 服务
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
})
