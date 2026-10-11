import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The phone-call step talks to the want-it Next.js backend (Dial calls). Run `pnpm dev` in the repo root.
    proxy: { '/api': process.env.API_BASE ?? 'http://localhost:3000' },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
