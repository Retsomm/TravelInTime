'use client'

import { useEffect } from 'react'

// 只在正式環境註冊，避免 dev 模式下 service worker 快取住開發用的資源，
// 導致 yarn dev 熱更新後畫面還是舊的（這是這類設定常見的坑）。
const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] Service Worker 註冊失敗:', err)
    })
  }, [])

  return null
}

export default ServiceWorkerRegister
