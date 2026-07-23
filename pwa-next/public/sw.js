// 手寫的極簡 service worker：網路優先，離線時退回快取，導覽請求最後退回 App shell（'/'）。
// 沒有預先快取整個建置產物的清單（那需要 build 時產生 manifest，例如 next-pwa/serwist 才做得到），
// 這裡的策略是「使用者連線時造訪過的頁面/資源會被存進快取，離線時如果剛好造訪過同一個資源就能用」。
// 書本內容、進度、書籤、註記本來就是存在 IndexedDB/localStorage，不受這個快取策略影響。

const CACHE_NAME = 'travel-in-time-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // /api/ 回應可能帶有登入使用者的私人資料，不進快取，也不做離線退回，
  // 避免不同使用者或未登入狀態的裝置從 Cache Storage 讀到別人的資料。
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/'))),
  )
})
