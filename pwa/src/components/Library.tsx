import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookRecord } from '../hooks/useLibrary'

// ── Icons ──────────────────────────────────────────────────────────────

const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
    <line x1="4.9" y1="4.9" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/>
    <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
    <line x1="4.9" y1="19.1" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.1" y2="4.9"/>
  </svg>
)
const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>
  </svg>
)
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>
  </svg>
)
const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 1-15.5 6.2" />
    <path d="M3 12A9 9 0 0 1 18.5 5.8" />
    <path d="M18 2v5h-5" />
    <path d="M6 22v-5h5" />
  </svg>
)

// ── Cover styles ────────────────────────────────────────────────────────

const COVER_STYLES = [
  { bg: 'oklch(0.92 0.04 80)',  ink: 'oklch(0.35 0.06 60)',  rule: 'oklch(0.68 0.08 55)' },
  { bg: 'oklch(0.86 0.04 65)',  ink: 'oklch(0.30 0.04 50)',  rule: 'oklch(0.55 0.06 40)' },
  { bg: 'oklch(0.30 0.06 260)', ink: 'oklch(0.92 0.02 260)', rule: 'oklch(0.72 0.10 260)' },
  { bg: 'oklch(0.42 0.05 150)', ink: 'oklch(0.95 0.02 140)', rule: 'oklch(0.78 0.08 145)' },
  { bg: 'oklch(0.88 0.04 20)',  ink: 'oklch(0.35 0.06 15)',  rule: 'oklch(0.62 0.12 20)' },
  { bg: 'oklch(0.45 0.02 250)', ink: 'oklch(0.95 0.01 250)', rule: 'oklch(0.80 0.04 250)' },
]

const coverStyleFor = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COVER_STYLES[h % COVER_STYLES.length]
}

const SERIF = '"Source Serif 4", "Noto Serif TC", Georgia, serif'
const MONO  = '"JetBrains Mono", ui-monospace, monospace'

// ── BookCard ────────────────────────────────────────────────────────────

interface CardProps {
  record: BookRecord
  getCoverDataUrl: (id: string) => Promise<string | null>
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

const BookCard = ({ record, getCoverDataUrl, onOpen, onRemove }: CardProps) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const pct = Math.round((record.progress ?? 0) * 100)
  const s = coverStyleFor(record.id)

  useEffect(() => {
    if (!record.hasCover) return
    getCoverDataUrl(record.id).then((url) => { if (url) setCoverUrl(url) })
  }, [record.id, record.hasCover, getCoverDataUrl])

  return (
    <div className="group cursor-pointer" onClick={() => onOpen(record.id)}>
      <div style={{
        position: 'relative', aspectRatio: '2/3', borderRadius: 3, overflow: 'hidden',
        background: s.bg,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08), 3px 6px 18px -6px rgba(0,0,0,0.18), 1px 2px 4px -2px rgba(0,0,0,0.12)',
      }}>
        {coverUrl ? (
          <img src={coverUrl} alt={record.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 10,
              background: 'linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 40%, transparent 100%)',
              pointerEvents: 'none', zIndex: 1,
            }} />
            <div style={{
              position: 'absolute', inset: 0, padding: '14% 12%',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              color: s.ink,
            }}>
              <div>
                <div style={{ width: 22, height: 2, background: s.rule, marginBottom: 10 }} />
                <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 600, lineHeight: 1.25, letterSpacing: '0.01em' }}>
                  {record.title}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75 }}>
                  {record.author || '—'}
                </div>
                <div style={{ width: 14, height: 1, background: s.rule, marginTop: 6, opacity: 0.7 }} />
              </div>
            </div>
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'repeating-linear-gradient(30deg, transparent 0 3px, rgba(0,0,0,0.015) 3px 4px), repeating-linear-gradient(-30deg, transparent 0 3px, rgba(255,255,255,0.015) 3px 4px)',
              mixBlendMode: 'overlay',
            }} />
          </>
        )}
        <button
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 11, zIndex: 2 }}
          onClick={(e) => { e.stopPropagation(); onRemove(record.id) }}
          aria-label="移除書籍"
        >✕</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{
          fontFamily: SERIF, fontSize: 13, fontWeight: 500,
          lineHeight: 1.3, letterSpacing: '0.005em',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }} className="text-stone-800 dark:text-stone-100">
          {record.title}
        </div>
        {record.author && (
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em', marginTop: 3 }} className="text-stone-400 dark:text-stone-500 truncate">
            {record.author}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: '#e0d8cc' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'oklch(0.62 0.14 40)', borderRadius: 999 }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em' }} className="text-stone-400 dark:text-stone-500 tabular-nums shrink-0">
            {pct === 100 ? '讀畢' : `${pct}%`}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── ConfirmModal ────────────────────────────────────────────────────────

const ConfirmModal = ({ bookTitle, onConfirm, onCancel }: { bookTitle: string; onConfirm: () => void; onCancel: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
    <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl p-6 w-80 max-w-full mx-4" onClick={(e) => e.stopPropagation()}>
      <h2 style={{ fontFamily: SERIF }} className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-2">確認刪除書籍</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
        確定要刪除《{bookTitle}》？<br />書籍與所有相關註解將一併移除，無法復原。
      </p>
      <div className="flex gap-3 justify-end">
        <button className="px-4 py-2 rounded-xl text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition" onClick={onCancel}>取消</button>
        <button className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition" onClick={onConfirm}>確認刪除</button>
      </div>
    </div>
  </div>
)

// ── Library ─────────────────────────────────────────────────────────────

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
