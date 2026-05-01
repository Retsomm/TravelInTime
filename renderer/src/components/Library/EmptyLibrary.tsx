import { MONO, SERIF } from '@/components/Library/coverStyles'
import { IconMoon, IconPlus, IconSun } from '@/components/Library/icons'

interface Props {
  darkMode: boolean
  loading: boolean
  paperBg: string
  inkCol: string
  ink3Col: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onToggleDark: () => void
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

const EmptyLibrary = ({ darkMode, loading, paperBg, inkCol, ink3Col, fileInputRef, onToggleDark, onFileChange }: Props) => (
  <div className="drag-region flex flex-col min-h-screen" style={{ background: paperBg, color: inkCol }}>
    <div className="flex items-center justify-between pl-20 pr-4 py-3">
      <h1 style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, letterSpacing: '0.01em', color: inkCol }}>Travel in Time</h1>
      <button className="no-drag p-2 rounded-full transition" style={{ color: ink3Col }} onClick={onToggleDark} aria-label={darkMode ? '切換淺色模式' : '切換深色模式'} title={darkMode ? '切換淺色模式' : '切換深色模式'}>
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
      <p style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 12 }}>
        一段靜謐的閱讀旅程
      </p>
      <p style={{ color: ink3Col, fontSize: 15, lineHeight: 1.65, maxWidth: 380, marginBottom: 32 }}>
        匯入您的 ePub 書籍，在字裡行間緩步前行。<br />所有內容僅保存在您的裝置，離線可用。
      </p>
      <button
        className="no-drag flex items-center gap-2 transition"
        aria-label="匯入 ePub 書籍"
        style={{ height: 44, padding: '0 22px', borderRadius: 10, background: inkCol, color: paperBg, fontFamily: 'inherit', fontSize: 14, fontWeight: 500 }}
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
      >
        <IconPlus /> {loading ? '載入中…' : '匯入第一本書'}
      </button>
      <div style={{ marginTop: 36, display: 'flex', gap: 20, fontFamily: MONO, fontSize: 11, color: ink3Col, letterSpacing: '0.08em' }}>
        <span>· EPUB 2 / 3</span><span>· 離線優先</span><span>· 本機儲存</span>
      </div>
      <input ref={fileInputRef as React.RefObject<HTMLInputElement>} type="file" accept=".epub" multiple className="hidden" onChange={onFileChange} />
    </div>
  </div>
)

export default EmptyLibrary
