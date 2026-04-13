import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', { target: '18' }]],
      },
    }),
  ],
  base: './',
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          epubjs: ['epubjs'],
          opencc: ['opencc-js'],
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
