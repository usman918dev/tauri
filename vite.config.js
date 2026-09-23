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
      // These packages are Tauri-native and only resolve inside `tauri build`.
      // They are always guarded by isTauri() checks at runtime, so externalizing
      // them here lets plain `vite build` succeed without errors.
      external: [
        'ai',
        '@ai-sdk/react',
        '@tauri-apps/plugin-updater',
        '@tauri-apps/plugin-process',
      ],
    },
  },
})

