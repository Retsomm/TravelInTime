'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Library from '@/page/Library'
import Reader from '@/page/Reader'
import MissingBookModal from '@/components/Library/MissingBookModal'
import { useLibrary } from '@/hooks/useLibrary'
import { setSyncEnabled } from '@/services/syncGate'
import { useCloudRestoreMutation } from '@/hooks/useCloudRestore'

type View = 'library' | 'reader'

// 一個瀏覽器分頁只自動還原一次，避免使用者掛著分頁時每次重新取得焦點/切換視圖
// 都重新打一輪全量還原（GET 書庫 + 逐本書 GET 進度/書籤/註記）。
const RESTORE_ONCE_KEY = 'tit-cloud-restore-done'

const App = () => {
  const { records, addBook, getBookUrl, getCoverDataUrl, removeBook, touchBook, updateProgress, replaceRecords } = useLibrary()
  const [view, setView] = useState<View>('library')
  const [activeBookUrl, setActiveBookUrl] = useState<string | null>(null)
  const [activeBookId, setActiveBookId] = useState<string>('')
  const [initialCfi, setInitialCfi] = useState<string | undefined>(undefined)
  const [darkMode, setDarkMode] = useState(true)
  const [missingBook, setMissingBook] = useState<{ id: string; title: string } | null>(null)
  const recoverFileInputRef = useRef<HTMLInputElement>(null)
  const { isSignedIn } = useUser()
  const restoreMutation = useCloudRestoreMutation(replaceRecords)

  // 每個 Service 層的 sync 函式都要先查這個開關才會真的發請求，未登入時完全不送出，
  // 不是「送出去再被 401 擋掉」。這個 effect 要排在下面的還原 effect 之前
  // （React 同一個元件裡的 effect 依宣告順序執行），不然還原當下開關還沒打開。
  // 把 dark class 同步到 <html>，讓 body 的 background-color（globals.css 的
  // var(--color-paper)）能跟著切換，避免深色模式下 body 背景色停留在預設淺色。
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    setSyncEnabled(!!isSignedIn)
  }, [isSignedIn])

  // 登入時觸發一次讀取／還原：跟雲端資料合併書庫清單/進度/書籤/註記，取代舊版
  // 只寫不讀的登入補推 effect（見 useCloudRestore.ts 的完整合併邏輯說明）。
  useEffect(() => {
    if (!isSignedIn) return
    if (sessionStorage.getItem(RESTORE_ONCE_KEY) === '1') return
    sessionStorage.setItem(RESTORE_ONCE_KEY, '1')
    restoreMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  const handleOpenBook = async (id: string, cfi?: string) => {
    const url = await getBookUrl(id)
    if (!url) {
      const record = records.find((r) => r.id === id)
      setMissingBook({ id, title: record?.title ?? '這本書' })
      return
    }
    touchBook(id)
    setActiveBookUrl(url)
    setActiveBookId(id)
    setInitialCfi(cfi)
    setView('reader')
  }

  const handleAddBooks = async (files: File[]) => {
    await Promise.allSettled(files.map((file) => addBook(file)))
  }

  // 從「我的筆記」頁點「開啟這本書」或個別註記會連到 /?open=<bookId>（可選 &cfi=<目標位置>），
  // 這裡接手打開並清掉網址參數。cfi 存在時代表使用者點的是特定一則註記，優先跳轉到那個位置；
  // 沒有 cfi 則沿用一般的「開啟這本書」行為，回到上次的閱讀進度。
  const router = useRouter()
  const searchParams = useSearchParams()
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId) return
    const cfi = searchParams.get('cfi') ?? undefined
    handleOpenBook(openId, cfi)
    router.replace('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleRecoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (recoverFileInputRef.current) recoverFileInputRef.current.value = ''
    if (!file || !missingBook) return

    const targetId = missingBook.id
    const restoredId = await addBook(file)
    setMissingBook(null)

    // 內容 hash 相符才代表真的是同一本書，直接接著打開；
    // 選錯檔案的話 restoredId 會是另一個 id（已被當成新書匯入），這裡不強行打開。
    if (restoredId === targetId) handleOpenBook(restoredId)
  }

  const backToLibrary = () => {
    if (activeBookUrl) URL.revokeObjectURL(activeBookUrl)
    setActiveBookUrl(null)
    setActiveBookId('')
    setInitialCfi(undefined)
    setView('library')
  }

  const handleApplyLatestVersion = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }
    } catch (err) {
      console.warn('[PWA] Service Worker 清除失敗:', err)
    }

    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
    } catch (err) {
      console.warn('[PWA] Cache Storage 清除失敗:', err)
    }

    const url = new URL(window.location.href)
    url.searchParams.set('refresh', String(Date.now()))
    window.location.replace(url.toString())
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="h-dvh overflow-hidden bg-stone-50 dark:bg-gray-900 transition-colors">
        {view === 'library' && (
          <Library
            records={records}
            getCoverDataUrl={getCoverDataUrl}
            onAddBooks={handleAddBooks}
            onOpenBook={handleOpenBook}
            onRemoveBook={removeBook}
            darkMode={darkMode}
            onToggleDark={() => setDarkMode(!darkMode)}
            onApplyLatestVersion={handleApplyLatestVersion}
          />
        )}
        {view === 'reader' && activeBookUrl && (
          <Reader
            bookPath={activeBookUrl}
            bookId={activeBookId}
            initialCfi={initialCfi}
            bookRecord={records.find((r) => r.id === activeBookId) ?? null}
            getCoverDataUrl={getCoverDataUrl}
            onBack={backToLibrary}
            darkMode={darkMode}
            onToggleDark={() => setDarkMode(!darkMode)}
            onUpdateProgress={(pct) => updateProgress(activeBookId, pct)}
            onApplyLatestVersion={handleApplyLatestVersion}
          />
        )}
        {missingBook && (
          <MissingBookModal
            bookTitle={missingBook.title}
            onReimport={() => recoverFileInputRef.current?.click()}
            onCancel={() => setMissingBook(null)}
          />
        )}
        <input
          ref={recoverFileInputRef}
          type="file"
          accept=".epub"
          className="hidden"
          onChange={handleRecoverFileChange}
        />
      </div>
    </div>
  )
}

export default App
