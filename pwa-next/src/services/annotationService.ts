// Service 層：註記（劃線＋筆記）的本機/遠端 CRUD + tombstone log + merge，
// 取代原本 store/useAnnotationStore.ts 身兼「Zustand store」跟「持久化」的雙重角色——
// 這裡只管資料，不 import React/Zustand/TanStack Query。
import { apiClient } from '@/clients/apiClient'
import { enqueue } from './syncQueue'
import { getSyncEnabled } from './syncGate'

export interface Annotation {
  id: string
  cfi: string
  text: string
  color: string
  chapter: string
  createdAt: number
  updatedAt: number
  note?: string
}

const annotationsKey = (bookId: string) => `tit-annotations-${bookId}`
// 理由同 bookmarkService.ts：本機刪除只是從主清單移除是不夠的，需要額外的刪除紀錄
// 才能在下次跨裝置合併時正確地讓已刪除的註記維持刪除狀態，而不是被雲端舊資料復活。
const deletedKey = (bookId: string) => `${annotationsKey(bookId)}:deleted`

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const local = {
  load: (bookId: string): Annotation[] => readJson<Annotation[]>(annotationsKey(bookId), []),
  save: (bookId: string, annotations: Annotation[]) => {
    localStorage.setItem(annotationsKey(bookId), JSON.stringify(annotations))
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

interface RemoteAnnotation {
  id: string
  cfi: string
  text: string
  note: string
  color: string
  chapter: string
  createdAt: string
  updatedAt: string
}

const toLocalAnnotation = (a: RemoteAnnotation): Annotation => ({
  id: a.id,
  cfi: a.cfi,
  text: a.text,
  note: a.note || undefined,
  color: a.color,
  chapter: a.chapter,
  createdAt: new Date(a.createdAt).getTime(),
  updatedAt: new Date(a.updatedAt).getTime(),
})

const remote = {
  fetch: (bookId: string): Promise<Annotation[] | null> =>
    apiClient
      .get<{ annotations: RemoteAnnotation[] }>(`/api/books/${bookId}/annotations`)
      .then((res) => res.annotations.map(toLocalAnnotation))
      .catch(() => null),

  push: (bookId: string, upserts: Annotation[], deletedIds: string[]): Promise<boolean> => {
    if (!getSyncEnabled()) return Promise.resolve(false)
    if (upserts.length === 0 && deletedIds.length === 0) return Promise.resolve(true)
    return enqueue(bookId, () =>
      apiClient
        .put(`/api/books/${bookId}/annotations`, { upserts, deletedIds })
        .then(() => true)
        .catch(() => false),
    )
  },
}

// 劃線/加筆記/改顏色/刪除都是使用者手動觸發的低頻寫入，不需要 debounce，
// 每次異動後直接推送目前完整清單 + 待處理的刪除紀錄。
const pushNow = async (bookId: string): Promise<boolean> => {
  const annotations = local.load(bookId)
  const deletedIds = Object.keys(local.loadDeletedIds(bookId))
  const ok = await remote.push(bookId, annotations, deletedIds)
  if (ok && deletedIds.length > 0) local.clearDeletedIds(bookId, deletedIds)
  return ok
}

// LWW union-merge，理由同 bookmarkService.ts：本機尚未推送成功的刪除紀錄優先於雲端資料。
const merge = (localAnnotations: Annotation[], remoteAnnotations: Annotation[], localDeletedIds: Set<string>): Annotation[] => {
  const byId = new Map<string, Annotation>()
  for (const a of remoteAnnotations) if (!localDeletedIds.has(a.id)) byId.set(a.id, a)
  for (const a of localAnnotations) {
    if (localDeletedIds.has(a.id)) continue
    const existing = byId.get(a.id)
    if (!existing || a.updatedAt >= existing.updatedAt) byId.set(a.id, a)
  }
  return [...byId.values()]
}

// 開書時呼叫：跟雲端合併「這一本書」的註記，讓其他裝置新增/刪除的東西補進來。
// 登入時的 useCloudRestoreMutation 是「整個書庫」層級、一個瀏覽器分頁只觸發一次的還原，
// 沒辦法涵蓋「A 裝置剛新增、B 裝置這個分頁早就登入過，只是現在才重新打開這本書」的情境
// ——這種情境只有「打開這本書的當下」才是自然、划算的時機去查一次雲端有沒有新東西。
// 離線/未登入/請求失敗時 remote.fetch 回傳 null，直接沿用本機資料，不阻塞開書流程。
const restoreForBook = async (bookId: string): Promise<Annotation[]> => {
  const remoteAnnotations = await remote.fetch(bookId)
  if (remoteAnnotations === null) return local.load(bookId)
  const localDeletedIds = new Set(Object.keys(local.loadDeletedIds(bookId)))
  const merged = merge(local.load(bookId), remoteAnnotations, localDeletedIds)
  local.save(bookId, merged)
  return merged
}

export const annotationService = { local, remote, pushNow, merge, restoreForBook }
