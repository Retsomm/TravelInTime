import { create } from 'zustand'

export type Script = 'tc' | 'sc'
export type ReadingDirection = 'ltr' | 'rtl'

export const FONT_OPTIONS = [
  { label: '蘋方', value: '"PingFang TC", "PingFang SC", sans-serif' },
  { label: '宋體', value: '"STSong", "Songti TC", "SimSun", serif' },
  { label: '楷體', value: '"STKaiti", "Kaiti TC", "KaiTi", cursive' },
  { label: '黑體', value: '"Heiti TC", "STHeiti", "Microsoft JhengHei", "SimHei", sans-serif' },
  { label: '明體', value: '"LiSong Pro", "Apple LiSung Light", "PMingLiU", "MingLiU", serif' },
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
