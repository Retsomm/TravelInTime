import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({
      include: /\.[jt]sx?$/,
      plugins: [['babel-plugin-react-compiler', { target: '18' }]],
    }),
  ],
  base: './',
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('epubjs')) return 'epubjs'
          if (id.includes('opencc-js')) return 'opencc'
          if (id.includes('react') || id.includes('zustand')) return 'vendor'
        },
      },
    },
  },
})
