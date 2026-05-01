import { useMemo, useRef, useState } from 'react'
import type { BookRecord } from '@/hooks/useLibrary'
import { IconMoon, IconPlus, IconRefresh, IconSearch, IconSun } from '@/components/Library/icons'
import BookCard from '@/components/Library/BookCard'
import ConfirmModal from '@/components/Library/ConfirmModal'
import { MONO, SERIF } from '@/components/Library/coverStyles'

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
    await onApplyLatestVersion()
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

  const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2  = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
  const ink3Col   = darkMode ? '#8a7f74' : '#9a8f80'

  if (records.length === 0) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: paperBg, color: inkCol }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex-1" />
          <button className="p-2 rounded-full transition" style={{ color: ink3Col }} onClick={onToggleDark}>
            {darkMode ? <IconSun /> : <IconMoon />}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div style={{
            width: 56, height: 56, borderRadius: 10, marginBottom: 28,
            background: inkCol, color: paperBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: 28,
          }}>T</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 12 }}>
            一段靜謐的閱讀旅程
          </h1>
          <p style={{ color: ink3Col, fontSize: 14, lineHeight: 1.65, maxWidth: 340, marginBottom: 28 }}>
            匯入您的 ePub 書籍，在字裡行間緩步前行。<br />所有內容僅保存在您的裝置。
          </p>
          <button
            className="flex items-center gap-2 transition"
            style={{
              height: 44, padding: '0 22px', borderRadius: 10,
              background: inkCol, color: paperBg,
              fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
            }}
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

      <div className="flex flex-col min-h-screen" style={{ background: paperBg, color: inkCol }}>

        {/* ── Header ── */}
        <div style={{ borderBottom: `1px solid ${borderCol}`, background: paperBg }}>
          {/* 第一行：Logo + 標題 + 操作按鈕 */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <div ref={logoMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setLogoMenuOpen((open) => !open)}
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: logoMenuOpen ? paperBg2 : inkCol,
                  color: logoMenuOpen ? inkCol : paperBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer',
                }}
                aria-label="Travel in Time 選單"
              >
                T
              </button>
              {logoMenuOpen && (
                <div
                  style={{
                    position: 'absolute', left: 0, top: 32, zIndex: 60,
                    width: 178, padding: 6, borderRadius: 8,
                    background: paperBg, border: `1px solid ${borderCol}`,
                    boxShadow: '0 14px 32px -14px rgba(0,0,0,0.45)',
                  }}
                >
                  <button
                    onClick={handleApplyLatestVersion}
                    disabled={applyingUpdate}
                    style={{
                      width: '100%', minHeight: 34, borderRadius: 6, padding: '8px 10px',
                      display: 'flex', alignItems: 'center', gap: 8,
                      color: applyingUpdate ? ink3Col : inkCol,
                      fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
                      cursor: applyingUpdate ? 'default' : 'pointer',
                      opacity: applyingUpdate ? 0.7 : 1,
                    }}
                  >
                    <IconRefresh />
                    <span>{applyingUpdate ? '更新中…' : '套用最新版'}</span>
                  </button>
                </div>
              )}
            </div>
            <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, letterSpacing: '0.01em' }}>Travel in Time</span>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ink3Col }}>Library</span>

            {/* 桌面版搜尋框（同行居中） */}
            <div className="hidden md:flex flex-1 justify-center">
              <div className="flex items-center gap-2" style={{
                height: 32, padding: '0 12px', borderRadius: 999,
                background: paperBg2, border: `1px solid ${borderCol}`,
                width: 300, maxWidth: '100%',
              }}>
                <span style={{ color: ink3Col, flexShrink: 0 }}><IconSearch /></span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋書名、作者…"
                  style={{ flex: 1, background: 'transparent', border: 0, outline: 0, color: inkCol, fontSize: 13, fontFamily: 'inherit' }}
                />
                {query && <button style={{ color: ink3Col, fontSize: 11 }} onClick={() => setQuery('')}>✕</button>}
              </div>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="p-2 rounded-full transition" style={{ color: ink3Col }} onClick={onToggleDark} title={darkMode ? '淺色' : '深色'}>
                {darkMode ? <IconSun /> : <IconMoon />}
              </button>
              <button
                className="flex items-center gap-1.5 transition"
                style={{
                  height: 32, padding: '0 12px', borderRadius: 8,
                  background: inkCol, color: paperBg,
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                }}
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                <IconPlus /> <span className="hidden md:inline">{loading ? '載入中…' : '匯入 ePub'}</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".epub" multiple className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          {/* 第二行：手機版搜尋框（獨立一行） */}
          <div className="md:hidden px-4 pb-3">
            <div className="flex items-center gap-2" style={{
              height: 34, padding: '0 12px', borderRadius: 999,
              background: paperBg2, border: `1px solid ${borderCol}`,
              width: '100%',
            }}>
              <span style={{ color: ink3Col, flexShrink: 0 }}><IconSearch /></span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋書名、作者…"
                style={{ flex: 1, background: 'transparent', border: 0, outline: 0, color: inkCol, fontSize: 13, fontFamily: 'inherit' }}
              />
              {query && <button style={{ color: ink3Col, fontSize: 11 }} onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>
        </div>

        {/* ── Section heading + sort ── */}
        <div className="flex items-baseline justify-between flex-wrap gap-3" style={{ padding: '18px 20px 12px' }}>
          <div>
            <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 400, letterSpacing: '-0.005em' }}>書庫</span>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', marginLeft: 8, color: ink3Col }}>
              {String(shown.length).padStart(2, '0')} VOLUMES
            </span>
          </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: paperBg2, border: `1px solid ${borderCol}` }}>
            {(['recent', 'title', 'progress'] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                style={{
                  height: 26, padding: '0 10px', borderRadius: 6,
                  fontFamily: 'inherit', fontSize: 12,
                  background: sort === key ? paperBg : 'transparent',
                  color: sort === key ? inkCol : ink3Col,
                  boxShadow: sort === key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all .15s',
                }}
              >
                {key === 'recent' ? '最近閱讀' : key === 'title' ? '書名' : '進度'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Book grid ── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '4px 20px 60px' }}>
          {shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20" style={{ color: ink3Col }}>
              <p className="text-sm">找不到符合「{query}」的書籍</p>
              <button className="mt-3 text-xs underline" onClick={() => setQuery('')}>清除搜尋</button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '28px 18px',
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
