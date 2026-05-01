import { injectStyle } from '@/components/Reader/readerStyles'

const TTS_HIGHLIGHT_ID = 'tit-tts-progress'
const TTS_HIGHLIGHT_STYLE_ID = 'tit-tts-progress-style'
const TTS_HIGHLIGHT_OVERLAY_ID = 'tit-tts-progress-overlay'
export const TTS_HIGHLIGHT_INTERVAL = 80
export const TTS_USER_INPUT_GRACE = 180
const TTS_HIGHLIGHT_LENGTH = 4
const TTS_GEOMETRY_LINE_BUFFER = 0.9
export const TTS_NEW_PAGE_AUTO_FOLLOW_GUARD = 36
export const TTS_PAGE_END_FIXED_LEAD = 8
export const DEBUG_TTS_FOLLOW = false

type TextIndex = { nodes: Text[]; starts: number[]; total: number; text: string }
export type TTSRangeViewportState = {
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number } | null
  viewport: { width: number; height: number }
  lineHeight: number
  bottomGap: number | null
  leftGap: number | null
  rightGap: number | null
  hasUsableRect: boolean
  isVisible: boolean
  nearPageEnd: boolean
  outsidePage: boolean
  reason: 'visible' | 'near-bottom' | 'near-right-edge' | 'near-left-edge' | 'below-page' | 'right-of-page' | 'left-of-page' | 'no-rect' | 'no-viewport'
}
export const ttsTextIndexCache = new WeakMap<Document, TextIndex>()

export const ensureTTSHighlightStyle = (doc: Document) => {
  injectStyle(doc, TTS_HIGHLIGHT_STYLE_ID, `
    ::highlight(${TTS_HIGHLIGHT_ID}) {
      background-color: rgba(245, 158, 11, 0.32);
      color: inherit;
    }
  `)
}

export const clearTTSHighlight = (doc: Document | null | undefined) => {
  const highlights = (doc?.defaultView as any)?.CSS?.highlights
  highlights?.delete?.(TTS_HIGHLIGHT_ID)
  doc?.getElementById(TTS_HIGHLIGHT_OVERLAY_ID)?.remove()
}

export const clearTTSHighlights = (docs: Iterable<Document | null | undefined>) => {
  for (const doc of docs) clearTTSHighlight(doc)
}

export const collectContentDocuments = (viewer: HTMLElement | null, knownDocs: Iterable<Document>) => {
  const docs = new Set<Document>()
  for (const doc of knownDocs) docs.add(doc)
  viewer?.querySelectorAll('iframe').forEach((iframe) => {
    try {
      const doc = (iframe as HTMLIFrameElement).contentDocument
      if (doc) docs.add(doc)
    } catch { /* ignore cross-origin iframe */ }
  })
  return docs
}

export const getTextIndex = (doc: Document): TextIndex | null => {
  const cached = ttsTextIndexCache.get(doc)
  if (cached) return cached
  const body = doc.body
  if (!body) return null

  const nodes: Text[] = []
  const starts: number[] = []
  const pieces: string[] = []
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  let total = 0
  while ((node = walker.nextNode())) {
    const textNode = node as Text
    const len = (textNode.nodeValue ?? '').length
    if (len === 0) continue
    nodes.push(textNode)
    starts.push(total)
    pieces.push(textNode.nodeValue ?? '')
    total += len
  }

  const index = { nodes, starts, total, text: pieces.join('') }
  ttsTextIndexCache.set(doc, index)
  return index
}

const findTextNodeAt = (index: TextIndex, offset: number) => {
  if (index.nodes.length === 0) return null
  const safeOffset = Math.max(0, Math.min(offset, Math.max(index.total - 1, 0)))
  let lo = 0
  let hi = index.starts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const start = index.starts[mid]
    const end = start + (index.nodes[mid].nodeValue ?? '').length
    if (safeOffset < start) hi = mid - 1
    else if (safeOffset >= end) lo = mid + 1
    else return { node: index.nodes[mid], offset: safeOffset - start, index: mid }
  }
  const last = index.nodes.length - 1
  return {
    node: index.nodes[last],
    offset: Math.max(0, (index.nodes[last].nodeValue ?? '').length - 1),
    index: last,
  }
}

