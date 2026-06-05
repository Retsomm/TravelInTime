export interface ThemeColors {
  paperBg: string
  paperBg2: string
  borderCol: string
  inkCol: string
  ink2Col: string
  ink3Col: string
  accentCol: string
}

export const useThemeColors = (darkMode?: boolean): ThemeColors => ({
  paperBg:   darkMode ? '#1a1816' : '#f9f7f2',
  paperBg2:  darkMode ? '#231f1c' : '#f1ede4',
  borderCol: darkMode ? '#3a3430' : '#e4ddd0',
  inkCol:    darkMode ? '#e8e0d4' : '#2a2420',
  ink2Col:   darkMode ? '#b8afa4' : '#5a4e44',
  ink3Col:   darkMode ? '#7a706a' : '#9a8f80',
  accentCol: 'oklch(0.62 0.14 40)',
})
