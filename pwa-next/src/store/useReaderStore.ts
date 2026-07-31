import { create } from 'zustand'

export type Script = 'tc' | 'sc'
export type ReadingDirection = 'ltr' | 'rtl'

export const FONT_OPTIONS = [
  { label: '思源宋體', value: '"Noto Serif TC", serif' },
  { label: '霞鶩文楷', value: '"LXGW WenKai TC", cursive' },
  { label: '思源黑體', value: '"Noto Sans TC", sans-serif' },
  { label: '粉圓體', value: '"Huninn", sans-serif' },
]

const DEFAULT_SETTINGS = {
  fontSize: 16,
  fontFamily: FONT_OPTIONS[0].value,
  script: 'tc' as Script,
  lineHeight: 1.8,
  letterSpacing: 0,
  readingDirection: 'ltr' as ReadingDirection,
}

interface ReaderStore {
  fontSize: number
  fontFamily: string
  script: Script
  lineHeight: number
  letterSpacing: number
  readingDirection: ReadingDirection
  setFontSize: (n: number) => void
  setFontFamily: (f: string) => void
  setScript: (s: Script) => void
  resetScript: () => void
  setLineHeight: (n: number) => void
  setLetterSpacing: (n: number) => void
  setReadingDirection: (d: ReadingDirection) => void
  // 開啟一本從未儲存過排版設定的書時，用來把 store 重設回預設值，避免沿用同一個 session
  // 裡前一本書留下的設定（尤其 readingDirection：前一本書若切成 rtl，沒有這個重設的話，
  // 下一本沒有自己存檔的書會直接沿用 rtl，導致內容莫名右對齊）。
  resetToDefaults: () => void
}

export const useReaderStore = create<ReaderStore>((set) => ({
  ...DEFAULT_SETTINGS,
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setScript: (script) => set({ script }),
  resetScript: () => set({ script: 'tc' }),
  setLineHeight: (lineHeight) => set({ lineHeight }),
  setLetterSpacing: (letterSpacing) => set({ letterSpacing }),
  setReadingDirection: (readingDirection) => set({ readingDirection }),
  resetToDefaults: () => set(DEFAULT_SETTINGS),
}))