const getTextOffsetFromRange = (doc: Document, range: Range | null | undefined, edge: 'start' | 'end' = 'start'): number | null => {
  if (!range) return null
  const index = getTextIndex(doc)
  if (!index) return null

  const container = edge === 'end' ? range.endContainer : range.startContainer
  const offset = edge === 'end' ? range.endOffset : range.startOffset

  if (container.nodeType === Node.TEXT_NODE) {
    const textIdx = index.nodes.indexOf(container as Text)
    if (textIdx < 0) return null
    const nodeLength = (container.nodeValue ?? '').length
    return index.starts[textIdx] + Math.max(0, Math.min(offset, nodeLength))
  }

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const textNode = (edge === 'end' ? null : walker.nextNode()) as Text | null
  if (textNode) {
    const textIdx = index.nodes.indexOf(textNode)
    return textIdx >= 0 ? index.starts[textIdx] : null
  }

  let lastText: Text | null = null
  let node: Node | null
  while ((node = walker.nextNode())) lastText = node as Text
  if (lastText) {
    const textIdx = index.nodes.indexOf(lastText)
    return textIdx >= 0 ? index.starts[textIdx] + (lastText.nodeValue ?? '').length : null
  }

  return null
}

export const getBoundaryOffsetFromRange = (doc: Document, range: Range | null | undefined, edge: 'start' | 'end' = 'start'): number | null => {
  if (!range) return null
  const startOffset = getTextOffsetFromRange(doc, range, 'start')
  const endOffset = getTextOffsetFromRange(doc, range, 'end')
  if (startOffset === null) return endOffset
  if (endOffset === null) return startOffset

  // epub.js getRange(cfi) can expand to an element range. For page boundary CFIs,
  // the earlier text position is the actual page boundary; range.end may point
  // to the end of a paragraph/element and make auto-follow turn far too late.
  return edge === 'end' ? Math.min(startOffset, endOffset) : startOffset
}

export const createRangeFromTextOffset = (doc: Document, start: number, length = TTS_HIGHLIGHT_LENGTH): Range | null => {
  const index = getTextIndex(doc)
  if (!index || index.total === 0) return null

  const safeStart = Math.max(0, Math.min(start, index.total - 1))
  const startMatch = findTextNodeAt(index, safeStart)
  if (!startMatch) return null

  const startNode = startMatch.node
  const startOffset = Math.max(0, Math.min((startNode.nodeValue ?? '').length, startMatch.offset))
  const nodeText = startNode.nodeValue ?? ''
  let endOffset = Math.min(nodeText.length, startOffset + Math.max(1, length))
  const localText = nodeText.slice(startOffset, endOffset)
  const breakAt = localText.search(/[\n\r。！？!?；;，,、]/)
  if (breakAt > 0) endOffset = startOffset + breakAt
  if (endOffset <= startOffset) endOffset = Math.min(nodeText.length, startOffset + 1)
  if (endOffset <= startOffset) return null

  const range = doc.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(startNode, endOffset)
  return range
}


export const paintTTSHighlightOverlay = (doc: Document, range: Range) => {
  const body = doc.body
  if (!body) return false

  let overlay = doc.getElementById(TTS_HIGHLIGHT_OVERLAY_ID)
  if (!overlay) {
    overlay = doc.createElement('div')
    overlay.id = TTS_HIGHLIGHT_OVERLAY_ID
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2147483647',
      overflow: 'hidden',
      contain: 'layout style paint',
    })
    body.appendChild(overlay)
  }

  const viewportWidth = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0
  const viewportHeight = doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0
  const rects = Array.from(range.getClientRects())
    .filter((rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.top <= viewportHeight &&
      rect.right >= 0 &&
      rect.left <= viewportWidth
    )

  overlay.replaceChildren()
  for (const rect of rects) {
    const mark = doc.createElement('div')
    Object.assign(mark.style, {
      position: 'fixed',
      left: `${Math.max(0, rect.left)}px`,
      top: `${Math.max(0, rect.top)}px`,
      width: `${Math.max(1, Math.min(rect.width, viewportWidth - Math.max(0, rect.left)))}px`,
      height: `${Math.max(1, Math.min(rect.height, viewportHeight - Math.max(0, rect.top)))}px`,
      background: 'rgba(245, 158, 11, 0.32)',
      borderRadius: '2px',
      pointerEvents: 'none',
    })
    overlay.appendChild(mark)
  }

  return rects.length > 0
}

