import { useEffect, useRef, useState } from 'react'
import { bookmarkService } from '@/services/bookmarkService'
import type { Bookmark } from '@/services/bookmarkService'
import { removeBookmarkById, toggleBookmark } from '@/components/Reader/bookmarkUtils'

export const useBookmarks = (bookId: string) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => bookmarkService.local.load(bookId))
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // localStorage 寫入是副作用，不能放進 setState 的 updater callback 裡（React 可能
  // 重複呼叫 updater，見下方 toggle/remove）；用 ref 追蹤目前列表，在一般 handler
  // 裡算好 next 再寫入，寫入成功才更新 state。
  const bookmarksRef = useRef(bookmarks)
  bookmarksRef.current = bookmarks

  // bookId 變更時（或 StrictMode 雙重 invoke 後）重新從 localStorage 載入書籤。
  useEffect(() => {
    const loaded = bookmarkService.local.load(bookId)
    bookmarksRef.current = loaded
    setBookmarks(loaded)
  }, [bookId])

  const isBookmarked = (cfi: string) => bookmarks.some((b) => b.cfi === cfi)

  const toggle = (cfi: string, label: string) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const next = toggleBookmark(bookmarksRef.current, cfi, label, id, now)
    if (bookmarkService.local.save(bookId, next)) {
      bookmarksRef.current = next
      setBookmarks(next)
    }
  }

  const remove = (id: string) => {
    const next = removeBookmarkById(bookmarksRef.current, id)
    if (bookmarkService.local.save(bookId, next)) {
      bookmarksRef.current = next
      setBookmarks(next)
    }
  }

  const reset = () => {
    bookmarksRef.current = []
    setBookmarks([])
    setPendingDeleteId(null)
  }

  return { bookmarks, pendingDeleteId, setPendingDeleteId, isBookmarked, toggle, remove, reset }
}
