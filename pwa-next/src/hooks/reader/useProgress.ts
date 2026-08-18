// Hook 層：把 progressService 包成給元件用的 TanStack Query API。
'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@clerk/nextjs'
import { progressService, type Progress } from '@/services/progressService'

export const progressQueryKey = (bookId: string) => ['books', bookId, 'progress'] as const

// initialData 直接同步讀本機（source of truth），未登入/離線時 UI 永遠有資料可畫。
// 已登入時 queryFn 背景打遠端、跟本機 merge（LWW by updatedAt）後寫回本機再回傳——
// 不是單純回傳遠端資料，因為本機才是真正的 source of truth，遠端只是拿來補齊/校正。
export const useProgressQuery = (bookId: string) => {
  const { isSignedIn } = useUser()
  return useQuery({
    queryKey: progressQueryKey(bookId),
    initialData: () => progressService.local.load(bookId),
    queryFn: async (): Promise<Progress | null> => {
      const localProgress = progressService.local.load(bookId)
      if (!isSignedIn) return localProgress
      const remoteProgress = await progressService.remote.fetch(bookId)
      const merged = progressService.merge(localProgress, remoteProgress)
      if (merged) progressService.local.save(merged.bookId, merged.cfi, merged.updatedAt)
      return merged
    },
    staleTime: 60_000,
  })
}

// 高頻熱路徑（每次翻頁）不走 useMutation——mutation 的 isLoading/重渲染語意
// 跟這個呼叫頻率完全不匹配。改成：本機立即寫 + cache 立即同步 + debounce 後才打網路。
export const useSaveProgress = (bookId: string) => {
  const queryClient = useQueryClient()
  return (cfi: string) => {
    const saved = progressService.local.save(bookId, cfi)
    queryClient.setQueryData(progressQueryKey(bookId), saved)
    progressService.pushDebounced(bookId, cfi)
  }
}
