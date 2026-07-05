import type { Script, TypographySettings } from './readerSettings';

export interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

export type InboundMessage =
  | { type: 'load'; base64: string; cfi: string | null }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'goto'; target: string }
  | { type: 'extractMeta'; base64: string }
  | { type: 'setDarkMode'; darkMode: boolean }
  | ({ type: 'setTypography' } & TypographySettings)
  | { type: 'getChapterText' };

export type OutboundMessage =
  | { type: 'ready' }
  | { type: 'relocated'; cfi: string; href: string; page: number; total: number; percentage: number; atStart: boolean; atEnd: boolean; chapterTitle: string }
  | { type: 'error'; message: string }
  | { type: 'debug'; message: string }
  | { type: 'metaExtracted'; title: string; author: string; coverBase64: string | null; coverMediaType: string | null }
  | { type: 'metaError'; message: string }
  | { type: 'chapterText'; text: string }
  | { type: 'bookLanguageDetected'; baseScript: Script }
  | { type: 'tocLoaded'; toc: TocItem[] };