export const getTTSRangeViewportState = (doc: Document, range: Range | null): TTSRangeViewportState => {
  const viewportWidth = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0
  const viewportHeight = doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0
  const viewport = { width: viewportWidth, height: viewportHeight }
  if (!viewportWidth || !viewportHeight) {
    return {
      rect: null,
      viewport,
      lineHeight: 0,
      bottomGap: null,
      leftGap: null,
      rightGap: null,
      hasUsableRect: false,
      isVisible: false,
      nearPageEnd: false,
      outsidePage: false,
      reason: 'no-viewport',
    }
  }

  const rects = range
    ? Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0)
    : []
  const rawRect = rects.find((rect) =>
    rect.bottom >= 0 &&
    rect.top <= viewportHeight &&
    rect.right >= 0 &&
    rect.left <= viewportWidth
  ) ?? rects[0] ?? null

  if (!rawRect) {
    const hasRange = !!range
    return {
      rect: null,
      viewport,
      lineHeight: 0,
      bottomGap: null,
      leftGap: null,
      rightGap: null,
      hasUsableRect: false,
      isVisible: false,
      nearPageEnd: hasRange,
      outsidePage: hasRange,
      reason: 'no-rect',
    }
  }

  const rect = {
    left: rawRect.left,
    right: rawRect.right,
    top: rawRect.top,
    bottom: rawRect.bottom,
    width: rawRect.width,
    height: rawRect.height,
  }
  const lineHeight = Math.max(
    rect.height || 0,
    (() => {
      const container = range?.startContainer
      const element = container?.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container?.nodeType === Node.ELEMENT_NODE
          ? container as Element
          : null
      const value = element ? doc.defaultView?.getComputedStyle(element).lineHeight : null
      const parsed = value ? Number.parseFloat(value) : Number.NaN
      return Number.isFinite(parsed) ? parsed : 0
    })(),
    18
  )
  const bottomGap = viewportHeight - rect.bottom
  const leftGap = rect.left
  const rightGap = viewportWidth - rect.right
  const isVisible =
    rect.bottom >= 0 &&
    rect.top <= viewportHeight &&
    rect.right >= 0 &&
    rect.left <= viewportWidth
  const belowPage = rect.top >= viewportHeight || rect.bottom > viewportHeight + lineHeight * 0.35
  const rightOfPage = rect.left >= viewportWidth || rect.right > viewportWidth + lineHeight * 0.35
  const leftOfPage = rect.right <= 0 || rect.left < -lineHeight * 0.35
  const nearBottom = isVisible && bottomGap <= lineHeight * TTS_GEOMETRY_LINE_BUFFER
  const nearRightEdge = isVisible && rightGap <= lineHeight * TTS_GEOMETRY_LINE_BUFFER
  const nearLeftEdge = isVisible && leftGap <= lineHeight * TTS_GEOMETRY_LINE_BUFFER
  const isRtl = doc.documentElement.dir === 'rtl' || doc.body?.dir === 'rtl'
  const nearHorizontalPageEnd = isRtl ? nearLeftEdge : nearRightEdge
  const outsidePage = belowPage || rightOfPage || leftOfPage

  return {
    rect,
    viewport,
    lineHeight,
    bottomGap,
    leftGap,
    rightGap,
    hasUsableRect: true,
    isVisible,
    nearPageEnd: outsidePage || nearBottom || nearHorizontalPageEnd,
    outsidePage,
    reason: outsidePage
      ? (belowPage ? 'below-page' : rightOfPage ? 'right-of-page' : 'left-of-page')
      : nearBottom
        ? 'near-bottom'
        : nearHorizontalPageEnd
          ? (isRtl ? 'near-left-edge' : 'near-right-edge')
          : 'visible',
  }
}
