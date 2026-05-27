import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/scratch-off/',
  server: {
    proxy: {
      '/api/': 'http://localhost:8096',
      '/admin/': 'http://localhost:8096',
    }
  },
})
