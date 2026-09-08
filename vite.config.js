import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-i18next', 'i18next'],
  },
  build: {
    rollupOptions: {
      external: ['ai', '@ai-sdk/react'],
    },
  },
})
