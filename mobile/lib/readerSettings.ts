// 比照 renderer/src/store/useReaderStore.ts 的 FONT_OPTIONS，字型字串直接餵給 WebView 內的
// CSS font-family，數值必須跟網頁版一致（reader-web 用同一組字串去比對要不要注入 Google Fonts 連結）。
export const FONT_OPTIONS = [
  { label: '思源宋體', value: '"Noto Serif TC", serif' },
  { label: '霞鶩文楷', value: '"LXGW WenKai TC", cursive' },
  { label: '思源黑體', value: '"Noto Sans TC", sans-serif' },
  { label: '粉圓體', value: '"Huninn", sans-serif' },
];

export type Script = 'tc' | 'sc';
export type ReadingDirection = 'ltr' | 'rtl';

export interface TypographySettings {
  fontSize: number;
  fontFamily: string;
  script: Script;
  lineHeight: number;
  letterSpacing: number;
  readingDirection: ReadingDirection;
}

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontSize: 16,
  fontFamily: FONT_OPTIONS[0].value,
  script: 'tc',
  lineHeight: 1.8,
  letterSpacing: 0,
  readingDirection: 'ltr',
};

export const normalizeFontFamily = (family: string | null | undefined): string =>
  family && FONT_OPTIONS.some((option) => option.value === family) ? family : DEFAULT_TYPOGRAPHY.fontFamily;
