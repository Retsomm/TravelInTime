import { useState } from 'react'
import Library from './components/Library'
import Reader from './components/Reader'
import { useLibrary } from './hooks/useLibrary'

type View = 'library' | 'reader'

const App = () => {
  const { records, addBook, getBookUrl, getCoverDataUrl, removeBook, touchBook } = useLibrary()
  const [view, setView] = useState<View>('library')
  const [activeBookUrl, setActiveBookUrl] = useState<string | null>(null)
  const [activeBookId, setActiveBookId] = useState<string>('')
  const [darkMode, setDarkMode] = useState(false)

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
          />
        )}
        {view === 'reader' && activeBookUrl && (
          <Reader
            bookPath={activeBookUrl}
            bookId={activeBookId}
            onBack={backToLibrary}
            darkMode={darkMode}
            onToggleDark={() => setDarkMode(!darkMode)}
          />
        )}
      </div>
    </div>
  )
}

export default App
