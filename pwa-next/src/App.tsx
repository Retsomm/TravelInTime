'use client'

import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import Library from '@/page/Library'
import Reader from '@/page/Reader'
import MissingBookModal from '@/components/Library/MissingBookModal'
import { useLibrary, loadBookmarks, loadProgress } from '@/hooks/useLibrary'
import { loadAnnotationsForBook } from '@/store/useAnnotationStore'
import { syncBook, syncProgress, syncBookmarks, syncAnnotations } from '@/utils/cloudSync'

type View = 'library' | 'reader'

const App = () => {
  const { records, addBook, getBookUrl, getCoverDataUrl, removeBook, touchBook, updateProgress } = useLibrary()
  const [view, setView] = useState<View>('library')
  const [activeBookUrl, setActiveBookUrl] = useState<string | null>(null)
  const [activeBookId, setActiveBookId] = useState<string>('')
  const [darkMode, setDarkMode] = useState(true)
  const [missingBook, setMissingBook] = useState<{ id: string; title: string } | null>(null)
  const recoverFileInputRef = useRef<HTMLInputElement>(null)
  const { isSignedIn } = useUser()

  // 登入當下，把本機既有的書本/進度/書籤/註記全部背景推一次到雲端——
  // 平常只有「資料異動時」才會觸發同步（見 cloudSync.ts 的呼叫點），
  // 這裡補上「登入那一刻」把已經存在的舊資料也一次補推上去，否則要等
  // 使用者剛好再異動到那本書才會補推。
  useEffect(() => {
    if (!isSignedIn) return
    for (const r of records) {
      syncBook(r.id, r.title, r.author, r.filename)
      const cfi = loadProgress(r.id)
      if (cfi) syncProgress(r.id, cfi)
      const bookmarks = loadBookmarks(r.id)
      if (bookmarks.length > 0) syncBookmarks(r.id, bookmarks)
      const annotations = loadAnnotationsForBook(r.id)
      if (annotations.length > 0) syncAnnotations(r.id, annotations)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  const handleOpenBook = async (id: string) => {
    const url = await getBookUrl(id)
    if (!url) {
      const record = records.find((r) => r.id === id)
      setMissingBook({ id, title: record?.title ?? '這本書' })
      return
    }
    touchBook(id)
    setActiveBookUrl(url)
    setActiveBookId(id)
    setView('reader')
  }

  const handleAddBooks = async (files: File[]) => {
    await Promise.allSettled(files.map((file) => addBook(file)))
  }

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
