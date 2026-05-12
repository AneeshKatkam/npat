import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, '.'),
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
