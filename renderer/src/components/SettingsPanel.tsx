import { useEffect, useRef, useState } from 'react'
import { FONT_OPTIONS } from '../store/useReaderStore'
import type { Script } from '../store/useReaderStore'

const SERIF = '"Source Serif 4", "Noto Serif TC", Georgia, serif'
const MONO  = '"JetBrains Mono", ui-monospace, monospace'

const IconPlay = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
)
const IconStop = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
)

// ── NumStepper ──────────────────────────────────────────────────────────

const NumStepper = ({
  value, onDec, onInc, borderCol, inkCol, ink3Col, paperBg, paperBg2,
}: {
  value: string; onDec: () => void; onInc: () => void
  borderCol: string; inkCol: string; ink3Col: string; paperBg: string; paperBg2: string
}) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center',
    border: `1px solid ${borderCol}`, borderRadius: 8, overflow: 'hidden', height: 30,
    background: paperBg,
  }}>
    <button
      onClick={onDec}
      style={{ width: 30, height: 30, color: ink3Col, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', transition: 'background .12s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = paperBg2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >−</button>
    <span style={{
      width: 58, textAlign: 'center', fontSize: 13, color: inkCol,
      fontFamily: MONO, borderLeft: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`,
      height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      letterSpacing: '0.02em',
    }}>{value}</span>
    <button
      onClick={onInc}
      style={{ width: 30, height: 30, color: ink3Col, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', transition: 'background .12s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = paperBg2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >＋</button>
  </div>
)

// ── SegBtn ──────────────────────────────────────────────────────────────

const SegBtn = ({
  active, onClick, children, paperBg, inkCol, ink3Col,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
  paperBg: string; inkCol: string; ink3Col: string
}) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, height: 26, borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
      background: active ? paperBg : 'transparent',
      color: active ? inkCol : ink3Col,
      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
      cursor: 'pointer', transition: 'all .12s',
    }}
  >
    {children}
  </button>
)

// ── CustomSelect ────────────────────────────────────────────────────────

interface SelectOption { label: string; value: string }

const CustomSelect = ({
  value, options, onChange, ariaLabel,
  borderCol, inkCol, ink3Col, paperBg, paperBg2,
}: {
  value: string; options: SelectOption[]; onChange: (v: string) => void; ariaLabel?: string
  borderCol: string; inkCol: string; ink3Col: string; paperBg: string; paperBg2: string
}) => {
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  const openDropdown = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const estimatedH = Math.min(options.length * 32 + 8, 240)
    const showAbove = spaceBelow < estimatedH && rect.top > estimatedH
    setDropdownStyle({
      position: 'fixed', left: rect.left, width: rect.width,
      ...(showAbove ? { bottom: window.innerHeight - rect.top, top: 'auto' } : { top: rect.bottom, bottom: 'auto' }),
      zIndex: 9999,
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 13, padding: '6px 10px', borderRadius: 8, textAlign: 'left',
          background: paperBg2, border: `1px solid ${borderCol}`, color: inkCol,
          fontFamily: 'inherit', cursor: 'pointer',
        }}
        onClick={() => open ? setOpen(false) : openDropdown()}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label ?? ''}</span>
        <svg style={{ flexShrink: 0, marginLeft: 4, color: ink3Col }} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          style={{ ...dropdownStyle, background: paperBg, border: `1px solid ${borderCol}`, borderRadius: 8, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.2)', overflowY: 'auto', maxHeight: 240, padding: '4px 0' }}
          role="listbox"
        >
          {options.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              style={{
                padding: '7px 12px', fontSize: 13, cursor: 'pointer',
                background: o.value === value ? paperBg2 : 'transparent',
                color: o.value === value ? inkCol : ink3Col,
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { if (o.value !== value) e.currentTarget.style.background = paperBg2 }}
              onMouseLeave={(e) => { if (o.value !== value) e.currentTarget.style.background = 'transparent' }}
              onMouseDown={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SettingsPanel ───────────────────────────────────────────────────────

interface Props {
  fontSize: number
  onFontSizeChange: (size: number) => void
  fontFamily: string
  onFontChange: (font: string) => void
  script: Script
  onScriptToggle: () => void
  readingDirection: 'ltr' | 'rtl'
  onReadingDirectionChange: (d: 'ltr' | 'rtl') => void
  ttsPlaying: boolean
  onTTSPlay: () => void
  onTTSStop: () => void
  ttsVoices: SpeechSynthesisVoice[]
  ttsSelectedVoice: SpeechSynthesisVoice | null
  onTTSVoiceChange: (voice: SpeechSynthesisVoice) => void
  ttsRate: number
  onTTSRateChange: (rate: number) => void
  ttsSleepMinutes: number
  onTTSSleepChange: (minutes: number) => void
  ttsSleepRemaining: number | null
  lineHeight: number
  onLineHeightChange: (v: number) => void
  letterSpacing: number
  onLetterSpacingChange: (v: number) => void
  darkMode?: boolean
}

const SectTitle = ({ children, ink3Col }: { children: React.ReactNode; ink3Col: string }) => (
  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ink3Col, marginBottom: 10 }}>
    {children}
  </div>
)

const SettingsPanel = ({
  fontSize, onFontSizeChange, fontFamily, onFontChange,
  script, onScriptToggle, readingDirection, onReadingDirectionChange,
  ttsPlaying, onTTSPlay, onTTSStop, ttsVoices, ttsSelectedVoice, onTTSVoiceChange,
  ttsRate, onTTSRateChange, ttsSleepMinutes, onTTSSleepChange, ttsSleepRemaining,
  lineHeight, onLineHeightChange, letterSpacing, onLetterSpacingChange, darkMode,
}: Props) => {
  const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2  = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
  const ink2Col   = darkMode ? '#b8afa4' : '#5a4e44'
  const ink3Col   = darkMode ? '#7a706a' : '#9a8f80'
  const accentCol = 'oklch(0.62 0.14 40)'

  const stepperProps = { borderCol, inkCol, ink3Col, paperBg, paperBg2 }
  const segBg = { background: paperBg2, border: `1px solid ${borderCol}`, borderRadius: 8, padding: 2, display: 'flex', gap: 2 }

  return (
    <div style={{
      width: 320, flexShrink: 0, height: '100%',
      borderLeft: `1px solid ${borderCol}`,
      background: paperBg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}`, flexShrink: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, letterSpacing: '0.01em', color: inkCol }}>排版與語音</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── 字體 ── */}
        <section>
          <SectTitle ink3Col={ink3Col}>字體</SectTitle>

          {/* Font list */}
          <div style={{ border: `1px solid ${borderCol}`, borderRadius: 10, background: paperBg, padding: 4, display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => onFontChange(f.value)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                  background: fontFamily === f.value ? paperBg2 : 'transparent',
                  color: fontFamily === f.value ? inkCol : ink2Col,
                  fontFamily: f.value, fontSize: 14, cursor: 'pointer', transition: 'background .12s',
                }}
                onMouseEnter={(e) => { if (fontFamily !== f.value) e.currentTarget.style.background = paperBg2 }}
                onMouseLeave={(e) => { if (fontFamily !== f.value) e.currentTarget.style.background = 'transparent' }}
              >
                <span>{f.label}</span>
                {fontFamily === f.value && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentCol, flexShrink: 0 }} />
                )}
              </button>
            ))}
          </div>

          {/* TC/SC + LTR/RTL */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ ...segBg, flex: 1 }}>
              <SegBtn active={script === 'tc'} onClick={onScriptToggle} paperBg={paperBg} inkCol={inkCol} ink3Col={ink3Col}>繁體</SegBtn>
              <SegBtn active={script === 'sc'} onClick={onScriptToggle} paperBg={paperBg} inkCol={inkCol} ink3Col={ink3Col}>簡體</SegBtn>
            </div>
            <div style={{ ...segBg, flex: 1 }}>
              <SegBtn active={readingDirection === 'ltr'} onClick={() => onReadingDirectionChange('ltr')} paperBg={paperBg} inkCol={inkCol} ink3Col={ink3Col}>左→右</SegBtn>
              <SegBtn active={readingDirection === 'rtl'} onClick={() => onReadingDirectionChange('rtl')} paperBg={paperBg} inkCol={inkCol} ink3Col={ink3Col}>右→左</SegBtn>
            </div>
          </div>

          {/* Steppers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 12, columnGap: 12, alignItems: 'center', marginBottom: 12 }}>
            {[
              { label: '字體大小', value: `${fontSize}px`, onDec: () => onFontSizeChange(Math.max(12, fontSize - 1)), onInc: () => onFontSizeChange(Math.min(32, fontSize + 1)) },
              { label: '行距', value: lineHeight.toFixed(1), onDec: () => onLineHeightChange(parseFloat(Math.max(1.0, lineHeight - 0.1).toFixed(1))), onInc: () => onLineHeightChange(parseFloat(Math.min(3.0, lineHeight + 0.1).toFixed(1))) },
              { label: '字距', value: `${letterSpacing.toFixed(2)}em`, onDec: () => onLetterSpacingChange(parseFloat(Math.max(0, letterSpacing - 0.05).toFixed(2))), onInc: () => onLetterSpacingChange(parseFloat(Math.min(0.5, letterSpacing + 0.05).toFixed(2))) },
            ].map(({ label, value, onDec, onInc }) => (
              <>
                <span key={`${label}-l`} style={{ fontSize: 13, color: ink2Col }}>{label}</span>
                <NumStepper key={`${label}-s`} value={value} onDec={onDec} onInc={onInc} {...stepperProps} />
              </>
            ))}
          </div>

          <button
            onClick={() => { onFontSizeChange(16); onLineHeightChange(1.8); onLetterSpacingChange(0) }}
            style={{
              width: '100%', height: 30, borderRadius: 8, fontSize: 12,
              color: ink3Col, fontFamily: 'inherit', cursor: 'pointer', transition: 'background .12s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = paperBg2)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            重設預設值
          </button>
        </section>

        <div style={{ borderTop: `1px solid ${borderCol}` }} />

        {/* ── 語音朗讀 ── */}
        <section>
          <SectTitle ink3Col={ink3Col}>語音朗讀</SectTitle>

          {ttsVoices.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <CustomSelect
                value={ttsSelectedVoice?.name ?? ''}
                options={ttsVoices.map((v) => ({ value: v.name, label: v.name.replace(/^(Google|Microsoft|Apple)\s*/i, '') }))}
                onChange={(name) => { const v = ttsVoices.find((v) => v.name === name); if (v) onTTSVoiceChange(v) }}
                ariaLabel="選擇語音"
                {...{ borderCol, inkCol, ink3Col, paperBg, paperBg2 }}
              />
            </div>
          )}

          {/* TTS play card */}
          <div style={{ border: `1px solid ${borderCol}`, borderRadius: 10, padding: 14, background: paperBg, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 15, color: inkCol }}>{ttsPlaying ? '正在朗讀' : '準備朗讀'}</div>
                <div style={{ fontSize: 11, color: ink3Col, marginTop: 2 }}>
                  {ttsSelectedVoice?.name.replace(/^(Google|Microsoft|Apple)\s*/i, '') || '系統語音'} · {ttsRate.toFixed(1)}×
                </div>
              </div>
              <button
                onClick={ttsPlaying ? onTTSStop : onTTSPlay}
                style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: ttsPlaying ? accentCol : inkCol,
                  color: paperBg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'background .15s',
                }}
              >
                {ttsPlaying ? <IconStop /> : <IconPlay />}
              </button>
            </div>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: ink3Col, width: 28, flexShrink: 0 }}>語速</span>
              <input
                type="range" min="0.5" max="2" step="0.1" value={ttsRate}
                onChange={(e) => onTTSRateChange(+e.target.value)}
                style={{ flex: 1, accentColor: accentCol }}
              />
              <span style={{ fontFamily: MONO, fontSize: 11, color: ink2Col, width: 32, textAlign: 'right' }}>
                {ttsRate.toFixed(1)}×
              </span>
            </div>
          </div>

          {/* Sleep timer */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: ink3Col }}>睡眠計時</span>
              {ttsSleepRemaining !== null && (
                <span style={{ fontFamily: MONO, fontSize: 11, color: accentCol }}>
                  {String(Math.floor(ttsSleepRemaining / 60)).padStart(2, '0')}:{String(ttsSleepRemaining % 60).padStart(2, '0')}
                </span>
              )}
            </div>
            <div style={{ ...segBg, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {([0, 15, 30, 45, 60] as const).map((m) => (
                <SegBtn key={m} active={ttsSleepMinutes === m} onClick={() => onTTSSleepChange(m)} paperBg={paperBg} inkCol={inkCol} ink3Col={ink3Col}>
                  {m === 0 ? '關' : String(m)}
                </SegBtn>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default SettingsPanel
