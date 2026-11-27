import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        word: resolve(import.meta.dirname, 'word/taskpane.html'),
      },
    },
  },
})
