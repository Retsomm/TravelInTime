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

// ── Hook ───────────────────────────────────────────────────────────────

export const useLibrary = () => {
  const [records, setRecords] = useState<BookRecord[]>(loadMeta)

  const addBook = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const id = crypto.randomUUID()

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
