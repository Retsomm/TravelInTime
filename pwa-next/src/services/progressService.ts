// Service 層：純函式，資料模型 + local/remote CRUD + merge，不 import React/TanStack Query。
// 這支是 Phase 0 的垂直切片示範，之後 bookService/bookmarkService/annotationService 會照同樣形狀補上。
import { progressKey } from '@/constants/storageKeys'
import { apiClient } from '@/clients/apiClient'
import { enqueue } from './syncQueue'
import { getSyncEnabled } from './syncGate'

export interface Progress {
  bookId: string
  cfi: string
  updatedAt: number
}

// 主要的 progressKey 維持存純字串 CFI（跟舊版 useLibrary.ts 的 loadProgress/saveProgress 相容，
// 那兩個函式在 App.tsx 的登入補推流程還在用，這次不動它們）。updatedAt 另外存一把 companion key，
// 舊資料沒有這把 key 時視為「時間戳未知」，merge 時一律讓有時間戳的一方（通常是雲端）勝出。
const updatedAtKey = (bookId: string) => `${progressKey(bookId)}:updatedAt`

const local = {
  load: (bookId: string): Progress | null => {
    const cfi = localStorage.getItem(progressKey(bookId))
    if (cfi === null) return null
    const rawUpdatedAt = localStorage.getItem(updatedAtKey(bookId))
    const updatedAt = rawUpdatedAt ? Number(rawUpdatedAt) : 0
    return { bookId, cfi, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 }
  },
  save: (bookId: string, cfi: string, updatedAt: number = Date.now()): Progress => {
    localStorage.setItem(progressKey(bookId), cfi)
    localStorage.setItem(updatedAtKey(bookId), String(updatedAt))
    return { bookId, cfi, updatedAt }
  },
}

interface RemoteProgressResponse {
  progress: { cfi: string; updatedAt: string } | null
}

const remote = {
  fetch: (bookId: string): Promise<Progress | null> =>
    apiClient
      .get<RemoteProgressResponse>(`/api/books/${bookId}/progress`)
      .then((res) =>
        res.progress
          ? { bookId, cfi: res.progress.cfi, updatedAt: new Date(res.progress.updatedAt).getTime() }
          : null,
      )
      .catch(() => null),

  pushNow: (bookId: string, cfi: string): Promise<boolean> => {
    if (!getSyncEnabled()) return Promise.resolve(false)
    return enqueue(bookId, () =>
      apiClient
        .put(`/api/books/${bookId}/progress`, { cfi })
        .then(() => true)
        .catch(() => false),
    )
  },
}

// ── 高頻熱路徑（每次翻頁）的 debounce ────────────────────────────────────
// 本機 localStorage 是每次翻頁立即寫（見 local.save 的呼叫端），只有「打去伺服器」這件事
// debounce，避免翻頁很快時打出一長串網路請求。頁面/App 離開前要呼叫 flush()/flushAll()
// 強制送出最後一次，不然關閉分頁時最後幾次翻頁的進度只會停留在本機、還沒推上雲端
//（本機資料不會丟，只是雲端會落後，下次連線時的 restore 流程會補上）。
const DEBOUNCE_MS = 1400
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingCfi = new Map<string, string>()

const pushDebounced = (bookId: string, cfi: string) => {
  pendingCfi.set(bookId, cfi)
  const existing = debounceTimers.get(bookId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    debounceTimers.delete(bookId)
    const latest = pendingCfi.get(bookId)
    pendingCfi.delete(bookId)
    if (latest) remote.pushNow(bookId, latest)
  }, DEBOUNCE_MS)
  debounceTimers.set(bookId, timer)
}

const flush = (bookId: string) => {
  const existing = debounceTimers.get(bookId)
  if (existing) clearTimeout(existing)
  debounceTimers.delete(bookId)
  const latest = pendingCfi.get(bookId)
  pendingCfi.delete(bookId)
  if (latest) remote.pushNow(bookId, latest)
}

const flushAll = () => {
  for (const bookId of [...pendingCfi.keys()]) flush(bookId)
}

const merge = (localProgress: Progress | null, remoteProgress: Progress | null): Progress | null => {
  if (!localProgress) return remoteProgress
  if (!remoteProgress) return localProgress
  return remoteProgress.updatedAt > localProgress.updatedAt ? remoteProgress : localProgress
}

export const progressService = { local, remote, pushDebounced, flush, flushAll, merge }
