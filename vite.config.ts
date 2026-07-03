import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.CF_PAGES === '1' ? '/' : '/alarm-schedule/',
  plugins: [react()],
})
