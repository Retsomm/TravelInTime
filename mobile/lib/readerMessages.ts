export type InboundMessage =
  | { type: 'load'; base64: string; cfi: string | null }
  | { type: 'prev' }
  | { type: 'next' };

export type OutboundMessage =
  | { type: 'ready' }
  | { type: 'relocated'; cfi: string; page: number; total: number; atStart: boolean; atEnd: boolean }
  | { type: 'error'; message: string }
  | { type: 'debug'; message: string };
