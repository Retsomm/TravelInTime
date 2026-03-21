import { create } from 'zustand'

export type Script = 'tc' | 'sc'

export const FONT_OPTIONS = [
  { label: '蘋方', value: '"PingFang TC", "PingFang SC", sans-serif' },
  { label: '宋體', value: '"STSong", "Songti TC", "SimSun", serif' },
  { label: '楷體', value: '"STKaiti", "Kaiti TC", "KaiTi", cursive' },
  { label: '仿宋', value: '"STFangsong", "FangSong", serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
]

interface ReaderStore {
  fontSize: number
  fontFamily: string
  script: Script
  lineHeight: number
  letterSpacing: number
  setFontSize: (n: number) => void
  setFontFamily: (f: string) => void
  setScript: (s: Script) => void
  resetScript: () => void
  setLineHeight: (n: number) => void
  setLetterSpacing: (n: number) => void
}

export const useReaderStore = create<ReaderStore>((set) => ({
  fontSize: 16,
  fontFamily: FONT_OPTIONS[0].value,
  script: 'tc',
  lineHeight: 1.8,
  letterSpacing: 0,
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setScript: (script) => set({ script }),
  resetScript: () => set({ script: 'tc' }),
  setLineHeight: (lineHeight) => set({ lineHeight }),
  setLetterSpacing: (letterSpacing) => set({ letterSpacing }),
}))
