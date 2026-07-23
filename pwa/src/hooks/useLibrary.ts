import { useState } from 'react'
import { META_KEY, bookmarksKey, progressKey, settingsKey } from '@/constants/storageKeys'
import { idbGet, idbPut, idbDelete } from '@/utils/indexedDb'
import { extractMeta } from '@/utils/epubMetadata'

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

// ── Bookmarks ──────────────────────────────────────────────────────────

export interface Bookmark {
  id: string
  cfi: string
  label: string
  addedAt: number
}

export const loadBookmarks = (bookId: string): Bookmark[] => {
  try { return JSON.parse(localStorage.getItem(bookmarksKey(bookId)) ?? '[]') } catch { return [] }
}

export const saveBookmarks = (bookId: string, bookmarks: Bookmark[]) =>
  localStorage.setItem(bookmarksKey(bookId), JSON.stringify(bookmarks))

// ── Reading progress ───────────────────────────────────────────────────

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

// ── 內容綁定 id ─────────────────────────────────────────────────────────
// 用檔案內容算 SHA-256，確保同一本書不管在哪裝置、匯入幾次都算出同一個 id，
// 這樣重新匯入後才能跟雲端資料庫裡的舊進度/書籤/註記接回去。
const hashFileContent = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Hook ───────────────────────────────────────────────────────────────

export const useLibrary = () => {
  const [records, setRecords] = useState<BookRecord[]>(loadMeta)

  const addBook = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const id = await hashFileContent(buffer)

    // 同一份內容已經存在本機（例如重複匯入、或找回遺失的書本），
    // 直接接回既有紀錄，不覆蓋既有進度/書籤/註記。
    const alreadyExists = (await idbGet('files', id)) !== null
    if (alreadyExists) {
      touchBook(id)
      return id
    }

    await idbPut('files', id, buffer)

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
    localStorage.removeItem(bookmarksKey(id))
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
