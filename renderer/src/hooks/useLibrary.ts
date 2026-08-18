import { useState } from 'react'
import { bookmarksKey, progressKey, settingsKey } from '@/constants/storageKeys'
import { bookService } from '@/services/bookService'
import { extractMeta } from '@/utils/epubMetadata'

export type { BookRecord } from '@/services/bookService'
import type { BookRecord } from '@/services/bookService'

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
  const [records, setRecords] = useState<BookRecord[]>(bookService.local.listMeta)

  const addBook = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const id = crypto.randomUUID()

    await bookService.local.putFile(id, buffer)

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
      bookService.local.saveMeta(next)
      return next
    })

    extractMeta(buffer, file.name).then(({ title, author, coverDataUrl }) => {
      if (coverDataUrl) bookService.local.putCover(id, coverDataUrl)
      setRecords((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, title, author, hasCover: !!coverDataUrl } : r,
        )
        bookService.local.saveMeta(next)
        return next
      })
    })

    return id
  }

  const getBookUrl = async (id: string): Promise<string | null> => {
    const buffer = await bookService.local.getFile(id)
    if (!buffer) return null
    return URL.createObjectURL(new Blob([buffer], { type: 'application/epub+zip' }))
  }

  const getCoverDataUrl = (id: string): Promise<string | null> => bookService.local.getCover(id)

  const removeBook = async (id: string) => {
    await bookService.local.deleteFile(id)
    await bookService.local.deleteCover(id)
    localStorage.removeItem(progressKey(id))
    localStorage.removeItem(settingsKey(id))
    localStorage.removeItem(bookmarksKey(id))
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id)
      bookService.local.saveMeta(next)
      return next
    })
  }

  const touchBook = (id: string) => {
    setRecords((prev) => {
      const next = prev.map((r) =>
        r.id === id ? { ...r, lastOpenedAt: Date.now() } : r,
      )
      bookService.local.saveMeta(next)
      return next
    })
  }

  const updateProgress = (id: string, pct: number) => {
    setRecords((prev) => {
      const next = prev.map((r) =>
        r.id === id ? { ...r, progress: Math.max(0, Math.min(1, pct)) } : r,
      )
      bookService.local.saveMeta(next)
      return next
    })
  }

  return { records, addBook, getBookUrl, getCoverDataUrl, removeBook, touchBook, updateProgress }
}
