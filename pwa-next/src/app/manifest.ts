import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Travel in Time',
    short_name: 'TravelInTime',
    description: '一款沉靜式 ePub 閱讀器，支援離線使用',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#fafaf9',
    theme_color: '#1c1917',
    icons: [
      { src: '/logo.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
