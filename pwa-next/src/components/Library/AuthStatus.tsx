'use client'

import { SignInButton, UserButton, useUser } from '@clerk/nextjs'

interface Props {
  inkCol: string
  ink3Col: string
}

// 雲端同步的登入狀態。未登入時仍可正常使用書庫/閱讀器（純本機功能不需要帳號），
// 登入只是為了啟用進度/書籤/註記的雲端備份。
const AuthStatus = ({ inkCol, ink3Col }: Props) => {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) return null

  if (isSignedIn) {
    return <UserButton />
  }

  return (
    <SignInButton mode="modal">
      <button
        className="p-2 rounded-full transition"
        style={{ color: ink3Col }}
        title="登入以啟用雲端同步"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={inkCol} strokeWidth="1.6">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      </button>
    </SignInButton>
  )
}

export default AuthStatus
