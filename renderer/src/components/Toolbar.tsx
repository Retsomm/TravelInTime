import { useState } from 'react'

const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const IconChapters = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)

const IconNotes = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
)

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

const IconBack = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)
import { FONT_OPTIONS } from '../store/useReaderStore'
import type { Script } from '../store/useReaderStore'

export type { Script }
export { FONT_OPTIONS }

interface Props {
  onBack: () => void
  bookTitle?: string
  fontSize: number
  onFontSizeChange: (size: number) => void
  fontFamily: string
  onFontChange: (font: string) => void
  script: Script
  onScriptToggle: () => void
  darkMode: boolean
  onToggleDark: () => void
  onToggleNotes: () => void
  onToggleChapters: () => void
  activePanel: 'notes' | 'chapters' | null
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

const Toolbar = ({
  onBack,
  bookTitle,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontChange,
  script,
  onScriptToggle,
  darkMode,
  onToggleDark,
  onToggleNotes,
  onToggleChapters,
  activePanel,
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
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="drag-region flex items-center gap-2 pl-20 pr-4 py-2 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-gray-800">
      <button
        className="no-drag p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition text-stone-600 dark:text-stone-300 shrink-0"
        onClick={onBack}
        aria-label="返回書庫"
        title="返回書庫"
      >
        <IconBack />
      </button>

      <div className="flex-1 flex justify-center overflow-hidden">
        {bookTitle && (
          <span className="text-xs text-stone-400 dark:text-stone-500 truncate select-none pointer-events-none">
            {bookTitle}
          </span>
        )}
      </div>

      {/* 設定按鈕 */}
      <div className="no-drag relative">
        <button
          className={`p-2 rounded transition text-stone-500 dark:text-stone-400 ${
            showSettings
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
              : 'hover:bg-stone-100 dark:hover:bg-stone-700'
          }`}
          onClick={() => setShowSettings((v) => !v)}
          aria-label="樣式與語音設定"
          title="樣式與語音設定"
        >
          <IconSettings />
        </button>

        {showSettings && (
          <>
            {/* 點擊背景關閉 */}
            <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />

            {/* 設定面板 */}
            <div className="absolute top-full right-0 mt-2 z-50 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-stone-200 dark:border-stone-700 p-4 flex flex-col gap-4">

              {/* 字體設定 */}
              <section>
                <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-2">字體</p>
                <div className="flex items-center gap-2 mb-2">
                  <select
                    className="flex-1 text-sm rounded-lg px-2 py-1.5 bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-200 border-none outline-none cursor-pointer"
                    value={fontFamily}
                    onChange={(e) => onFontChange(e.target.value)}
                    aria-label="選擇字體"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
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
                  <div key={label} className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-stone-500 dark:text-stone-400 shrink-0 w-12">{label}</span>
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
                  className="mt-3 w-full py-1 rounded-lg text-xs text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-600 dark:hover:text-stone-300 transition"
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
                  <select
                    className="w-full text-sm rounded-lg px-2 py-1.5 bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-200 border-none outline-none cursor-pointer mb-2"
                    value={ttsSelectedVoice?.name ?? ''}
                    onChange={(e) => {
                      const v = ttsVoices.find((v) => v.name === e.target.value)
                      if (v) onTTSVoiceChange(v)
                    }}
                    aria-label="選擇語音"
                  >
                    {ttsVoices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name.replace(/^(Google|Microsoft|Apple)\s*/i, '')}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-2">
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
                <div className="mt-3">
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
                  className={`mt-2 w-full py-1.5 rounded-lg text-sm font-medium transition ${
                    ttsPlaying
                      ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/60 dark:text-red-300'
                      : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'
                  }`}
                  onClick={ttsPlaying ? onTTSStop : onTTSPlay}
                  aria-label={ttsPlaying ? '停止朗讀' : '朗讀本頁'}
                >
                  {ttsPlaying ? '⏹ 停止朗讀' : '🔊 朗讀本頁'}
                </button>
              </section>
            </div>
          </>
        )}
      </div>

      <button
        className={`no-drag p-2 rounded transition text-stone-500 dark:text-stone-400 ${
          activePanel === 'chapters'
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
            : 'hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
        onClick={onToggleChapters}
        aria-label="切換章節目錄"
        title="章節目錄"
      >
        <IconChapters />
      </button>
      <button
        className={`no-drag p-2 rounded transition text-stone-500 dark:text-stone-400 ${
          activePanel === 'notes'
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
            : 'hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
        onClick={onToggleNotes}
        aria-label="切換註記面板"
        title="我的註記"
      >
        <IconNotes />
      </button>
      <button
        className="no-drag p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition text-stone-500 dark:text-stone-400"
        onClick={onToggleDark}
        aria-label={darkMode ? '切換淺色模式' : '切換深色模式'}
      >
        {darkMode ? <IconSun /> : <IconMoon />}
      </button>
    </div>
  )
}

export default Toolbar
