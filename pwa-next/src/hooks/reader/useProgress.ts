// Hook 層：把 progressService 包成給元件用的 API。
import { progressService } from '@/services/progressService'

export const useSaveProgress = (bookId: string) => {
  return (cfi: string) => {
    progressService.local.save(bookId, cfi)
  }
}
