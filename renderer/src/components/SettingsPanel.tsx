import { useEffect, useRef, useState } from 'react'
import { FONT_OPTIONS } from '../store/useReaderStore'
import type { Script } from '../store/useReaderStore'

interface SelectOption { label: string; value: string }

const CustomSelect = ({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  ariaLabel?: string
  className?: string
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
    const estimatedHeight = Math.min(options.length * 32 + 8, 240)
    const showAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      ...(showAbove
        ? { bottom: window.innerHeight - rect.top, top: 'auto' }
        : { top: rect.bottom, bottom: 'auto' }),
      zIndex: 9999,
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="w-full flex items-center justify-between text-sm rounded-lg pl-2 pr-2 py-1.5 bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-200 cursor-pointer text-left"
        onClick={() => open ? setOpen(false) : openDropdown()}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <svg className="shrink-0 ml-1 text-stone-400 dark:text-stone-500" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          style={dropdownStyle}
          className="bg-white dark:bg-stone-800 rounded-lg shadow-lg border border-stone-200 dark:border-stone-600 overflow-y-auto max-h-60 py-1"
          role="listbox"
        >
          {options.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`px-3 py-1.5 text-sm cursor-pointer ${
                o.value === value
                  ? 'bg-stone-100 dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-medium'
                  : 'text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'
              }`}
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
}

const SettingsPanel = ({
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontChange,
  script,
  onScriptToggle,
  readingDirection,
  onReadingDirectionChange,
  ttsPlaying,
  onTTSPlay,
  onTTSStop,
  ttsVoices,
  ttsSelectedVoice,
  onTTSVoiceChange,
  ttsRate,
  onTTSRateChange,
  ttsSleepMinutes,
  onTTSSleepChange,
  ttsSleepRemaining,
  lineHeight,
  onLineHeightChange,
  letterSpacing,
  onLetterSpacingChange,
}: Props) => {
  return (
    <div className="w-80 border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-gray-800 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700 shrink-0">
        <h2 className="font-semibold text-stone-700 dark:text-stone-200">排版與語音</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">

        {/* 字體設定 */}
        <section>
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-2">字體</p>
          <div className="flex items-center gap-2 mb-3">
            <CustomSelect
              className="flex-1"
              value={fontFamily}
              options={FONT_OPTIONS}
              onChange={onFontChange}
              ariaLabel="選擇字體"
            />
            <button
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition shrink-0 ${
                script === 'tc'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                  : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
              }`}
              onClick={onScriptToggle}
              title={script === 'tc' ? '切換至簡體' : '切換至繁體'}
            >
              {script === 'tc' ? '繁體' : '簡體'}
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition shrink-0 ${
                readingDirection === 'ltr'
                  ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                  : 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'
              }`}
              onClick={() => onReadingDirectionChange(readingDirection === 'ltr' ? 'rtl' : 'ltr')}
              title={readingDirection === 'ltr' ? '切換至右翻（RTL）' : '切換至左翻（LTR）'}
            >
              {readingDirection === 'ltr' ? '左→右' : '右→左'}
            </button>
          </div>

          {[
            {
              label: '字體大小',
              value: `${fontSize}px`,
              onDec: () => onFontSizeChange(Math.max(12, fontSize - 1)),
              onInc: () => onFontSizeChange(Math.min(32, fontSize + 1)),
              decLabel: '縮小字體', incLabel: '放大字體',
            },
            {
              label: '行距',
              value: lineHeight.toFixed(1),
              onDec: () => onLineHeightChange(parseFloat(Math.max(1.0, lineHeight - 0.1).toFixed(1))),
              onInc: () => onLineHeightChange(parseFloat(Math.min(3.0, lineHeight + 0.1).toFixed(1))),
              decLabel: '縮小行距', incLabel: '增加行距',
            },
            {
              label: '字距',
              value: `${letterSpacing.toFixed(2)}em`,
              onDec: () => onLetterSpacingChange(parseFloat(Math.max(0, letterSpacing - 0.05).toFixed(2))),
              onInc: () => onLetterSpacingChange(parseFloat(Math.min(0.5, letterSpacing + 0.05).toFixed(2))),
              decLabel: '縮小字距', incLabel: '增加字距',
            },
          ].map(({ label, value, onDec, onInc, decLabel, incLabel }) => (
            <div key={label} className="flex items-center gap-2 mb-2">
              <span className="text-xs text-stone-500 dark:text-stone-400 w-14 shrink-0">{label}</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 transition text-stone-600 dark:text-stone-300 text-sm"
                  onClick={onDec}
                  aria-label={decLabel}
                >−</button>
                <span className="text-sm text-stone-600 dark:text-stone-300 w-14 text-center">{value}</span>
                <button
                  className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 transition text-stone-600 dark:text-stone-300 text-sm"
                  onClick={onInc}
                  aria-label={incLabel}
                >＋</button>
              </div>
            </div>
          ))}

          <button
            className="mt-1 w-full py-1 rounded-lg text-xs text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-600 dark:hover:text-stone-300 transition"
            onClick={() => {
              onFontSizeChange(16)
              onLineHeightChange(1.8)
              onLetterSpacingChange(0)
            }}
            aria-label="重設排版設定"
          >
            重設預設值
          </button>
        </section>

        <div className="border-t border-stone-100 dark:border-stone-700" />

        {/* 語音朗讀 */}
        <section>
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-2">語音朗讀</p>

          {ttsVoices.length > 0 && (
            <CustomSelect
              className="mb-3"
              value={ttsSelectedVoice?.name ?? ''}
              options={ttsVoices.map((v) => ({
                value: v.name,
                label: v.name.replace(/^(Google|Microsoft|Apple)\s*/i, ''),
              }))}
              onChange={(name) => {
                const v = ttsVoices.find((v) => v.name === name)
                if (v) onTTSVoiceChange(v)
              }}
              ariaLabel="選擇語音"
            />
          )}

          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-stone-500 dark:text-stone-400 shrink-0">語速</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 transition text-stone-600 dark:text-stone-300 text-sm"
                onClick={() => onTTSRateChange(Math.max(0.5, parseFloat((ttsRate - 0.1).toFixed(1))))}
                aria-label="減慢語速"
              >
                −
              </button>
              <span className="text-sm text-stone-600 dark:text-stone-300 w-10 text-center">{ttsRate.toFixed(1)}×</span>
              <button
                className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 transition text-stone-600 dark:text-stone-300 text-sm"
                onClick={() => onTTSRateChange(Math.min(2.0, parseFloat((ttsRate + 0.1).toFixed(1))))}
                aria-label="加快語速"
              >
                ＋
              </button>
            </div>
          </div>

          {/* 睡眠計時器 */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-stone-500 dark:text-stone-400">睡眠計時</span>
              {ttsSleepRemaining !== null && (
                <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                  {String(Math.floor(ttsSleepRemaining / 60)).padStart(2, '0')}:{String(ttsSleepRemaining % 60).padStart(2, '0')}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {([0, 15, 30, 45, 60] as const).map((m) => (
                <button
                  key={m}
                  className={`flex-1 py-1 rounded-lg text-xs transition ${
                    ttsSleepMinutes === m
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 font-medium'
                      : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-600'
                  }`}
                  onClick={() => onTTSSleepChange(m)}
                  aria-label={m === 0 ? '關閉睡眠計時' : `${m}分鐘後停止`}
                >
                  {m === 0 ? '關' : `${m}`}
                </button>
              ))}
            </div>
          </div>

          <button
            className={`w-full py-2 rounded-lg text-sm font-medium transition ${
              ttsPlaying
                ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/60 dark:text-red-300'
                : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'
            }`}
            onClick={ttsPlaying ? onTTSStop : onTTSPlay}
            aria-label={ttsPlaying ? '停止朗讀' : '開始朗讀'}
          >
            {ttsPlaying ? '⏹ 停止朗讀' : '開始朗讀'}
          </button>
        </section>
      </div>
    </div>
  )
}

export default SettingsPanel
