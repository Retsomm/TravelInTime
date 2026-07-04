export type InboundMessage =
  | { type: 'load'; base64: string; cfi: string | null }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'extractMeta'; base64: string };

export type OutboundMessage =
  | { type: 'ready' }
  | { type: 'relocated'; cfi: string; page: number; total: number; percentage: number; atStart: boolean; atEnd: boolean }
  | { type: 'error'; message: string }
  | { type: 'debug'; message: string }
  | { type: 'metaExtracted'; title: string; author: string; coverBase64: string | null; coverMediaType: string | null }
  | { type: 'metaError'; message: string };
