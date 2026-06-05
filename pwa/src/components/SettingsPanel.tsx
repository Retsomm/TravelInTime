import { FONT_OPTIONS } from '@/store/useReaderStore'
import type { Script } from '@/store/useReaderStore'
import { SERIF, MONO } from '@/constants/fonts'
import { useThemeColors } from '@/hooks/useThemeColors'
import NumStepper from '@/components/SettingsPanel/NumStepper'
import SegBtn from '@/components/SettingsPanel/SegBtn'
import CustomSelect from '@/components/SettingsPanel/CustomSelect'
import SectTitle from '@/components/SettingsPanel/SectTitle'
import { IconPlay, IconPause, IconReset } from '@/components/SettingsPanel/icons'

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
  ttsPaused: boolean
  onTTSPlay: () => void
  onTTSPause: () => void
  onTTSReset: () => void
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

const SettingsPanel = ({
  fontSize, onFontSizeChange, fontFamily, onFontChange,
  script, onScriptToggle, readingDirection, onReadingDirectionChange,
  ttsPlaying, ttsPaused, onTTSPlay, onTTSPause, onTTSReset, ttsVoices, ttsSelectedVoice, onTTSVoiceChange,
  ttsRate, onTTSRateChange, ttsSleepMinutes, onTTSSleepChange, ttsSleepRemaining,
  lineHeight, onLineHeightChange, letterSpacing, onLetterSpacingChange, darkMode,
}: Props) => {
  const { paperBg, paperBg2, borderCol, inkCol, ink2Col, ink3Col, accentCol } = useThemeColors(darkMode)

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
              <div key={label} style={{ display: 'contents' }}>
                <span style={{ fontSize: 13, color: ink2Col }}>{label}</span>
                <NumStepper value={value} onDec={onDec} onInc={onInc} {...stepperProps} />
              </div>
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
                <div style={{ fontFamily: SERIF, fontSize: 15, color: inkCol }}>{ttsPlaying ? '正在朗讀' : ttsPaused ? '已暫停' : '準備朗讀'}</div>
                <div style={{ fontSize: 11, color: ink3Col, marginTop: 2 }}>
                  {ttsSelectedVoice?.name.replace(/^(Google|Microsoft|Apple)\s*/i, '') || '系統語音'} · {ttsRate.toFixed(1)}×
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={onTTSReset}
                  disabled={!ttsPlaying && !ttsPaused}
                  style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: paperBg2,
                    color: (!ttsPlaying && !ttsPaused) ? ink3Col : ink2Col,
                    border: `1px solid ${borderCol}`,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: (!ttsPlaying && !ttsPaused) ? 'default' : 'pointer',
                    opacity: (!ttsPlaying && !ttsPaused) ? 0.45 : 1,
                    transition: 'all .15s',
                  }}
                  aria-label="重置朗讀進度"
                  title="重置朗讀進度"
                >
                  <IconReset />
                </button>
                <button
                  onClick={ttsPlaying ? onTTSPause : onTTSPlay}
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: ttsPlaying ? accentCol : inkCol,
                    color: paperBg,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'background .15s',
                  }}
                >
                  {ttsPlaying ? <IconPause /> : <IconPlay />}
                </button>
              </div>
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
