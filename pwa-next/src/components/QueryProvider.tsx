'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// QueryClient 用 useState 的 lazy initializer 建立，確保每個瀏覽器分頁只有一個 instance、
// 不會在每次 re-render 時被重新建立（官方建議寫法，避免元件重渲染時 cache 被重置）。
const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = useState(() => new QueryClient())
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

export default QueryProvider
