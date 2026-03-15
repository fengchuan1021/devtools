import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/images/dev/' : '/',
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://192.168.1.234:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://192.168.1.234:8080',
        ws: true,
      },
    },
  },
})
