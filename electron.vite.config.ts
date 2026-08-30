import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      sourcemap: true,
    },
  },
  preload: {
    build: {
      sourcemap: true,
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': '/src/shared',
        '@renderer': '/src/renderer/src',
      },
    },
    build: {
      sourcemap: true,
    },
  },
})
