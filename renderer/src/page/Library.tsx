import { useMemo, useRef, useState } from 'react'
import type { BookRecord } from '@/hooks/useLibrary'
import BookCard from '@/components/Library/BookCard'
import EmptyLibrary from '@/components/Library/EmptyLibrary'
import LibraryHeader from '@/components/Library/LibraryHeader'
import ConfirmModal from '@/components/Library/ConfirmModal'
import SortControl from '@/components/Library/SortControl'
import type { SortKey } from '@/components/Library/SortControl'


interface Props {
  records: BookRecord[]
  getCoverDataUrl: (id: string) => Promise<string | null>
  onAddBooks: (files: File[]) => Promise<void>
  onOpenBook: (id: string) => void
  onRemoveBook: (id: string) => void
  darkMode: boolean
  onToggleDark: () => void
}

const Library = ({ records, getCoverDataUrl, onAddBooks, onOpenBook, onRemoveBook, darkMode, onToggleDark }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')

  const handleRemoveRequest = (id: string) => {
    const record = records.find((r) => r.id === id)
    if (record) setPendingRemove({ id, title: record.title })
  }
  const handleConfirmRemove = () => { if (pendingRemove) { onRemoveBook(pendingRemove.id); setPendingRemove(null) } }
  const handleCancelRemove = () => setPendingRemove(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setLoading(true)
    try { await onAddBooks(fileArray) } finally { setLoading(false) }
  }

  const shown = useMemo(() => {
    let r = records.filter((b) =>
      !query || b.title.toLowerCase().includes(query.toLowerCase()) || (b.author ?? '').toLowerCase().includes(query.toLowerCase())
    )
    if (sort === 'recent')   r = [...r].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    if (sort === 'title')    r = [...r].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'))
    if (sort === 'progress') r = [...r].sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    return r
  }, [records, query, sort])

  const paperBg    = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2   = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol  = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol     = darkMode ? '#e8e0d4' : '#2a2420'
  const ink3Col    = darkMode ? '#8a7f74' : '#9a8f80'

  if (records.length === 0) {
    return (
      <EmptyLibrary
        darkMode={darkMode}
        loading={loading}
        paperBg={paperBg}
        inkCol={inkCol}
        ink3Col={ink3Col}
        fileInputRef={fileInputRef}
        onToggleDark={onToggleDark}
        onFileChange={handleFileChange}
      />
    )
  }

  return (
    <>
      {pendingRemove && <ConfirmModal bookTitle={pendingRemove.title} onConfirm={handleConfirmRemove} onCancel={handleCancelRemove} />}

      <div className="drag-region flex flex-col min-h-screen" style={{ background: paperBg, color: inkCol }}>

        <LibraryHeader
          darkMode={darkMode}
          loading={loading}
          query={query}
          paperBg={paperBg}
          paperBg2={paperBg2}
          borderCol={borderCol}
          inkCol={inkCol}
          ink3Col={ink3Col}
          fileInputRef={fileInputRef}
          onQueryChange={setQuery}
          onToggleDark={onToggleDark}
          onFileChange={handleFileChange}
        />

        <SortControl
          count={shown.length}
          sort={sort}
          paperBg={paperBg}
          paperBg2={paperBg2}
          borderCol={borderCol}
          inkCol={inkCol}
          ink3Col={ink3Col}
          onSortChange={setSort}
        />

        {/* ── Book grid ── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '4px 40px 60px' }}>
          {shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20" style={{ color: ink3Col }}>
              <p className="text-sm">找不到符合「{query}」的書籍</p>
              <button className="mt-3 text-xs underline" onClick={() => setQuery('')}>清除搜尋</button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '32px 24px',
            }}>
              {shown.map((r) => (
                <BookCard key={r.id} record={r} getCoverDataUrl={getCoverDataUrl} onOpen={onOpenBook} onRemove={handleRemoveRequest} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default Library
