import { defineConfig } from 'vite'

export default defineConfig({
  base: '/AirFighter/',
  server: {
    host: true,
    hmr: false,
    allowedHosts: true,
    cors: true,
    headers: {
      'Bypass-Tunnel-Reminder': '1',
    },
  },
})
