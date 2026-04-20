import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/vosk-models': {
        target: 'https://alphacephei.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vosk-models/, '/vosk/models'),
      },
    },
  },
})