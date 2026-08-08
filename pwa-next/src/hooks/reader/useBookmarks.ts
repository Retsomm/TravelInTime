import { useEffect, useState } from 'react'
import { bookmarkService } from '@/services/bookmarkService'
import type { Bookmark } from '@/services/bookmarkService'
import { removeBookmarkById, toggleBookmark } from '@/components/Reader/bookmarkUtils'

export const useBookmarks = (bookId: string) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => bookmarkService.local.load(bookId))
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // bookId 變更時（或 StrictMode 雙重 invoke 後）重新從 localStorage 載入書籤，
  // 並背景跟雲端合併這本書的書籤——開書當下才是「查一次其他裝置有沒有新增/刪除」
  // 最自然的時機，登入時的整書庫還原一個分頁只觸發一次，涵蓋不到這個情境。
  // 不 await，避免開書卡在網路請求上；merge 完成後才更新畫面，離線時直接維持本機資料。
  useEffect(() => {
    setBookmarks(bookmarkService.local.load(bookId))
    bookmarkService.restoreForBook(bookId).then(setBookmarks)
  }, [bookId])

  const isBookmarked = (cfi: string) => bookmarks.some((b) => b.cfi === cfi)

  const toggle = (cfi: string, label: string) => {
    // toggleBookmark 是「加入或移除」雙向行為：cfi 已存在時這次呼叫其實是移除，
    // 要記一筆刪除紀錄（tombstone）讓下次推送時通知伺服器軟刪除，不然雲端那筆
    // 舊資料下次還原時會復活。
    const existing = bookmarks.find((b) => b.cfi === cfi)
    const next = toggleBookmark(bookmarks, cfi, label, crypto.randomUUID(), Date.now())
    bookmarkService.local.save(bookId, next)
    if (existing) bookmarkService.local.recordDeleted(bookId, existing.id)
    setBookmarks(next)
    bookmarkService.pushNow(bookId)
  }

  const remove = (id: string) => {
    const next = removeBookmarkById(bookmarks, id)
    bookmarkService.local.save(bookId, next)
    bookmarkService.local.recordDeleted(bookId, id)
    setBookmarks(next)
    bookmarkService.pushNow(bookId)
  }

  const reset = () => {
    setBookmarks([])
    setPendingDeleteId(null)
  }

  return { bookmarks, pendingDeleteId, setPendingDeleteId, isBookmarked, toggle, remove, reset }
}
