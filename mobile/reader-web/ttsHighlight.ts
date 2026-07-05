// 朗讀跟讀高亮／頁面邊界量測：整套演算法照抄網頁版
// pwa/src/components/Reader/ttsHighlight.ts（文字節點索引、CSS Custom Highlight API +
// DOM overlay 降級、CFI→字元位移換算），這裡是給 mobile 的 reader-web bundle（跑在
// RN WebView 內的 epub.js 環境）用的獨立版本，因為 mobile 沒有 React，且訊息協定跟網頁版
// 完全不同，無法直接共用檔案。

const TTS_HIGHLIGHT_ID = 'tit-tts-progress';
const TTS_HIGHLIGHT_STYLE_ID = 'tit-tts-progress-style';
const TTS_HIGHLIGHT_OVERLAY_ID = 'tit-tts-progress-overlay';
const TTS_HIGHLIGHT_LENGTH = 4;

type TextIndex = { nodes: Text[]; starts: number[]; total: number; text: string };
const ttsTextIndexCache = new WeakMap<Document, TextIndex>();

const injectStyleTag = (doc: Document, id: string, css: string) => {
  let el = doc.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement('style');
    el.id = id;
    doc.head?.appendChild(el);
  }
  el.textContent = css;
};

export const ensureTTSHighlightStyle = (doc: Document) => {
  injectStyleTag(doc, TTS_HIGHLIGHT_STYLE_ID, `
    ::highlight(${TTS_HIGHLIGHT_ID}) {
      background-color: rgba(245, 158, 11, 0.32);
      color: inherit;
    }
  `);
};

export const clearTTSHighlight = (doc: Document | null | undefined) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlights = (doc?.defaultView as any)?.CSS?.highlights;
  highlights?.delete?.(TTS_HIGHLIGHT_ID);
  doc?.getElementById(TTS_HIGHLIGHT_OVERLAY_ID)?.remove();
};

// script/style 標籤底下的文字節點不算進朗讀文字（跟舊版 getChapterText 的
// cloneNode+querySelectorAll('script, style').remove() 是同一個過濾意圖，只是這裡改成
// 在即時 DOM 上用 TreeWalker 過濾，而不是先複製整份文件——因為畫底線用的 Range 必須指向
// 真正渲染中的節點，複製出來的 clone 節點無法拿來畫底線。
const isInScriptOrStyle = (node: Node): boolean => {
  let el = node.parentElement;
  while (el) {
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return true;
    el = el.parentElement;
  }
  return false;
};

export const getTextIndex = (doc: Document): TextIndex | null => {
  const cached = ttsTextIndexCache.get(doc);
  if (cached) return cached;
  const body = doc.body;
  if (!body) return null;

  const nodes: Text[] = [];
  const starts: number[] = [];
  const pieces: string[] = [];
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  let total = 0;
  while ((node = walker.nextNode())) {
    if (isInScriptOrStyle(node)) continue;
    const textNode = node as Text;
    const len = (textNode.nodeValue ?? '').length;
    if (len === 0) continue;
    nodes.push(textNode);
    starts.push(total);
    pieces.push(textNode.nodeValue ?? '');
    total += len;
  }

  const index = { nodes, starts, total, text: pieces.join('') };
  ttsTextIndexCache.set(doc, index);
  return index;
};

const findTextNodeAt = (index: TextIndex, offset: number) => {
  if (index.nodes.length === 0) return null;
  const safeOffset = Math.max(0, Math.min(offset, Math.max(index.total - 1, 0)));
  let lo = 0;
  let hi = index.starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = index.starts[mid];
    const end = start + (index.nodes[mid].nodeValue ?? '').length;
    if (safeOffset < start) hi = mid - 1;
    else if (safeOffset >= end) lo = mid + 1;
    else return { node: index.nodes[mid], offset: safeOffset - start };
  }
  const last = index.nodes.length - 1;
  return { node: index.nodes[last], offset: Math.max(0, (index.nodes[last].nodeValue ?? '').length - 1) };
};

