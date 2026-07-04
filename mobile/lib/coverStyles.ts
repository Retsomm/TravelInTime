// 無封面時的佔位色卡（比照 renderer/src/components/Library/coverStyles.ts 的配色語言，
// 但用 RN 支援的 hex 值取代網頁版的 oklch() 字串，因為 RN 樣式引擎不認得 CSS 色彩函式）。
const COVER_STYLES = [
  { bg: '#ECE0C8', ink: '#5B4A34', rule: '#B9906A' },
  { bg: '#DCCBAE', ink: '#4A3B28', rule: '#9C7C52' },
  { bg: '#2B3A52', ink: '#E4E8EF', rule: '#7C93BD' },
  { bg: '#3E5C4A', ink: '#EAF3EC', rule: '#8FBFA0' },
  { bg: '#DCB6A0', ink: '#4A2E22', rule: '#B5654A' },
  { bg: '#455066', ink: '#EEF1F6', rule: '#A9B7CE' },
];

export const coverStyleFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COVER_STYLES[h % COVER_STYLES.length];
};

export const PROGRESS_TRACK_COLOR = '#E4DDD0';
export const PROGRESS_FILL_COLOR = '#C17A4A';
