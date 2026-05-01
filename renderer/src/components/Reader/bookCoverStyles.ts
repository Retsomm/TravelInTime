export const SERIF = '"Source Serif 4", "Noto Serif TC", Georgia, serif'
export const MONO  = '"JetBrains Mono", ui-monospace, monospace'

export const COVER_STYLES = [
  { bg: 'oklch(0.92 0.04 80)',  ink: 'oklch(0.35 0.06 60)',  rule: 'oklch(0.68 0.08 55)' },
  { bg: 'oklch(0.86 0.04 65)',  ink: 'oklch(0.30 0.04 50)',  rule: 'oklch(0.55 0.06 40)' },
  { bg: 'oklch(0.30 0.06 260)', ink: 'oklch(0.92 0.02 260)', rule: 'oklch(0.72 0.10 260)' },
  { bg: 'oklch(0.42 0.05 150)', ink: 'oklch(0.95 0.02 140)', rule: 'oklch(0.78 0.08 145)' },
  { bg: 'oklch(0.88 0.04 20)',  ink: 'oklch(0.35 0.06 15)',  rule: 'oklch(0.62 0.12 20)' },
  { bg: 'oklch(0.45 0.02 250)', ink: 'oklch(0.95 0.01 250)', rule: 'oklch(0.80 0.04 250)' },
]
export const coverStyleFor = (id: string) => COVER_STYLES[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COVER_STYLES.length]
export const formatDate = (ts: number) =>
  ts ? new Date(ts).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '—'

