// Hook 層：把 progressService 包成給元件用的 API。
import { useCallback } from 'react'
import { progressService } from '@/services/progressService'

export const useSaveProgress = (bookId: string) => {
  return useCallback((cfi: string) => {
    progressService.local.save(bookId, cfi)
  }, [bookId])
}
