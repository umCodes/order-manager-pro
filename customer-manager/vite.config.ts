import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
    allowedHosts: ['.ngrok-free.app'],
  },
  preview: {
    host: true,
    allowedHosts: ['.ngrok-free.app'],
  },
  plugins: [react()],
})
