import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api/ksef': {
        target: 'https://api.ksef.mf.gov.pl/v2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ksef/, ''),
        secure: false,
      },
    },
  },
})
