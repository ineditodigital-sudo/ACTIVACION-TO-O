import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    host: true, // Permite acceso desde otros dispositivos (celulares/tablets)
    allowedHosts: true, // Permite cualquier túnel durante las pruebas
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
})
