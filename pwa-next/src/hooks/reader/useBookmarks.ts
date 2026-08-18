import { useEffect, useState } from 'react'
import { bookmarkService } from '@/services/bookmarkService'
import type { Bookmark } from '@/services/bookmarkService'
import { removeBookmarkById, toggleBookmark } from '@/components/Reader/bookmarkUtils'

export const useBookmarks = (bookId: string) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => bookmarkService.local.load(bookId))
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // bookId 變更時（或 StrictMode 雙重 invoke 後）重新從 localStorage 載入書籤。
  useEffect(() => {
    setBookmarks(bookmarkService.local.load(bookId))
  }, [bookId])

  const isBookmarked = (cfi: string) => bookmarks.some((b) => b.cfi === cfi)

  const toggle = (cfi: string, label: string) => {
    const next = toggleBookmark(bookmarks, cfi, label, crypto.randomUUID(), Date.now())
    bookmarkService.local.save(bookId, next)
    setBookmarks(next)
  }

  const remove = (id: string) => {
    const next = removeBookmarkById(bookmarks, id)
    bookmarkService.local.save(bookId, next)
    setBookmarks(next)
  }

  const reset = () => {
    setBookmarks([])
    setPendingDeleteId(null)
  }

  return { bookmarks, pendingDeleteId, setPendingDeleteId, isBookmarked, toggle, remove, reset }
}
