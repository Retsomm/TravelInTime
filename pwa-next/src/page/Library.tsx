import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { BookRecord } from '@/hooks/useLibrary'
import { IconMoon, IconNote, IconPlus, IconRefresh, IconSearch, IconSun } from '@/components/Library/icons'
import BookCard from '@/components/Library/BookCard'
import ConfirmModal from '@/components/Library/ConfirmModal'
import AuthStatus from '@/components/Library/AuthStatus'

interface Props {
  records: BookRecord[]
  getCoverDataUrl: (id: string) => Promise<string | null>
  onAddBooks: (files: File[]) => Promise<void>
  onOpenBook: (id: string) => void
  onRemoveBook: (id: string) => void
  darkMode: boolean
  onToggleDark: () => void
  onApplyLatestVersion: () => void | Promise<void>
}

type SortKey = 'recent' | 'title' | 'progress'

const Library = ({ records, getCoverDataUrl, onAddBooks, onOpenBook, onRemoveBook, darkMode, onToggleDark, onApplyLatestVersion }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [logoMenuOpen, setLogoMenuOpen] = useState(false)
  const [applyingUpdate, setApplyingUpdate] = useState(false)
  const logoMenuRef = useRef<HTMLDivElement>(null)

  const handleRemoveRequest = (id: string) => {
    const record = records.find((r) => r.id === id)
    if (record) setPendingRemove({ id, title: record.title })
  }
  const handleConfirmRemove = () => { if (pendingRemove) { onRemoveBook(pendingRemove.id); setPendingRemove(null) } }
  const handleCancelRemove = () => setPendingRemove(null)
  const handleApplyLatestVersion = async () => {
    if (applyingUpdate) return
    setApplyingUpdate(true)
    try {
      await onApplyLatestVersion()
    } finally {
      setApplyingUpdate(false)
    }
  }

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

  if (records.length === 0) {
    return (
      <div className="flex flex-col h-full bg-paper text-ink">
        <div className="flex items-center justify-between px-4 py-3 pt-[max(env(safe-area-inset-top),12px)]">
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <AuthStatus />
            <button className={`p-2 rounded-full transition text-ink-3`} onClick={onToggleDark} aria-label={darkMode ? '切換為淺色主題' : '切換為深色主題'}>
              {darkMode ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="w-14 h-14 rounded-[10px] mb-7 bg-ink text-paper flex items-center justify-center font-ui-serif italic font-bold text-[28px]">T</div>
          <h1 className="font-ui-serif text-[32px] font-normal tracking-[-0.01em] mb-3">
            一段靜謐的閱讀旅程
          </h1>
          <p className={`text-ink-3 text-sm leading-[1.65] max-w-85 mb-7`}>
            匯入您的 ePub 書籍，在字裡行間緩步前行。<br />所有內容僅保存在您的裝置。
          </p>
          <button
            className="flex items-center gap-2 transition h-11 px-5.5 rounded-[10px] bg-ink text-paper font-[inherit] text-sm font-medium"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            <IconPlus /> {loading ? '載入中…' : '匯入第一本書'}
          </button>
          <input ref={fileInputRef} type="file" accept=".epub" multiple className="hidden" onChange={handleFileChange} />
        </div>
      </div>
    )
  }

  return (
    <>
      {pendingRemove && <ConfirmModal bookTitle={pendingRemove.title} onConfirm={handleConfirmRemove} onCancel={handleCancelRemove} />}

      <div className="flex flex-col h-full bg-paper text-ink">

        {/* ── Header ── */}
        <div className="border-b border-border bg-paper pt-[env(safe-area-inset-top)]">
          {/* 第一行：Logo + 標題 + 操作按鈕 */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <div ref={logoMenuRef} className="relative shrink-0">
              <button
                onClick={() => setLogoMenuOpen((open) => !open)}
                className={`w-6.5 h-6.5 rounded-md flex items-center justify-center font-ui-serif italic font-bold text-sm cursor-pointer ${
                  logoMenuOpen ? 'bg-paper-2 text-ink' : 'bg-ink text-paper'
                }`}
                aria-label="Travel in Time 選單"
              >
                T
              </button>
              {logoMenuOpen && (
                <div className="absolute left-0 top-8 z-60 w-44.5 p-1.5 rounded-lg bg-paper border border-border shadow-[0_14px_32px_-14px_rgba(0,0,0,0.45)]">
                  <button
                    onClick={handleApplyLatestVersion}
                    disabled={applyingUpdate}
                    className={`w-full min-h-8.5 rounded-md py-2 px-2.5 flex items-center gap-2 font-[inherit] text-[13px] text-left ${
                      applyingUpdate ? `text-ink-3 cursor-default opacity-70` : 'text-ink cursor-pointer opacity-100'
                    }`}
                  >
                    <IconRefresh />
                    <span>{applyingUpdate ? '更新中…' : '套用最新版'}</span>
                  </button>
                  <Link
                    href="/notes"
                    className="w-full min-h-8.5 rounded-md py-2 px-2.5 flex items-center gap-2 text-ink font-[inherit] text-[13px] text-left"
                  >
                    <IconNote />
                    <span>我的筆記</span>
                  </Link>
                </div>
              )}
            </div>
            <span className="font-ui-serif text-base font-medium tracking-[0.01em]">Travel in Time</span>
            <span className={`font-ui-mono text-[10px] tracking-[0.12em] uppercase text-ink-3`}>Library</span>

            {/* 桌面版搜尋框（同行居中） */}
            <div className="hidden md:flex flex-1 justify-center">
              <div className="flex items-center gap-2 h-8 px-3 rounded-full bg-paper-2 border border-border w-75 max-w-full">
                <span className={`text-ink-3 shrink-0`}><IconSearch /></span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋書名、作者…"
                  className="flex-1 bg-transparent border-0 outline-0 text-ink text-[13px] font-[inherit]"
                />
                {query && <button className={`text-ink-3 text-[11px]`} onClick={() => setQuery('')} aria-label="清除搜尋">✕</button>}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <button className={`p-2 rounded-full transition text-ink-3`} onClick={onToggleDark} title={darkMode ? '淺色' : '深色'} aria-label={darkMode ? '切換為淺色主題' : '切換為深色主題'}>
                {darkMode ? <IconSun /> : <IconMoon />}
              </button>
              <button
                className="flex items-center gap-1.5 transition h-8 px-3 rounded-lg bg-ink text-paper font-[inherit] text-[13px] font-medium"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                aria-label={loading ? '載入中' : '匯入 ePub'}
              >
                <IconPlus /> <span className="hidden md:inline">{loading ? '載入中…' : '匯入 ePub'}</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".epub" multiple className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          {/* 第二行：手機版搜尋框（獨立一行） */}
          <div className="md:hidden px-4 pb-3">
            <div className="flex items-center gap-2 h-8.5 px-3 rounded-full bg-paper-2 border border-border w-full">
              <span className={`text-ink-3 shrink-0`}><IconSearch /></span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋書名、作者…"
                className="flex-1 bg-transparent border-0 outline-0 text-ink text-[13px] font-[inherit]"
              />
              {query && <button className={`text-ink-3 text-[11px]`} onClick={() => setQuery('')} aria-label="清除搜尋">✕</button>}
            </div>
          </div>
        </div>

        {/* ── Section heading + sort ── */}
        <div className="flex items-baseline justify-between flex-wrap gap-3 pt-4.5 px-5 pb-3">
          <div>
            <span className="font-ui-serif text-[22px] font-normal tracking-[-0.005em]">書庫</span>
            <span className={`font-ui-mono text-[11px] tracking-[0.08em] ml-2 text-ink-3`}>
              {String(shown.length).padStart(2, '0')} VOLUMES
            </span>
          </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-paper-2 border border-border">
            {(['recent', 'title', 'progress'] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`h-6.5 px-2.5 rounded-md font-[inherit] text-xs transition-all duration-150 ${
                  sort === key ? 'bg-paper text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : `bg-transparent text-ink-3 shadow-none`
                }`}
              >
                {key === 'recent' ? '最近閱讀' : key === 'title' ? '書名' : '進度'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Book grid ── */}
        <div className="flex-1 overflow-y-auto pt-1 px-5 pb-15">
          {shown.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-20 text-ink-3`}>
              <p className="text-sm">找不到符合「{query}」的書籍</p>
              <button className="mt-3 text-xs underline" onClick={() => setQuery('')}>清除搜尋</button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-4.5 gap-y-7">
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
