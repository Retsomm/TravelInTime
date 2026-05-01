import { MONO, SERIF } from '@/components/Library/coverStyles'
import { IconMoon, IconPlus, IconSearch, IconSun } from '@/components/Library/icons'

interface Props {
  darkMode: boolean
  loading: boolean
  query: string
  paperBg: string
  paperBg2: string
  borderCol: string
  inkCol: string
  ink3Col: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onQueryChange: (value: string) => void
  onToggleDark: () => void
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

const LibraryHeader = ({ darkMode, loading, query, paperBg, paperBg2, borderCol, inkCol, ink3Col, fileInputRef, onQueryChange, onToggleDark, onFileChange }: Props) => (
  <div className="flex items-center gap-4 pl-20 pr-4 py-3 flex-wrap" style={{ borderBottom: `1px solid ${borderCol}`, background: paperBg }}>
    <div className="flex items-center gap-2.5">
      <div style={{ width: 28, height: 28, borderRadius: 6, background: inkCol, color: paperBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: 16 }}>T</div>
      <h1 style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, letterSpacing: '0.01em', color: inkCol }}>Travel in Time</h1>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ink3Col }}>Library</span>
    </div>

    <div className="flex-1 flex justify-center" style={{ minWidth: 200 }}>
      <div className="no-drag flex items-center gap-2" style={{ height: 34, padding: '0 12px', borderRadius: 999, background: paperBg2, border: `1px solid ${borderCol}`, width: 340, maxWidth: '100%' }}>
        <span style={{ color: ink3Col, flexShrink: 0 }}><IconSearch /></span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="搜尋書名、作者…"
          style={{ flex: 1, background: 'transparent', border: 0, outline: 0, color: inkCol, fontSize: 13, fontFamily: 'inherit' }}
        />
        <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.08em', flexShrink: 0 }}>⌘K</span>
        {query && <button style={{ color: ink3Col, fontSize: 11, marginLeft: 4 }} onClick={() => onQueryChange('')}>✕</button>}
      </div>
    </div>

    <div className="flex items-center gap-2">
      <button className="no-drag p-2 rounded-full transition" style={{ color: ink3Col }} onClick={onToggleDark} aria-label={darkMode ? '切換淺色模式' : '切換深色模式'} title={darkMode ? '切換淺色模式' : '切換深色模式'}>
        {darkMode ? <IconSun /> : <IconMoon />}
      </button>
      <button className="no-drag flex items-center gap-1.5 transition" style={{ height: 34, padding: '0 14px', borderRadius: 8, background: inkCol, color: paperBg, fontFamily: 'inherit', fontSize: 13, fontWeight: 500 }} onClick={() => fileInputRef.current?.click()} disabled={loading}>
        <IconPlus /> {loading ? '載入中…' : '匯入 ePub 書籍'}
      </button>
      <input ref={fileInputRef as React.RefObject<HTMLInputElement>} type="file" accept=".epub" multiple className="hidden" onChange={onFileChange} />
    </div>
  </div>
)

export default LibraryHeader
