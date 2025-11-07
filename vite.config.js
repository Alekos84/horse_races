import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        reset: resolve(__dirname, 'reset-password.html')
      },
      output: {
        manualChunks: undefined
      }
    }
  }
})