const getTextOffsetFromRange = (doc: Document, range: Range | null | undefined, edge: 'start' | 'end'): number | null => {
  if (!range) return null;
  const index = getTextIndex(doc);
  if (!index) return null;

  const container = edge === 'end' ? range.endContainer : range.startContainer;
  const offset = edge === 'end' ? range.endOffset : range.startOffset;

  if (container.nodeType === Node.TEXT_NODE) {
    const textIdx = index.nodes.indexOf(container as Text);
    if (textIdx < 0) return null;
    const nodeLength = (container.nodeValue ?? '').length;
    return index.starts[textIdx] + Math.max(0, Math.min(offset, nodeLength));
  }

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNode = (edge === 'end' ? null : walker.nextNode()) as Text | null;
  if (textNode) {
    const textIdx = index.nodes.indexOf(textNode);
    return textIdx >= 0 ? index.starts[textIdx] : null;
  }

  let lastText: Text | null = null;
  let node: Node | null;
  while ((node = walker.nextNode())) lastText = node as Text;
  if (lastText) {
    const textIdx = index.nodes.indexOf(lastText);
    return textIdx >= 0 ? index.starts[textIdx] + (lastText.nodeValue ?? '').length : null;
  }

  return null;
};

// epub.js 的 getRange(cfi) 對頁面邊界 CFI 可能展開成一整個元素的 range，這種情況下
// range.end 常常會指到段落/元素結尾，讓「頁尾」的判斷變得太晚；統一取 range 起點當邊界
// 位置比較準（跟網頁版 getBoundaryOffsetFromRange 邏輯一致）。
export const getBoundaryOffsetFromRange = (doc: Document, range: Range | null | undefined, edge: 'start' | 'end'): number | null => {
  if (!range) return null;
  const startOffset = getTextOffsetFromRange(doc, range, 'start');
  const endOffset = getTextOffsetFromRange(doc, range, 'end');
  if (startOffset === null) return endOffset;
  if (endOffset === null) return startOffset;
  return edge === 'end' ? Math.min(startOffset, endOffset) : startOffset;
};

export const createRangeFromTextOffset = (doc: Document, start: number, length = TTS_HIGHLIGHT_LENGTH): Range | null => {
  const index = getTextIndex(doc);
  if (!index || index.total === 0) return null;

  const safeStart = Math.max(0, Math.min(start, index.total - 1));
  const startMatch = findTextNodeAt(index, safeStart);
  if (!startMatch) return null;

  const startNode = startMatch.node;
  const startOffset = Math.max(0, Math.min((startNode.nodeValue ?? '').length, startMatch.offset));
  const nodeText = startNode.nodeValue ?? '';
  let endOffset = Math.min(nodeText.length, startOffset + Math.max(1, length));
  const localText = nodeText.slice(startOffset, endOffset);
  const breakAt = localText.search(/[\n\r。！？!?；;，,、]/);
  if (breakAt > 0) endOffset = startOffset + breakAt;
  if (endOffset <= startOffset) endOffset = Math.min(nodeText.length, startOffset + 1);
  if (endOffset <= startOffset) return null;

  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(startNode, endOffset);
  return range;
};

export const paintTTSHighlightOverlay = (doc: Document, range: Range): boolean => {
  // 優先用 CSS Custom Highlight API：完全不動 DOM，避免觸發 epub.js 掛在 iframe
  // documentElement 上的 ResizeObserver（改 DOM 結構容易造成量測迴圈）。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = doc.defaultView as (Window & { CSS?: any; Highlight?: new (...ranges: Range[]) => unknown }) | null;
  if (win?.CSS?.highlights !== undefined && typeof win.Highlight === 'function') {
    try {
      const highlight = new win.Highlight(range);
      (win.CSS.highlights as Map<string, unknown>).set(TTS_HIGHLIGHT_ID, highlight);
      return true;
    } catch {
      /* 降級到 DOM overlay */
    }
  }

  const body = doc.body;
  if (!body) return false;

  let overlay = doc.getElementById(TTS_HIGHLIGHT_OVERLAY_ID);
  if (!overlay) {
    overlay = doc.createElement('div');
    overlay.id = TTS_HIGHLIGHT_OVERLAY_ID;
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2147483647',
      overflow: 'hidden',
    });
    body.appendChild(overlay);
  }

  const viewportWidth = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
  const viewportHeight = doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0;
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= viewportHeight && rect.right >= 0 && rect.left <= viewportWidth
  );

  overlay.replaceChildren();
  for (const rect of rects) {
    const mark = doc.createElement('div');
    Object.assign(mark.style, {
      position: 'fixed',
      left: `${Math.max(0, rect.left)}px`,
      top: `${Math.max(0, rect.top)}px`,
      width: `${Math.max(1, Math.min(rect.width, viewportWidth - Math.max(0, rect.left)))}px`,
      height: `${Math.max(1, Math.min(rect.height, viewportHeight - Math.max(0, rect.top)))}px`,
      background: 'rgba(245, 158, 11, 0.32)',
      borderRadius: '2px',
      pointerEvents: 'none',
    });
    overlay.appendChild(mark);
  }

  return rects.length > 0;
};
