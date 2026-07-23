'use client'

import { SignInButton, UserButton, useUser } from '@clerk/nextjs'

// 雲端同步的登入狀態。未登入時仍可正常使用書庫/閱讀器（純本機功能不需要帳號），
// 登入只是為了啟用進度/書籤/註記的雲端備份。文字標籤不只是 hover title，
// 讓「登入可以雲端備份」這件事不用滑鼠移過去才看得到。
const AuthStatus = () => {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) return null

  if (isSignedIn) {
    return <UserButton />
  }

  return (
    <SignInButton mode="modal">
      <button
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-full transition text-ink-3"
        title="登入以啟用雲端備份"
        aria-label="登入以啟用雲端備份"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="1.6" className="shrink-0">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
        <span className="hidden md:inline font-ui-mono text-[10px] tracking-[0.06em]">
          登入以雲端備份
        </span>
      </button>
    </SignInButton>
  )
}

export default AuthStatus
