import { useEffect, useState } from 'react'
import { loadBookmarks, saveBookmarks } from '@/hooks/useLibrary'
import type { Bookmark } from '@/hooks/useLibrary'
import { removeBookmarkById, toggleBookmark } from '@/components/Reader/bookmarkUtils'

export const useBookmarks = (bookId: string) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks(bookId))
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // bookId 變更時（或 StrictMode 雙重 invoke 後）重新從 localStorage 載入書籤
  useEffect(() => { setBookmarks(loadBookmarks(bookId)) }, [bookId])

  const isBookmarked = (cfi: string) => bookmarks.some((b) => b.cfi === cfi)

  const toggle = (cfi: string, label: string) => {
    setBookmarks((prev) => {
      const next = toggleBookmark(prev, cfi, label, crypto.randomUUID(), Date.now())
      saveBookmarks(bookId, next)
      return next
    })
  }

  const remove = (id: string) => {
    setBookmarks((prev) => {
      const next = removeBookmarkById(prev, id)
      saveBookmarks(bookId, next)
      return next
    })
  }

  const reset = () => {
    setBookmarks([])
    setPendingDeleteId(null)
  }

  return { bookmarks, pendingDeleteId, setPendingDeleteId, isBookmarked, toggle, remove, reset }
}
