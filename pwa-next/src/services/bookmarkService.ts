// Service 層：書籤的本機/遠端 CRUD + tombstone log + merge，不 import React/TanStack Query。
import { bookmarksKey } from '@/constants/storageKeys'
import { apiClient } from '@/clients/apiClient'
import { enqueue } from './syncQueue'
import { getSyncEnabled } from './syncGate'

export interface Bookmark {
  id: string
  cfi: string
  label: string
  addedAt: number
  updatedAt: number
}

// 刪除紀錄（tombstone）跟主清單分開存一把 key：本機刪除書籤時，只是單純從主清單陣列移除
// 是不夠的——沒有任何紀錄可以告訴伺服器「這筆曾經存在、現在要刪掉」，下次從雲端 GET 回來
// 合併時，這筆舊資料就會被當成「雲端有、本機沒有」而復活。這裡额外記一份「id → 刪除時間」，
// push 時把這批 id 當 deletedIds 送給後端做軟刪除，成功後才從這份紀錄裡清掉。
const deletedKey = (bookId: string) => `${bookmarksKey(bookId)}:deleted`

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const local = {
  load: (bookId: string): Bookmark[] => readJson<Bookmark[]>(bookmarksKey(bookId), []),
  save: (bookId: string, bookmarks: Bookmark[]) => {
    localStorage.setItem(bookmarksKey(bookId), JSON.stringify(bookmarks))
  },
  loadDeletedIds: (bookId: string): Record<string, number> => readJson<Record<string, number>>(deletedKey(bookId), {}),
  recordDeleted: (bookId: string, id: string) => {
    const deleted = local.loadDeletedIds(bookId)
    deleted[id] = Date.now()
    localStorage.setItem(deletedKey(bookId), JSON.stringify(deleted))
  },
  clearDeletedIds: (bookId: string, ids: string[]) => {
    const deleted = local.loadDeletedIds(bookId)
    for (const id of ids) delete deleted[id]
    localStorage.setItem(deletedKey(bookId), JSON.stringify(deleted))
  },
}

interface RemoteBookmark {
  id: string
  cfi: string
  label: string
  addedAt: string
  updatedAt: string | null
}

const toLocalBookmark = (b: RemoteBookmark): Bookmark => ({
  id: b.id,
  cfi: b.cfi,
  label: b.label,
  addedAt: new Date(b.addedAt).getTime(),
  updatedAt: b.updatedAt ? new Date(b.updatedAt).getTime() : 0,
})

const remote = {
  fetch: (bookId: string): Promise<Bookmark[] | null> =>
    apiClient
      .get<{ bookmarks: RemoteBookmark[] }>(`/api/books/${bookId}/bookmarks`)
      .then((res) => res.bookmarks.map(toLocalBookmark))
      .catch(() => null),

  push: (bookId: string, upserts: Bookmark[], deletedIds: string[]): Promise<boolean> => {
    if (!getSyncEnabled()) return Promise.resolve(false)
    if (upserts.length === 0 && deletedIds.length === 0) return Promise.resolve(true)
    return enqueue(bookId, () =>
      apiClient
        .put(`/api/books/${bookId}/bookmarks`, { upserts, deletedIds })
        .then(() => true)
        .catch(() => false),
    )
  },
}

// 書籤是使用者手動點擊觸發的低頻寫入（不像翻頁存進度那樣高頻），不需要 debounce，
// 每次異動後直接推送目前完整清單 + 待處理的刪除紀錄；共用 syncQueue 的 per-bookId 佇列，
// 確保跟同一本書的 book/progress/annotations 寫入照順序送達。
const pushNow = async (bookId: string): Promise<boolean> => {
  const bookmarks = local.load(bookId)
  const deletedIds = Object.keys(local.loadDeletedIds(bookId))
  const ok = await remote.push(bookId, bookmarks, deletedIds)
  if (ok && deletedIds.length > 0) local.clearDeletedIds(bookId, deletedIds)
  return ok
}

// LWW union-merge：以 id 為鍵合併本機跟雲端書籤，updatedAt 較新的勝出。本機尚未推送成功的
// 刪除紀錄（tombstone）優先於雲端資料——不管雲端那筆 updatedAt 多新，只要本機標記為已刪除
// 就不該復活，它很可能就是雲端還沒反映到的那次刪除操作本身。
const merge = (localBookmarks: Bookmark[], remoteBookmarks: Bookmark[], localDeletedIds: Set<string>): Bookmark[] => {
  const byId = new Map<string, Bookmark>()
  for (const b of remoteBookmarks) if (!localDeletedIds.has(b.id)) byId.set(b.id, b)
  for (const b of localBookmarks) {
    if (localDeletedIds.has(b.id)) continue
    const existing = byId.get(b.id)
    if (!existing || b.updatedAt >= existing.updatedAt) byId.set(b.id, b)
  }
  return [...byId.values()]
}

// 開書時呼叫：跟雲端合併「這一本書」的書籤，理由同 annotationService.ts 的 restoreForBook——
// 登入時的整書庫還原一個分頁只觸發一次，涵蓋不到「另一裝置剛新增、這個分頁早就登入過」
// 的情境，只有打開這本書的當下才是自然的時機重新查一次雲端。離線/未登入/請求失敗時
// remote.fetch 回傳 null，直接沿用本機資料，不阻塞開書流程。
const restoreForBook = async (bookId: string): Promise<Bookmark[]> => {
  const remoteBookmarks = await remote.fetch(bookId)
  if (remoteBookmarks === null) return local.load(bookId)
  const localDeletedIds = new Set(Object.keys(local.loadDeletedIds(bookId)))
  const merged = merge(local.load(bookId), remoteBookmarks, localDeletedIds)
  local.save(bookId, merged)
  return merged
}

export const bookmarkService = { local, remote, pushNow, merge, restoreForBook }
