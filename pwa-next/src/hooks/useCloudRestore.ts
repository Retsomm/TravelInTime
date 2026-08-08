'use client'

import { useMutation } from '@tanstack/react-query'
import { bookService } from '@/services/bookService'
import { bookmarkService } from '@/services/bookmarkService'
import { annotationService } from '@/services/annotationService'
import { progressService } from '@/services/progressService'
import type { BookRecord } from '@/services/bookService'

const BATCH_SIZE = 5

const runInBatches = async <T,>(items: T[], batchSize: number, task: (item: T) => Promise<void>) => {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(task))
  }
}

// 登入時或進入書庫距上次還原一段時間後觸發：把雲端資料拉回來跟本機合併，
// 讓書庫清單／進度／書籤／註記在這台裝置上補齊其他裝置產生的資料——取代舊版 App.tsx
// 那個「只寫不讀」的登入補推 effect（見 utils/cloudSync.ts 已刪除的版本）。
//
// 只處理 metadata 層級的合併與寫入，不牽涉任何特定 Reader session 正在使用的 React state
// （TanStack Query progress cache／useAnnotations 的 hook state）——這些在下次真的打開
// 那本書時，會自然地從已經還原好的 localStorage 讀到新資料，不需要這裡反向同步任何 UI 狀態。
export const useCloudRestoreMutation = (replaceRecords: (records: BookRecord[]) => void) =>
  useMutation({
    mutationFn: async () => {
      const remoteBooks = await bookService.remote.fetchAll()
      if (remoteBooks === null) return // 離線或請求失敗，安靜放棄，不影響本機既有資料

      const localRecords = bookService.local.listMeta()
      const merged = bookService.merge(localRecords, remoteBooks)
      replaceRecords(merged)

      await runInBatches(merged, BATCH_SIZE, async (record) => {
        const bookId = record.id

        // 先確保雲端有這本書的列再碰它的子資料——Bookmark/Annotation/ReadingProgress
        // 都有外鍵依賴 Book(clerkUserId, id)，本機曾經在「未登入」狀態下新增的書從來
        // 沒有被推上雲端過（syncBook 在未登入時直接靜默略過，不會自動重試），
        // 這裡補推一次（upsert，冪等，即使雲端已經有這筆也不會出錯）才能安全繼續。
        const bookSynced = await bookService.remote.syncBook(record.id, record.title, record.author, record.filename)
        if (!bookSynced) return

        const remoteProgress = await progressService.remote.fetch(bookId)
        if (remoteProgress) {
          const mergedProgress = progressService.merge(progressService.local.load(bookId), remoteProgress)
          if (mergedProgress) progressService.local.save(mergedProgress.bookId, mergedProgress.cfi, mergedProgress.updatedAt)
        }

        const remoteBookmarks = await bookmarkService.remote.fetch(bookId)
        if (remoteBookmarks) {
          const localDeletedIds = new Set(Object.keys(bookmarkService.local.loadDeletedIds(bookId)))
          const mergedBookmarks = bookmarkService.merge(bookmarkService.local.load(bookId), remoteBookmarks, localDeletedIds)
          bookmarkService.local.save(bookId, mergedBookmarks)
          bookmarkService.pushNow(bookId) // 自我修復：把合併結果（含尚未成功推送的刪除）重新寫回雲端
        }

        const remoteAnnotations = await annotationService.remote.fetch(bookId)
        if (remoteAnnotations) {
          const localDeletedIds = new Set(Object.keys(annotationService.local.loadDeletedIds(bookId)))
          const mergedAnnotations = annotationService.merge(annotationService.local.load(bookId), remoteAnnotations, localDeletedIds)
          annotationService.local.save(bookId, mergedAnnotations)
          annotationService.pushNow(bookId)
        }
      })
    },
  })
