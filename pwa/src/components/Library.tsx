import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookRecord } from '../hooks/useLibrary'

const IconSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)

const IconMoon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

// ── 封面佔位：以書名首字 + 漸層色背景呈現 ─────────────────────────────

const GRADIENTS = [
  'from-indigo-400 to-purple-500',
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-pink-500',
  'from-sky-400 to-blue-500',
  'from-violet-400 to-fuchsia-500',
]

const gradientFor = (id: string) =>
  GRADIENTS[id.charCodeAt(0) % GRADIENTS.length]

// ── BookCard ───────────────────────────────────────────────────────────

interface CardProps {
  record: BookRecord
  getCoverDataUrl: (id: string) => Promise<string | null>
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

const BookCard = ({ record, getCoverDataUrl, onOpen, onRemove }: CardProps) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!record.hasCover) return
    getCoverDataUrl(record.id).then((url) => {
      if (url) setCoverUrl(url)
    })
  }, [record.id, record.hasCover, getCoverDataUrl])

  return (
    <div
      className="group relative cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-shadow aspect-[2/3]"
      onClick={() => onOpen(record.id)}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={record.title}
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          className={`w-full h-full bg-gradient-to-br ${gradientFor(record.id)} flex items-end p-3`}
        >
          <span className="text-white text-4xl font-bold leading-none opacity-60 select-none">
            {record.title.charAt(0)}
          </span>
        </div>
      )}

      {/* 刪除按鈕 */}
      <button
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500"
        onClick={(e) => { e.stopPropagation(); onRemove(record.id) }}
        aria-label="移除書籍"
        title="移除"
      >
        ✕
      </button>
    </div>
  )
}

// ── ConfirmModal ───────────────────────────────────────────────────────

const ConfirmModal = ({
  bookTitle,
  onConfirm,
  onCancel,
}: {
  bookTitle: string
  onConfirm: () => void
  onCancel: () => void
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    onClick={onCancel}
  >
    <div
      className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl p-6 w-80 max-w-full mx-4"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-2">
        確認刪除書籍
      </h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
        確定要刪除《{bookTitle}》？<br />
        書籍與所有相關註解將一併移除，無法復原。
      </p>
      <div className="flex gap-3 justify-end">
        <button
          className="px-4 py-2 rounded-xl text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition"
          onClick={onConfirm}
        >
          確認刪除
        </button>
      </div>
    </div>
  </div>
)

// ── Library ────────────────────────────────────────────────────────────

interface Props {
  records: BookRecord[]
  getCoverDataUrl: (id: string) => Promise<string | null>
  onAddBooks: (files: File[]) => Promise<void>
  onOpenBook: (id: string) => void
  onRemoveBook: (id: string) => void
  darkMode: boolean
  onToggleDark: () => void
}

const Library = ({
  records,
  getCoverDataUrl,
  onAddBooks,
  onOpenBook,
  onRemoveBook,
  darkMode,
  onToggleDark,
}: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null)

  const handleRemoveRequest = (id: string) => {
    const record = records.find((r) => r.id === id)
    if (record) setPendingRemove({ id, title: record.title })
  }

  const handleConfirmRemove = () => {
    if (pendingRemove) {
      onRemoveBook(pendingRemove.id)
      setPendingRemove(null)
    }
  }

  const handleCancelRemove = () => setPendingRemove(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setLoading(true)
    try {
      await onAddBooks(fileArray)
    } catch (e) {
      console.error('[handleFileChange] onAddBooks 拋出例外', e)
    } finally {
      setLoading(false)
    }
  }

  const triggerPicker = () => fileInputRef.current?.click()

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [records]
  )

  // 無書籍時顯示原始歡迎畫面
  if (records.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <div className="flex-1" />
          <button
            className="p-2 rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700 transition"
            onClick={onToggleDark}
            aria-label={darkMode ? '切換淺色模式' : '切換深色模式'}
          >
            {darkMode ? <IconSun /> : <IconMoon />}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 p-8">
          <h1 className="text-4xl font-bold text-stone-800 dark:text-stone-100 mb-8">
            Travel in Time
          </h1>
          <p className="text-stone-500 dark:text-stone-400 mb-10 text-center max-w-md leading-relaxed">
            一款沉靜式閱讀器，支援 ePub 格式。
            <br />
            匯入書籍，開始旅行。
          </p>
          <button
            className="px-8 py-4 bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 rounded-2xl text-lg font-medium hover:bg-stone-700 dark:hover:bg-stone-200 transition disabled:opacity-50"
            onClick={triggerPicker}
            disabled={loading}
          >
            {loading ? '載入中…' : '匯入 ePub 書籍'}
          </button>
          <input ref={fileInputRef} type="file" accept=".epub" multiple className="hidden" onChange={handleFileChange} />
        </div>
      </div>
    )
  }

  return (
    <>
      {pendingRemove && (
        <ConfirmModal
          bookTitle={pendingRemove.title}
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      )}
      <div className="min-h-screen flex flex-col bg-stone-50 dark:bg-gray-900">
      {/* 頂部導覽 */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-stone-200 dark:border-stone-700">
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100 flex-1 text-center">
          Travel in Time
        </h1>
        <button
          className="p-2 rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700 transition"
          onClick={onToggleDark}
          aria-label={darkMode ? '切換淺色模式' : '切換深色模式'}
        >
          {darkMode ? <IconSun /> : <IconMoon />}
        </button>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 rounded-xl text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-200 transition disabled:opacity-50"
          onClick={triggerPicker}
          disabled={loading}
        >
          {loading ? '載入中…' : '＋ 匯入書籍'}
        </button>
        <input ref={fileInputRef} type="file" accept=".epub" multiple className="hidden" onChange={handleFileChange} />
      </div>

      {/* 書籍格狀清單 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
          書庫 · 共 {records.length} 本
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
          {sortedRecords.map((r) => (
            <BookCard
              key={r.id}
              record={r}
              getCoverDataUrl={getCoverDataUrl}
              onOpen={onOpenBook}
              onRemove={handleRemoveRequest}
            />
          ))}
        </div>
      </div>
    </div>
    </>
  )
}

export default Library
