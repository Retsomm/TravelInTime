import { useState } from 'react'
import ePub from 'epubjs'

export interface BookRecord {
  id: string
  title: string
  author: string
  filename: string
  addedAt: number
  lastOpenedAt: number
  hasCover: boolean
  progress?: number
}

const META_KEY = 'tit-library'
const DB_NAME = 'tit-books'
const DB_VERSION = 1

// ── IndexedDB helpers ──────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null

const openDB = (): Promise<IDBDatabase> => {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('files')
      req.result.createObjectStore('covers')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      _dbPromise = null
      reject(req.error)
    }
  })
  return _dbPromise
}

const idbGet = <T>(store: string, key: string): Promise<T | null> =>
  openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key)
        req.onsuccess = () => resolve((req.result as T) ?? null)
        req.onerror = () => reject(req.error)
      }),
  )

const idbPut = (store: string, key: string, value: unknown): Promise<void> =>
  openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )

const idbDelete = (store: string, key: string): Promise<void> =>
  openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )

// ── LocalStorage helpers ───────────────────────────────────────────────

const loadMeta = (): BookRecord[] => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '[]')
  } catch {
    return []
  }
}

const saveMeta = (records: BookRecord[]) =>
  localStorage.setItem(META_KEY, JSON.stringify(records))

// ── Epub metadata extraction (best-effort, with timeout) ───────────────

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

const extractMeta = (
  buffer: ArrayBuffer,
  filename: string,
): Promise<{ title: string; author: string; coverDataUrl: string | null }> => {
  const fallback = { title: filename.replace(/\.epub$/i, ''), author: '', coverDataUrl: null }

  const work = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const book = ePub(buffer.slice(0)) as any
    await book.ready
    const pkg = book.package?.metadata
    const title = (pkg?.title as string | undefined)?.trim() || fallback.title
    const author = (pkg?.creator as string | undefined)?.trim() || ''

    let coverDataUrl: string | null = null
    try {
      const coverUrl: string | null = await book.coverUrl()
      if (coverUrl) {
        const blob = await fetch(coverUrl).then((r) => r.blob())
        coverDataUrl = await blobToDataUrl(blob)
        URL.revokeObjectURL(coverUrl)
      }
    } catch { /* 無封面 */ }

    book.destroy()
    return { title, author, coverDataUrl }
  }

  // 10 秒 timeout，避免 book.ready 永久 pending 導致 addBook 卡住
  const timeout = new Promise<typeof fallback>((resolve) =>
    setTimeout(() => resolve(fallback), 10_000),
  )

  return Promise.race([work().catch(() => fallback), timeout])
}

// ── Reading progress ───────────────────────────────────────────────────

const progressKey = (bookId: string) => `tit-progress-${bookId}`

export const saveProgress = (bookId: string, cfi: string) =>
  localStorage.setItem(progressKey(bookId), cfi)

export const loadProgress = (bookId: string): string | null =>
  localStorage.getItem(progressKey(bookId))

// ── Book settings ──────────────────────────────────────────────────────

export interface BookSettings {
  fontSize: number
  fontFamily: string
  script: 'tc' | 'sc'
  lineHeight: number
  letterSpacing: number
  readingDirection: 'ltr' | 'rtl'
}

const settingsKey = (bookId: string) => `tit-settings-${bookId}`

export const saveBookSettings = (bookId: string, settings: BookSettings) =>
  localStorage.setItem(settingsKey(bookId), JSON.stringify(settings))

export const loadBookSettings = (bookId: string): BookSettings | null => {
  try {
    const raw = localStorage.getItem(settingsKey(bookId))
    return raw ? (JSON.parse(raw) as BookSettings) : null
  } catch {
    return null
  }
}

// ── Hook ───────────────────────────────────────────────────────────────

export const useLibrary = () => {
  const [records, setRecords] = useState<BookRecord[]>(loadMeta)

  const addBook = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const id = crypto.randomUUID()

    // 1. 立刻存入 IndexedDB（確保可開啟）
    await idbPut('files', id, buffer)

    // 2. 以檔名為標題，立刻寫入書庫（不等 metadata）
    const initial: BookRecord = {
      id,
      title: file.name.replace(/\.epub$/i, ''),
      author: '',
      filename: file.name,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      hasCover: false,
    }
    setRecords((prev) => {
      const next = [initial, ...prev]
      saveMeta(next)
      return next
    })

    // 3. 背景提取 metadata 後更新（不阻塞開書流程）
    extractMeta(buffer, file.name).then(({ title, author, coverDataUrl }) => {
      if (coverDataUrl) idbPut('covers', id, coverDataUrl)
      setRecords((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, title, author, hasCover: !!coverDataUrl } : r,
        )
        saveMeta(next)
        return next
      })
    })

    return id
  }

  const getBookUrl = async (id: string): Promise<string | null> => {
    const buffer = await idbGet<ArrayBuffer>('files', id)
    if (!buffer) return null
    return URL.createObjectURL(new Blob([buffer], { type: 'application/epub+zip' }))
  }

  const getCoverDataUrl = (id: string): Promise<string | null> =>
    idbGet<string>('covers', id)

  const removeBook = async (id: string) => {
    await idbDelete('files', id)
    await idbDelete('covers', id)
    localStorage.removeItem(progressKey(id))
    localStorage.removeItem(settingsKey(id))
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id)
      saveMeta(next)
      return next
    })
  }

  const touchBook = (id: string) => {
    setRecords((prev) => {
      const next = prev.map((r) =>
        r.id === id ? { ...r, lastOpenedAt: Date.now() } : r,
      )
      saveMeta(next)
      return next
    })
  }

  const updateProgress = (id: string, pct: number) => {
    setRecords((prev) => {
      const next = prev.map((r) =>
        r.id === id ? { ...r, progress: Math.max(0, Math.min(1, pct)) } : r,
      )
      saveMeta(next)
      return next
    })
  }

  return { records, addBook, getBookUrl, getCoverDataUrl, removeBook, touchBook, updateProgress }
}
