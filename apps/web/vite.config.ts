import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
