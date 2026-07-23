import { FONT_OPTIONS } from '@/store/useReaderStore'
import type { Script } from '@/store/useReaderStore'
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
  onScriptToggle: (target: Script) => void
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
}

const segBgClass = 'bg-paper-2 border border-border rounded-lg p-0.5 flex gap-0.5'

const SettingsPanel = ({
  fontSize, onFontSizeChange, fontFamily, onFontChange,
  script, onScriptToggle, readingDirection, onReadingDirectionChange,
  ttsPlaying, ttsPaused, onTTSPlay, onTTSPause, onTTSReset, ttsVoices, ttsSelectedVoice, onTTSVoiceChange,
  ttsRate, onTTSRateChange, ttsSleepMinutes, onTTSSleepChange, ttsSleepRemaining,
  lineHeight, onLineHeightChange, letterSpacing, onLetterSpacingChange,
}: Props) => {
  const ttsIdle = !ttsPlaying && !ttsPaused

  return (
    <div className="w-80 shrink-0 h-full border-l border-border bg-paper flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <div className="font-ui-serif text-[17px] font-medium tracking-[0.01em] text-ink">排版與語音</div>
      </div>

      {/* 桌面版朗讀中/已暫停時，底部會多一條 position:fixed 的朗讀控制列（見 Reader.tsx），
          它不佔 flex 版面空間，所以這裡要額外補一段 padding-bottom 讓內容不被蓋住；
          手機版朗讀列是正常排版流的元素，本來就會被 flex 版面扣掉，不需要額外處理。 */}
      <div
        className={`flex-1 overflow-y-auto min-h-0 pt-5 px-5 flex flex-col gap-6 ${ttsPlaying || ttsPaused ? 'pb-5 md:pb-16' : 'pb-5'}`}
      >

        {/* ── 字體 ── */}
        <section>
          <SectTitle>字體</SectTitle>

          {/* Font list */}
          <div className="border border-border rounded-[10px] bg-paper p-1 flex flex-col gap-0.5 mb-3">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => onFontChange(f.value)}
                style={{ fontFamily: f.value }}
                className={`flex items-center justify-between py-2.25 px-3 rounded-lg text-left text-sm cursor-pointer transition-colors duration-120 ${
                  fontFamily === f.value ? 'bg-paper-2 text-ink' : 'text-ink-2 hover:bg-paper-2'
                }`}
              >
                <span>{f.label}</span>
                {fontFamily === f.value && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* TC/SC + LTR/RTL */}
          <div className="flex gap-2 mb-4">
            <div className={`${segBgClass} flex-1`}>
              <SegBtn active={script === 'tc'} onClick={() => onScriptToggle('tc')}>繁體</SegBtn>
              <SegBtn active={script === 'sc'} onClick={() => onScriptToggle('sc')}>簡體</SegBtn>
            </div>
            <div className={`${segBgClass} flex-1`}>
              <SegBtn active={readingDirection === 'ltr'} onClick={() => onReadingDirectionChange('ltr')}>左→右</SegBtn>
              <SegBtn active={readingDirection === 'rtl'} onClick={() => onReadingDirectionChange('rtl')}>右→左</SegBtn>
            </div>
          </div>

          {/* Steppers */}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-center mb-3">
            {[
              { label: '字體大小', value: `${fontSize}px`, onDec: () => onFontSizeChange(Math.max(12, fontSize - 1)), onInc: () => onFontSizeChange(Math.min(32, fontSize + 1)) },
              { label: '行距', value: lineHeight.toFixed(1), onDec: () => onLineHeightChange(parseFloat(Math.max(1.0, lineHeight - 0.1).toFixed(1))), onInc: () => onLineHeightChange(parseFloat(Math.min(3.0, lineHeight + 0.1).toFixed(1))) },
              { label: '字距', value: `${letterSpacing.toFixed(2)}em`, onDec: () => onLetterSpacingChange(parseFloat(Math.max(0, letterSpacing - 0.05).toFixed(2))), onInc: () => onLetterSpacingChange(parseFloat(Math.min(0.5, letterSpacing + 0.05).toFixed(2))) },
            ].map(({ label, value, onDec, onInc }) => (
              <div key={label} className="contents">
                <span className="text-[13px] text-ink-2">{label}</span>
                <NumStepper value={value} onDec={onDec} onInc={onInc} />
              </div>
            ))}
          </div>

          <button
            onClick={() => { onFontSizeChange(16); onLineHeightChange(1.8); onLetterSpacingChange(0) }}
            className="w-full h-7.5 rounded-lg text-xs text-ink-3 font-[inherit] cursor-pointer transition-colors duration-120 hover:bg-paper-2"
          >
            重設預設值
          </button>
        </section>

        <div className="border-t border-border" />

        {/* ── 語音朗讀 ── */}
        <section>
          <SectTitle>語音朗讀</SectTitle>

          {ttsVoices.length > 0 && (
            <div className="mb-3.5">
              <CustomSelect
                value={ttsSelectedVoice?.name ?? ''}
                options={ttsVoices.map((v) => ({ value: v.name, label: v.name.replace(/^(Google|Microsoft|Apple)\s*/i, '') }))}
                onChange={(name) => { const v = ttsVoices.find((v) => v.name === name); if (v) onTTSVoiceChange(v) }}
                ariaLabel="選擇語音"
              />
            </div>
          )}

          {/* TTS play card */}
          <div className="border border-border rounded-[10px] p-3.5 bg-paper mb-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-ui-serif text-[15px] text-ink">{ttsPlaying ? '正在朗讀' : ttsPaused ? '已暫停' : '準備朗讀'}</div>
                <div className="text-[11px] text-ink-3 mt-0.5">
                  {ttsSelectedVoice?.name.replace(/^(Google|Microsoft|Apple)\s*/i, '') || '系統語音'} · {ttsRate.toFixed(1)}×
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onTTSReset}
                  disabled={ttsIdle}
                  className={`w-8.5 h-8.5 rounded-full bg-paper-2 border border-border inline-flex items-center justify-center transition-all duration-150 ${
                    ttsIdle ? 'text-ink-3 cursor-default opacity-45' : 'text-ink-2 cursor-pointer opacity-100'
                  }`}
                  aria-label="重置朗讀進度"
                  title="重置朗讀進度"
                >
                  <IconReset />
                </button>
                <button
                  onClick={ttsPlaying ? onTTSPause : onTTSPlay}
                  aria-label={ttsPlaying ? '暫停朗讀' : '開始朗讀'}
                  className={`w-11 h-11 rounded-full inline-flex items-center justify-center cursor-pointer transition-colors duration-150 text-paper ${ttsPlaying ? 'bg-accent' : 'bg-ink'}`}
                >
                  {ttsPlaying ? <IconPause /> : <IconPlay />}
                </button>
              </div>
            </div>

            <div className="mt-3.5 flex items-center gap-2.5">
              <label htmlFor="tts-rate" className="text-xs text-ink-3 w-7 shrink-0">語速</label>
              <input
                id="tts-rate"
                type="range" min="0.5" max="2" step="0.1" value={ttsRate}
                onChange={(e) => onTTSRateChange(+e.target.value)}
                className="flex-1 accent-accent"
              />
              <span className="font-ui-mono text-[11px] text-ink-2 w-8 text-right">
                {ttsRate.toFixed(1)}×
              </span>
            </div>
          </div>

          {/* Sleep timer */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-ink-3">睡眠計時</span>
              {ttsSleepRemaining !== null && (
                <span className="font-ui-mono text-[11px] text-accent">
                  {String(Math.floor(ttsSleepRemaining / 60)).padStart(2, '0')}:{String(ttsSleepRemaining % 60).padStart(2, '0')}
                </span>
              )}
            </div>
            <div className={`${segBgClass} grid grid-cols-5`}>
              {([0, 15, 30, 45, 60] as const).map((m) => (
                <SegBtn key={m} active={ttsSleepMinutes === m} onClick={() => onTTSSleepChange(m)}>
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
