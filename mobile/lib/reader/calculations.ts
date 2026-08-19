import type { Annotation } from '../../services/annotationService';
import type { Bookmark } from '../../services/bookmarkService';
import type { TTSVoice } from '../tts';

export const isBookmarked = (bookmarks: Bookmark[], cfi: string): boolean =>
  bookmarks.some((b) => b.cfi === cfi);

export const toggleBookmarkList = (bookmarks: Bookmark[], cfi: string, newBookmark: Bookmark): Bookmark[] =>
  bookmarks.some((b) => b.cfi === cfi) ? bookmarks.filter((b) => b.cfi !== cfi) : [...bookmarks, newBookmark];

export const removeBookmarkList = (bookmarks: Bookmark[], bookmarkId: string): Bookmark[] =>
  bookmarks.filter((b) => b.id !== bookmarkId);

export const addAnnotationList = (annotations: Annotation[], annotation: Annotation): Annotation[] => [
  ...annotations,
  annotation,
];

export const updateAnnotationColorList = (annotations: Annotation[], annotationId: string, color: string): Annotation[] =>
  annotations.map((a) => (a.id === annotationId ? { ...a, color } : a));

export const removeAnnotationList = (annotations: Annotation[], annotationId: string): Annotation[] =>
  annotations.filter((a) => a.id !== annotationId);

export const updateAnnotationNoteList = (annotations: Annotation[], annotationId: string, note: string): Annotation[] =>
  annotations.map((a) => (a.id === annotationId ? { ...a, note: note.trim() || undefined } : a));

export const cycleSleepOption = (current: number, options: readonly number[]): number => {
  const idx = options.indexOf(current);
  return options[(idx + 1) % options.length];
};

export const shouldOpenExternally = (url: string): boolean => url.startsWith('http://') || url.startsWith('https://');

export const formatPageProgress = (
  pageInfo: { page: number; total: number; percentage: number } | null
): { page: number; total: number; percent: number } | null =>
  pageInfo ? { page: pageInfo.page, total: pageInfo.total, percent: Math.round(pageInfo.percentage * 100) } : null;

// 手機系統 TTS 引擎對單次 utterance 的文字長度可能有限制（比照網頁版 useTTS.ts 的
// MAX_UTTERANCE_LENGTH 保護），過長文字先按標點切成多段，依序朗讀。
const MAX_UTTERANCE_LENGTH = 3000;

export const splitTextByLength = (text: string): string[] => {
  if (text.length <= MAX_UTTERANCE_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let chunk = remaining.slice(0, MAX_UTTERANCE_LENGTH);
    const lastPunctIdx = Math.max(
      chunk.lastIndexOf('。'),
      chunk.lastIndexOf('，'),
      chunk.lastIndexOf('！'),
      chunk.lastIndexOf('？'),
      chunk.lastIndexOf('；'),
      chunk.lastIndexOf('\n')
    );
    if (lastPunctIdx > MAX_UTTERANCE_LENGTH * 0.7) chunk = chunk.slice(0, lastPunctIdx + 1);
    chunks.push(chunk);
    remaining = remaining.slice(chunk.length);
  }
  return chunks.length > 0 ? chunks : [text];
};

// Android 上 expo-speech 回傳的語音沒有像 iOS 那樣的人類可讀名稱（name 常常就是
// identifier 本身，例如 "zh-TW-language"、"cmn-cn-x-cce-local"）。不用語言代碼標地區
// （例如「中國」／「台灣」），一律用同一個通用標籤＋編號區分，避免地區用字的爭議。
const GENERIC_CHINESE_VOICE_LABEL = '中文語音';

export const withFriendlyLabels = (list: TTSVoice[]): TTSVoice[] =>
  list.map((v, i) => ({
    ...v,
    name: list.length > 1 ? `${GENERIC_CHINESE_VOICE_LABEL} ${i + 1}` : GENERIC_CHINESE_VOICE_LABEL,
  }));

// 實測發現 Android 上同一個語言（例如 zh-TW）常常同時列出好幾組不同合成引擎的變體
// （ccc/ccd/cce/ssa/ctc/ctd/cte...），還各自有 -local（離線）／-network（連網）兩份，
// 光是中文相關語音就有十幾筆，使用者體感是「選項多到不知道選哪個」。實際上使用者只在意
// 「腔調（語言）」而不是背後合成引擎，所以每個 language 只保留一筆代表（呼叫前已把
// -local 排到前面，所以每個語言留下來的會是離線版本），比照 iOS 只留「婷婷／美佳」兩個
// 選項的精神。
export const dedupeByLanguage = (list: TTSVoice[]): TTSVoice[] => {
  const seen = new Set<string>();
  const result: TTSVoice[] = [];
  for (const v of list) {
    if (seen.has(v.language)) continue;
    seen.add(v.language);
    result.push(v);
  }
  return result;
};
