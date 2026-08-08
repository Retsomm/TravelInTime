import { useCallback, useState } from 'react'
import { settingsKey } from '@/constants/storageKeys'
import { bookService } from '@/services/bookService'
import { extractMeta } from '@/utils/epubMetadata'

export type { BookRecord } from '@/services/bookService'
import type { BookRecord } from '@/services/bookService'

// ── Book settings（純本機排版偏好，Prisma 沒有對應 model，不上雲端同步）───────

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
// addBook 的三個分支（新書／重複匯入／檔案遺失復原）維持原本的控制流程不變，
// 只是把底層的 localStorage/IndexedDB/雲端同步呼叫換成 bookService 提供的版本。

export const useLibrary = () => {
  const [records, setRecords] = useState<BookRecord[]>(bookService.local.listMeta)

  const addBook = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const id = await bookService.local.hashFileContent(buffer)

    const existingRecord = bookService.local.listMeta().find((r) => r.id === id)
    const fileExists = (await bookService.local.getFile(id)) !== null

    if (existingRecord && fileExists) {
      // 重複匯入同一本書：資料都在，直接接回既有紀錄，不覆蓋既有進度/書籤/註記。
      touchBook(id)
      bookService.remote.syncBook(id, existingRecord.title, existingRecord.author, existingRecord.filename)
      return id
    }

    if (existingRecord && !fileExists) {
      // 書本檔案遺失後的復原匯入：書庫清單裡的紀錄還在，只是 IndexedDB 裡的檔案內容不見了，
      // 這裡只補回檔案本體，不能再走下面「新書」的路徑，否則會產生重複的書庫項目。
      await bookService.local.putFile(id, buffer)
      touchBook(id)
      bookService.remote.syncBook(id, existingRecord.title, existingRecord.author, existingRecord.filename)

      // 封面圖存在同一個 IndexedDB 資料庫的另一個 store，檔案遺失時很可能也一併消失了，
      // 這裡重新萃取補回，避免 hasCover 是 true 但實際讀不到封面圖。
      extractMeta(buffer, file.name).then(({ coverDataUrl }) => {
        if (!coverDataUrl) return
        bookService.local.putCover(id, coverDataUrl)
        setRecords((prev) => {
          const next = prev.map((r) => (r.id === id ? { ...r, hasCover: true } : r))
          bookService.local.saveMeta(next)
          return next
        })
      })

      return id
    }

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
    bookService.remote.syncBook(id, initial.title, initial.author, initial.filename)

    extractMeta(buffer, file.name).then(({ title, author, coverDataUrl }) => {
      if (coverDataUrl) bookService.local.putCover(id, coverDataUrl)
      setRecords((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, title, author, hasCover: !!coverDataUrl } : r,
        )
        bookService.local.saveMeta(next)
        return next
      })
      bookService.remote.syncBook(id, title, author, initial.filename)
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
    localStorage.removeItem(settingsKey(id))
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id)
      bookService.local.saveMeta(next)
      return next
    })
    bookService.remote.syncRemoveBook(id)
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

  // 讀取／還原路徑（useCloudRestore.ts、Notes.tsx 自己的還原 effect）算完合併結果後
  // 呼叫這個函式把結果寫回 React state + localStorage。用 useCallback 維持穩定參照——
  // 這個函式會被放進呼叫端 useEffect 的 dependency array，不穩定會導致 effect 每次
  // render 都重跑，參見 useAnnotations.ts 那次 "Maximum update depth exceeded" 的教訓。
  const replaceRecords = useCallback((next: BookRecord[]) => {
    bookService.local.saveMeta(next)
    setRecords(next)
  }, [])

  return { records, addBook, getBookUrl, getCoverDataUrl, removeBook, touchBook, updateProgress, replaceRecords }
}
