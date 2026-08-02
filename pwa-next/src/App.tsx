'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Library from '@/page/Library'
import Reader from '@/page/Reader'
import MissingBookModal from '@/components/Library/MissingBookModal'
import { useLibrary, loadBookmarks, loadProgress } from '@/hooks/useLibrary'
import { loadAnnotationsForBook } from '@/store/useAnnotationStore'
import { syncBook, syncProgress, syncBookmarks, syncAnnotations, setSyncEnabled } from '@/utils/cloudSync'

type View = 'library' | 'reader'

const App = () => {
  const { records, addBook, getBookUrl, getCoverDataUrl, removeBook, touchBook, updateProgress } = useLibrary()
  const [view, setView] = useState<View>('library')
  const [activeBookUrl, setActiveBookUrl] = useState<string | null>(null)
  const [activeBookId, setActiveBookId] = useState<string>('')
  const [initialCfi, setInitialCfi] = useState<string | undefined>(undefined)
  const [darkMode, setDarkMode] = useState(true)
  const [missingBook, setMissingBook] = useState<{ id: string; title: string } | null>(null)
  const recoverFileInputRef = useRef<HTMLInputElement>(null)
  const { isSignedIn } = useUser()

  // cloudSync.ts 的每個 sync 函式都要先查這個開關才會真的發請求，未登入時完全不送出，
  // 不是「送出去再被 401 擋掉」。這個 effect 一定要排在下面的登入補推 effect 之前
  // （React 同一個元件裡的 effect 依宣告順序執行），不然補推當下開關還沒打開。
  // 把 dark class 同步到 <html>，讓 body 的 background-color（globals.css 的
  // var(--color-paper)）能跟著切換，避免深色模式下 body 背景色停留在預設淺色。
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    setSyncEnabled(!!isSignedIn)
  }, [isSignedIn])

  // 登入當下，把本機既有的書本/進度/書籤/註記全部背景推一次到雲端——
  // 平常只有「資料異動時」才會觸發同步（見 cloudSync.ts 的呼叫點），
  // 這裡補上「登入那一刻」把已經存在的舊資料也一次補推上去，否則要等
  // 使用者剛好再異動到那本書才會補推。
  // 每本書內部要先等 syncBook 完成才能推它的進度/書籤/註記（外鍵依賴，
  // 雲端資料庫要先有這本書的列才能寫入子資料），不同書之間則可以平行推。
  useEffect(() => {
    if (!isSignedIn) return
    Promise.all(
      records.map(async (r) => {
        const bookSynced = await syncBook(r.id, r.title, r.author, r.filename)
        // Book 那筆列都沒寫成功，進度/書籤/註記會撞外鍵違反錯誤，不必送出
        if (!bookSynced) return
        const cfi = loadProgress(r.id)
        const bookmarks = loadBookmarks(r.id)
        const annotations = loadAnnotationsForBook(r.id)
        await Promise.all([
          cfi ? syncProgress(r.id, cfi) : undefined,
          syncBookmarks(r.id, bookmarks),
          syncAnnotations(r.id, annotations),
        ])
      }),
    )
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
