import { create } from 'zustand'

export type Script = 'tc' | 'sc'
export type ReadingDirection = 'ltr' | 'rtl'

export const FONT_OPTIONS = [
  { label: '思源宋體', value: '"Noto Serif TC", serif' },
  { label: '霞鶩文楷', value: '"LXGW WenKai TC", cursive' },
  { label: '思源黑體', value: '"Noto Sans TC", sans-serif' },
  { label: '粉圓體', value: '"Huninn", sans-serif' },
]

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
}

export const useReaderStore = create<ReaderStore>((set) => ({
  fontSize: 16,
  fontFamily: FONT_OPTIONS[0].value,
  script: 'tc',
  lineHeight: 1.8,
  letterSpacing: 0,
  readingDirection: 'ltr',
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setScript: (script) => set({ script }),
  resetScript: () => set({ script: 'tc' }),
  setLineHeight: (lineHeight) => set({ lineHeight }),
  setLetterSpacing: (letterSpacing) => set({ letterSpacing }),
  setReadingDirection: (readingDirection) => set({ readingDirection }),
}))
