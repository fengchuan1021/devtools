import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://192.168.1.234:8080',
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: 'http://192.168.1.234:8080',
        ws: true,
      },
      '/screenlink': {
        target: 'http://192.168.1.234:8080',
        ws: true,
      },
    },
  },
})
