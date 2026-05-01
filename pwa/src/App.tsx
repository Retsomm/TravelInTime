import { useState } from 'react'
import Library from './components/Library'
import Reader from './components/Reader'
import { useLibrary } from './hooks/useLibrary'

type View = 'library' | 'reader'

const App = () => {
  const { records, addBook, getBookUrl, getCoverDataUrl, removeBook, touchBook, updateProgress } = useLibrary()
  const [view, setView] = useState<View>('library')
  const [activeBookUrl, setActiveBookUrl] = useState<string | null>(null)
  const [activeBookId, setActiveBookId] = useState<string>('')
  const [darkMode, setDarkMode] = useState(true)

  const handleOpenBook = async (id: string) => {
    const url = await getBookUrl(id)
    if (!url) return
    touchBook(id)
    setActiveBookUrl(url)
    setActiveBookId(id)
    setView('reader')
  }

  const handleAddBooks = async (files: File[]) => {
    await Promise.allSettled(files.map((file) => addBook(file)))
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
      <div className="min-h-screen bg-stone-50 dark:bg-gray-900 transition-colors">
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
      </div>
    </div>
  )
}

export default App
