import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    host: true,        // equivale a 0.0.0.0
    port: 5353,
    allowedHosts: ['booking.dappointment.com']
  } 
})