import { useCallback, useEffect, useRef, useState } from 'react'
import ePub from 'epubjs'
import type { Book, Rendition } from 'epubjs'
import * as OpenCC from 'opencc-js'
import Toolbar from './Toolbar'
import NotePanel from './NotePanel'
import ChapterPanel from './ChapterPanel'
import type { TocItem } from './ChapterPanel'
import SettingsPanel from './SettingsPanel'
import useTTS from '../hooks/useTTS'
import { FONT_OPTIONS, useReaderStore } from '../store/useReaderStore'
import type { Script } from '../store/useReaderStore'
import { useAnnotationStore, loadAnnotationsForBook, saveAnnotationsForBook } from '../store/useAnnotationStore'
import { saveProgress, loadProgress, saveBookSettings, loadBookSettings, loadBookmarks, saveBookmarks } from '../hooks/useLibrary'
import type { BookRecord, Bookmark } from '../hooks/useLibrary'

let _toSC: ((s: string) => string) | null = null
let _toTC: ((s: string) => string) | null = null
const getToSC = () => { if (!_toSC) _toSC = OpenCC.Converter({ from: 'tw', to: 'cn' }); return _toSC }
const getToTC = () => { if (!_toTC) _toTC = OpenCC.Converter({ from: 'cn', to: 'tw' }); return _toTC }

// 各功能 CSS 注入完全獨立，使用不同的 <style> 標籤，互不干擾
const injectStyle = (doc: Document, id: string, css: string) => {
  let el = doc.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = doc.createElement('style')
    el.id = id
    doc.head?.appendChild(el)
  }
  el.textContent = css
}

const applyDarkOverride = (doc: Document, isDark: boolean) => {
  const bg = isDark ? '#1a1816' : '#f9f7f2'
  const color = isDark ? '#e5e7eb' : '#1c1917'
  const colorRule = isDark ? `* { color: ${color} !important; }` : ''
  injectStyle(doc, 'tit-dark', `html, body { background-color: ${bg} !important; } ${colorRule}`)
}

const WEB_FONT_URLS: Record<string, string> = {
  Huninn: 'https://fonts.googleapis.com/css2?family=Huninn&display=swap',
  'Noto Serif TC': 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC&display=swap',
  'Noto Sans TC': 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC&display=swap',
  'LXGW WenKai TC': 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&display=swap',
}

const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0].value

const normalizeFontFamily = (family: string | null | undefined): string =>
  family && FONT_OPTIONS.some(option => option.value === family) ? family : DEFAULT_FONT_FAMILY

const injectWebFontLink = (doc: Document, href: string | null) => {
  const id = 'tit-webfont-link'
  let el = doc.getElementById(id) as HTMLLinkElement | null
  if (!href) { el?.remove(); return }
  if (!el) {
    el = doc.createElement('link')
    el.id = id
    el.rel = 'stylesheet'
    doc.head?.appendChild(el)
  }
  el.href = href
}

const applyFontFamilyOverride = (doc: Document, family: string) => {
  const normalizedFamily = normalizeFontFamily(family)
  injectStyle(doc, 'tit-font', `:root * { font-family: ${normalizedFamily} !important; }`)
  const fontKey = Object.keys(WEB_FONT_URLS).find(k => normalizedFamily.includes(k))
  injectWebFontLink(doc, fontKey ? WEB_FONT_URLS[fontKey] : null)
}

const applyLineHeightOverride = (doc: Document, lh: number) => {
  injectStyle(doc, 'tit-lh', `* { line-height: ${lh} !important; }`)
}

const applyLetterSpacingOverride = (doc: Document, ls: number) => {
  injectStyle(doc, 'tit-ls', `* { letter-spacing: ${ls}em !important; }`)
}


const originalTexts = new WeakMap<Node, string>()

const HIGHLIGHT_COLORS = [
  { label: '黃', value: '#eab308' },
  { label: '綠', value: '#22c55e' },
  { label: '藍', value: '#3b82f6' },
  { label: '粉', value: '#f9b9d7' },
  { label: '橘', value: '#f97316' },
]

const convertDoc = (doc: Document, convert: (s: string) => string) => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeValue && !originalTexts.has(node)) {
      originalTexts.set(node, node.nodeValue)
      node.nodeValue = convert(node.nodeValue)
    }
  }
}

const restoreDoc = (doc: Document) => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const original = originalTexts.get(node)
    if (original !== undefined) {
      node.nodeValue = original
      originalTexts.delete(node) // 刪除 entry，確保下次切換時可以重新轉換
    }
  }
}


interface Props {
  bookPath: string
  bookId: string
  bookRecord: BookRecord | null
  getCoverDataUrl: (id: string) => Promise<string | null>
  onBack: () => void
  darkMode: boolean
  onToggleDark: () => void
  onUpdateProgress?: (pct: number) => void
}

const SERIF = '"Source Serif 4", "Noto Serif TC", Georgia, serif'
const MONO  = '"JetBrains Mono", ui-monospace, monospace'

const COVER_STYLES = [
  { bg: 'oklch(0.92 0.04 80)',  ink: 'oklch(0.35 0.06 60)',  rule: 'oklch(0.68 0.08 55)' },
  { bg: 'oklch(0.86 0.04 65)',  ink: 'oklch(0.30 0.04 50)',  rule: 'oklch(0.55 0.06 40)' },
  { bg: 'oklch(0.30 0.06 260)', ink: 'oklch(0.92 0.02 260)', rule: 'oklch(0.72 0.10 260)' },
  { bg: 'oklch(0.42 0.05 150)', ink: 'oklch(0.95 0.02 140)', rule: 'oklch(0.78 0.08 145)' },
  { bg: 'oklch(0.88 0.04 20)',  ink: 'oklch(0.35 0.06 15)',  rule: 'oklch(0.62 0.12 20)' },
  { bg: 'oklch(0.45 0.02 250)', ink: 'oklch(0.95 0.01 250)', rule: 'oklch(0.80 0.04 250)' },
]
const coverStyleFor = (id: string) => COVER_STYLES[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COVER_STYLES.length]

const formatDate = (ts: number) =>
  ts ? new Date(ts).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '—'

const BookInfoPanel = ({
  record, getCoverDataUrl, darkMode, onClose, progress, embedded,
}: {
  record: BookRecord
  getCoverDataUrl: (id: string) => Promise<string | null>
  darkMode: boolean
  onClose?: () => void
  progress?: number | null
  embedded?: boolean
}) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  useEffect(() => {
    setCoverUrl(null)
    if (!record.hasCover) return
    getCoverDataUrl(record.id).then((url) => { if (url) setCoverUrl(url) })
  }, [record.id, record.hasCover, getCoverDataUrl])

  const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2  = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
  const ink2Col   = darkMode ? '#b8afa4' : '#5a4e44'
  const ink3Col   = darkMode ? '#7a706a' : '#9a8f80'
  const accentCol = 'oklch(0.62 0.14 40)'

  const cs = coverStyleFor(record.id)
  const pct = progress != null ? Math.round(progress * 100) : null

  const coverEl = coverUrl ? (
    <img src={coverUrl} alt={record.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  ) : (
    <div style={{ width: '100%', height: '100%', background: cs.bg, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 14, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)' }} />
      <div style={{ borderBottom: `1px solid ${cs.rule}`, marginBottom: 8, paddingBottom: 6 }}>
        <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: cs.ink, lineHeight: 1.4, wordBreak: 'break-all' }}>{record.title}</div>
      </div>
      {record.author && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: cs.rule, letterSpacing: '0.06em' }}>{record.author}</div>
      )}
    </div>
  )

  const metaRows = [
    { label: '匯入時間', value: formatDate(record.addedAt) },
    { label: '最後閱讀', value: record.lastOpenedAt ? formatDate(record.lastOpenedAt) : '尚未記錄' },
    { label: '進度', value: pct !== null ? `${pct}%` : '—' },
  ]

  const body = (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {/* 封面 */}
      <div style={{ padding: '16px 20px 12px' }}>
        <div style={{ aspectRatio: '2/3', overflow: 'hidden', boxShadow: '0 4px 16px -4px rgba(0,0,0,0.25)', borderRadius: 4 }}>
          {coverEl}
        </div>
      </div>

      {/* 書名作者 */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: inkCol, lineHeight: 1.4, marginBottom: 4 }}>{record.title}</div>
        {record.author && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: ink3Col, letterSpacing: '0.04em' }}>{record.author}</div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${borderCol}` }} />

      {/* 進度條 */}
      {pct !== null && (
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.08em', textTransform: 'uppercase' }}>閱讀進度</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: accentCol }}>{pct}%</span>
          </div>
          <div style={{ height: 3, background: borderCol, borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: accentCol, borderRadius: 2 }} />
          </div>
        </div>
      )}

      {/* Metadata */}
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {metaRows.filter(r => r.label !== '進度').map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.06em', flexShrink: 0 }}>{label}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: ink2Col, letterSpacing: '0.02em', textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${borderCol}` }} />

      {/* 操作按鈕 */}
      <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => navigator.clipboard?.writeText(record.title)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '9px 14px', borderRadius: 8, background: paperBg2,
            border: `1px solid ${borderCol}`, color: ink2Col,
            fontFamily: SERIF, fontSize: 13, cursor: 'pointer', transition: 'background .12s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = borderCol)}
          onMouseLeave={(e) => (e.currentTarget.style.background = paperBg2)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          複製書名
        </button>
      </div>
    </div>
  )

  if (embedded) return body

  return (
    <div style={{
      width: 260, flexShrink: 0, height: '100%',
      borderLeft: `1px solid ${borderCol}`,
      background: paperBg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${borderCol}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: inkCol }}>書籍資訊</div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink3Col, cursor: 'pointer', transition: 'all .12s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = inkCol; e.currentTarget.style.background = paperBg2 }}
            onMouseLeave={(e) => { e.currentTarget.style.color = ink3Col; e.currentTarget.style.background = 'transparent' }}
            aria-label="關閉"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      {body}
    </div>
  )
}

// epub.js prototype patch helpers（移到元件外；使用 Proxy.apply trap 完全避免 this 關鍵字）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const patchRenditionPrototype = (renditionProto: any) => {
  if (!renditionProto.injectIdentifier || renditionProto._injectIdentifierGuard) return
  const orig = renditionProto.injectIdentifier
  renditionProto.injectIdentifier = new Proxy(orig, {
    apply(target, thisArg: { book?: { packaging?: unknown } }, args: [Document, unknown]) {
      if (!thisArg.book?.packaging) return args[0]
      return target.apply(thisArg, args)
    },
  })
  renditionProto._injectIdentifierGuard = true
}

const patchIframeViewPrototype = (proto: Record<string, unknown>) => {
  if (!proto._nullRangeGuard) {
    const origUnderline = proto.underline
    if (typeof origUnderline === 'function') {
      proto.underline = new Proxy(origUnderline as (...a: unknown[]) => unknown, {
        apply(target, thisArg: Record<string, unknown>, args: unknown[]) {
          if (!thisArg.contents) return null
          // 必須先確認 range 非 null 才可建立 Underline；
          // 若讓 null range 進入 Underline constructor，pane.render() 時
          // getClientRects() 會 crash，導致整個 pane 的 SVG 全部消失
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const range = (thisArg.contents as any).range?.(args[0])
          if (!range) return null
          return target.apply(thisArg, args)
        },
      })
    }
    proto._nullRangeGuard = true
  }
  if (!proto._reframeGuard) {
    const origReframe = proto.reframe as ((...a: unknown[]) => unknown) | undefined
    if (typeof origReframe === 'function') {
      proto.reframe = new Proxy(origReframe, {
        apply(target, thisArg: unknown, args: unknown[]) {
          try { return target.apply(thisArg, args) } catch (e) {
            console.warn('[epubjs] reframe null range 異常，已略過:', e)
          }
        },
      })
    }
    proto._reframeGuard = true
  }
}

const Reader = ({ bookPath, bookId, bookRecord, getCoverDataUrl, onBack, darkMode, onToggleDark, onUpdateProgress }: Props) => {
  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const chapterPagesRef = useRef<Map<number, number>>(new Map()) // spineIndex → 已渲染的章節總頁數
  const currentChapterPageRef = useRef<number>(1) // 當前章節內頁碼，供掃描完成後重算 page
  const bookRecordRef = useRef(bookRecord)
  useEffect(() => { bookRecordRef.current = bookRecord }, [bookRecord])
  const scanAbortRef = useRef<{ aborted: boolean }>({ aborted: false })
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAnnotationCfiRef = useRef<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addEpubAnnotationRef = useRef<((r: any, ann: { cfi: string; color: string; id: string }) => void) | null>(null)

  const scriptRef = useRef<Script>('tc')
  const baseScriptRef = useRef<Script>('tc') // 書本原始語言，切換時用來判斷方向
  const readingDirectionRef = useRef<'ltr' | 'rtl'>('ltr')
  const darkModeRef = useRef(darkMode)
  const lastIframeClickRef = useRef({ x: 0, y: 0 }) // iframe 內最後一次點擊的主視窗座標
  const [activePanel, setActivePanel] = useState<'notes' | 'chapters' | 'settings' | 'bookinfo' | 'mobilepanel' | 'bookmarks' | null>(null)
  const [mobilePanelTab, setMobilePanelTab] = useState<'bookinfo' | 'chapters' | 'notes' | 'bookmarks'>('chapters')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks(bookId))
  const [currentCfi, setCurrentCfi] = useState<string>('')
  const [bookmarkPendingDeleteId, setBookmarkPendingDeleteId] = useState<string | null>(null)
  const isBookmarked = bookmarks.some((b) => b.cfi === currentCfi)
  const [toc, setToc] = useState<TocItem[]>([])
  const [currentHref, setCurrentHref] = useState('')
  const [ready, setReady] = useState(false)
  const [popup, setPopup] = useState<{ left: number; top: number; cfi: string; text: string } | null>(null)
  const [editPopup, setEditPopup] = useState<{ left: number; top: number; annotationId: string } | null>(null)
  const [bookTitle, setBookTitle] = useState('')
  const [pageInfo, setPageInfo] = useState<{ page: number; total: number } | null>(null)
  const [chapterRemaining, setChapterRemaining] = useState<number | null>(null)
  const [atStart, setAtStart] = useState(false)
  const [atEnd, setAtEnd] = useState(false)
  const atEndRef = useRef(false)
  const continueFromSpineRef = useRef<(spineIdx: number) => void>(() => {})
  const currentSpineIndexRef = useRef<number>(-1) // 追蹤當前合法的 spine 索引，用於朗讀時的備選
  const loadingAbortRef = useRef<{ aborted: boolean }>({ aborted: false }) // 追蹤異步章節載入，支持取消
  const isSelectingRef = useRef(false) // 追蹤是否正在選取文字，避免選取期間翻頁

  const {
    fontSize, fontFamily, script, lineHeight, letterSpacing, readingDirection,
    setFontSize, setFontFamily, setScript, resetScript, setLineHeight, setLetterSpacing, setReadingDirection,
  } = useReaderStore()
  const fontSizeRef = useRef(fontSize)
  const lineHeightRef = useRef(lineHeight)
  const fontFamilyRef = useRef(fontFamily)
  const letterSpacingRef = useRef(letterSpacing)
  const { addAnnotation, updateColor, removeAnnotation, clearAll: clearAnnotations, loadForBook } = useAnnotationStore()
  const { playing, speak, stop, voices, selectedVoice, setSelectedVoice, rate, setRate } = useTTS()
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop }, [stop])

  useEffect(() => {
    if (!pageInfo || pageInfo.total <= 0) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineTotal: number = (bookRef.current as any)?.spine?.items?.length ?? 1
    const knownChapters = chapterPagesRef.current.size
    if (knownChapters < spineTotal) {
      // 掃描尚未完成，估算不可靠，跳過存入避免覆蓋 Library 正確進度
      console.log('[Progress] 跳過存入（掃描中）', { knownChapters, spineTotal, estimatedPct: `${Math.round(pageInfo.page / pageInfo.total * 100)}%` })
      return
    }
    const ratio = pageInfo.page / pageInfo.total
    console.log('[Progress] 存入 Library', {
      page: pageInfo.page,
      total: pageInfo.total,
      pct: `${Math.round(ratio * 100)}%`,
    })
    onUpdateProgress?.(ratio)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageInfo])

  // 睡眠計時器
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null)
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sleepMinutesRef = useRef(0)
  // 供鍵盤事件存取最新的 prevPage/nextPage（避免閉包 stale 問題）
  const prevPageRef = useRef<() => void>(() => {})
  const nextPageRef = useRef<() => void>(() => {})
  // 供 prevPage/nextPage 讀取最新 ready 狀態（避免 React Compiler 記憶化閉包捕捉到舊值）
  const readyRef = useRef(false)
  // 滑動翻頁起始點
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)

  // 背景逐章渲染以取得精確全書頁數（反映當前字型、字距、行距）
  const scanAllChapterPages = useCallback(async () => {
    const book = bookRef.current
    const viewer = viewerRef.current
    if (!book || !viewer) return

    scanAbortRef.current.aborted = true
    const token = { aborted: false }
    scanAbortRef.current = token
    chapterPagesRef.current = new Map()

    const { width, height } = viewer.getBoundingClientRect()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineItems = ((book as any).spine?.items ?? []) as any[]
    if (!spineItems.length || width === 0 || height === 0) return

    const hiddenEl = document.createElement('div')
    Object.assign(hiddenEl.style, {
      position: 'fixed', top: '-9999px', left: '-9999px',
      width: `${width}px`, height: `${height}px`,
      overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none',
    })
    document.body.appendChild(hiddenEl)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hiddenRendition = (book as any).renderTo(hiddenEl, {
      width, height, spread: 'none', flow: 'paginated', allowScriptedContent: true,
    })

    try {
      hiddenRendition.themes.override('font-size', `${fontSizeRef.current}px`)
      hiddenRendition.themes.override('font-family', fontFamilyRef.current)
      hiddenRendition.themes.override('line-height', String(lineHeightRef.current))
      hiddenRendition.themes.override('letter-spacing', `${letterSpacingRef.current}em`)
    } catch { /* ignore */ }

    hiddenRendition.hooks.content.register((view: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (view as any).document as Document | undefined
      if (!doc) return
      applyFontFamilyOverride(doc, fontFamilyRef.current)
      applyLineHeightOverride(doc, lineHeightRef.current)
      applyLetterSpacingOverride(doc, letterSpacingRef.current)
    })

    const spineTotal = spineItems.length
    try {
      for (const item of spineItems) {
        if (token.aborted) break
        const href = item.href as string | undefined
        if (!href) continue
        try {
          await hiddenRendition.display(href)
          if (token.aborted) break
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const loc = (hiddenRendition as any).currentLocation?.()
          const d = loc?.start?.displayed as { page: number; total: number } | undefined
          const idx = item.index as number | undefined
          if (d && idx !== undefined) {
            chapterPagesRef.current = new Map(chapterPagesRef.current).set(idx, d.total)
            // 掃描全部完成才更新 total，避免 avg 隨掃描進度改變造成總頁數持續跳動
            const scannedCount = chapterPagesRef.current.size
            if (scannedCount === spineTotal) {
              const known = chapterPagesRef.current
              const knownValues = [...known.values()]
              const avg = knownValues.reduce((a, b) => a + b, 0) / knownValues.length
              let totalPages = 0
              for (let i = 0; i < spineTotal; i++) totalPages += known.get(i) ?? avg
              const accurateTotal = Math.round(totalPages)
              console.log('[Progress] 掃描完成，更新 total', {
                spineTotal,
                chapterPageCounts: Object.fromEntries(known),
                accurateTotal,
              })
              // 直接從主渲染器讀取即時位置，避免 ref 快取和 scanner/主渲染器章節數差異問題
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const mainLoc = (renditionRef.current as any)?.currentLocation?.()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const mainD = mainLoc?.start?.displayed as { page: number; total: number } | undefined
              const mainSpineIdx = mainLoc?.start?.index as number | undefined
              setPageInfo(prev => {
                if (!prev) return prev
                let accuratePage = prev.page
                if (mainD && mainSpineIdx !== undefined) {
                  let prevPages = 0
                  for (let i = 0; i < mainSpineIdx; i++) prevPages += known.get(i) ?? avg
                  accuratePage = Math.max(Math.round(prevPages + mainD.page), 1)
                }
                console.log('[Progress] setPageInfo（掃描後）', {
                  prevPage: prev.page,
                  prevTotal: prev.total,
                  mainSpineIdx,
                  mainChapterPage: mainD?.page,
                  accuratePage,
                  accurateTotal,
                  prevPct: `${Math.round(prev.page / prev.total * 100)}%`,
                  newPct: `${Math.round(accuratePage / accurateTotal * 100)}%`,
                })
                return { page: accuratePage, total: Math.max(accurateTotal, accuratePage) }
              })
            }
          }
        } catch { /* 略過無法渲染的章節 */ }
        await new Promise<void>(r => setTimeout(r, 0)) // 讓 UI 有機會更新
      }
    } finally {
      hiddenEl.remove()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annCountBefore = Object.keys((renditionRef.current?.annotations as any)?._annotations ?? {}).length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (hiddenRendition as any).destroy() } catch { /* ignore */ }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annCountAfter = Object.keys((renditionRef.current?.annotations as any)?._annotations ?? {}).length
      // 若 hiddenRendition.destroy() 清除了主渲染器的 annotation registry，從 store 重新注入
      if (!token.aborted && renditionRef.current && annCountAfter < annCountBefore && addEpubAnnotationRef.current) {
        const rend = renditionRef.current
        const storeAnns = useAnnotationStore.getState().annotations
        storeAnns.forEach(ann => addEpubAnnotationRef.current!(rend, ann))
      }
    }
  }, [])

  const triggerScan = useCallback(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
    scanTimerRef.current = setTimeout(scanAllChapterPages, 600)
  }, [scanAllChapterPages])

  // 同步 darkModeRef
  useEffect(() => { darkModeRef.current = darkMode }, [darkMode])

  // 同步 readingDirectionRef
  useEffect(() => { readingDirectionRef.current = readingDirection }, [readingDirection])

  // 外層 document 鍵盤左右鍵翻頁（焦點在 iframe 外時）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const isRtl = readingDirectionRef.current === 'rtl'
      if (e.key === 'ArrowLeft') { e.preventDefault(); isRtl ? nextPageRef.current() : prevPageRef.current() }
      if (e.key === 'ArrowRight') { e.preventDefault(); isRtl ? prevPageRef.current() : nextPageRef.current() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // 手機版保護機制：頁面隱藏時取消異步操作以節省資源
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('[Reader] 頁面進入背景，取消待處理的異步操作')
        loadingAbortRef.current.aborted = true
      } else {
        console.log('[Reader] 頁面回到前台，重置操作取消標誌')
        loadingAbortRef.current.aborted = false
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // 建立 annotation SVG 標記的 helper（使用 epub.js 內建 annotations，不修改 DOM 文字節點）
  const addEpubAnnotation = (
    rendition: Rendition,
    ann: { cfi: string; color: string; id: string }
  ) => {
    const annotationId = ann.id // closure 確保 id 可用，不依賴 callback 參數
    console.log('[Ann:add] annotations.add 呼叫 id=', ann.id, 'cfi=', ann.cfi.substring(0, 60))
    try {
      rendition.annotations.add(
        'underline',
        ann.cfi,
        { id: ann.id },
        // 不依賴 epubjs callback 傳入的 event（版本差異大，可能為 undefined）
        // 改為直接從 iframe DOM 找到該 annotation 的 SVG 元素，計算其位置
        () => {
          // marks-pane 的 SVG 在 outer document，直接用 document.querySelector
          const annEl = document.querySelector(`.ann-${annotationId}`)
          let x: number
          let y: number
          if (annEl) {
            const r = annEl.getBoundingClientRect()
            x = r.left + r.width / 2
            y = r.top
          } else {
            x = lastIframeClickRef.current.x
            y = lastIframeClickRef.current.y
          }

          setPopup(null)
          setEditPopup({
            left: Math.min(Math.max(x, 115), window.innerWidth - 115),
            top: y - 52 >= 8 ? y - 52 : Math.min(y + 8, window.innerHeight - 52),
            annotationId,
          })
        },
        `ann-${ann.id}`,
        { stroke: ann.color, 'stroke-opacity': '1', 'stroke-width': '1.5', fill: 'none' }
      )
    } catch (e) {
      console.error('[Ann:add] annotations.add 拋出例外:', e)
    }
    // hooks.render 比 contents 就緒早，可能 inject 失敗；延遲以 clear+inject 補渲染
    setTimeout(() => {
      if (!document.querySelector(`g.ann-${ann.id} line`)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const annApi = rendition.annotations as any
        rendition.views().forEach((view: unknown) => {
          annApi.clear(view)
          annApi.inject(view)
        })
      }
    }, 300)
  }
  addEpubAnnotationRef.current = addEpubAnnotation

  const addPendingAnnotation = (rendition: Rendition, cfi: string) => {
    if (pendingAnnotationCfiRef.current) {
      try { rendition.annotations.remove(pendingAnnotationCfiRef.current, 'underline') } catch {}
    }
    pendingAnnotationCfiRef.current = cfi
    try {
      rendition.annotations.add('underline', cfi, {}, undefined, 'tit-pending',
        { stroke: '#6366f1', 'stroke-opacity': '0.8', 'stroke-width': '2.5', fill: 'none' })
    } catch {}
  }

  const removePendingAnnotation = useCallback((rendition: Rendition) => {
    if (!pendingAnnotationCfiRef.current) return
    try { rendition.annotations.remove(pendingAnnotationCfiRef.current, 'underline') } catch {}
    pendingAnnotationCfiRef.current = null
  }, [])

  // 初始化書本
  useEffect(() => {
    const container = viewerRef.current
    if (!container) return

    let destroyed = false

    // iOS 某些版本的 selectionchange 在外層 document 觸發，轉發到 iframe document
    let forwardSelChange: (() => void) | null = null
    if (navigator.maxTouchPoints > 0) {
      forwardSelChange = () => {
        const iframe = viewerRef.current?.querySelector('iframe')
        const iframeDoc = iframe?.contentDocument
        if (iframeDoc) iframeDoc.dispatchEvent(new Event('selectionchange'))
      }
      document.addEventListener('selectionchange', forwardSelChange)
    }

    // 載入此書上次儲存的閱讀設定，套用到 store
    const savedSettings = loadBookSettings(bookId)
    if (savedSettings) {
      const normalizedFamily = normalizeFontFamily(savedSettings.fontFamily)
      const store = useReaderStore.getState()
      store.setFontSize(savedSettings.fontSize)
      store.setFontFamily(normalizedFamily)
      store.setLineHeight(savedSettings.lineHeight)
      store.setLetterSpacing(savedSettings.letterSpacing)
      store.setReadingDirection(savedSettings.readingDirection)
      store.setScript(savedSettings.script)
      fontFamilyRef.current = normalizedFamily
      scriptRef.current = savedSettings.script
    } else {
      resetScript()
      scriptRef.current = 'tc'
    }

    // 設定 annotation 自動儲存（先 unsub 再 clearAll，避免 clear 覆蓋 localStorage）
    const unsubAnnotations = useAnnotationStore.subscribe((state) => {
      saveAnnotationsForBook(bookId, state.annotations)
    })

    fetch(bookPath)
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        if (destroyed) return

        const book = ePub(buffer)
        bookRef.current = book

        const rendition = book.renderTo(container, {
          width: container.clientWidth,
          height: container.clientHeight,
          spread: 'none',
          flow: 'paginated',
          allowScriptedContent: true, // 允許 iframe sandbox 加入 allow-scripts，讓 selectionchange 在 iOS 正常觸發
        })
        renditionRef.current = rendition

        // epub.js bug 修補：Rendition.injectIdentifier 在 book.destroy() 後 this.book 會變成
        // undefined，若此時仍有非同步 section content hook 在觸發就會 crash。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patchRenditionPrototype(Object.getPrototypeOf(rendition) as any)

        // 修復預分頁 ePub 圖片重複問題：epub-container 是 flex 容器，預設 justify-content: center
        // 會將 1258px 的 spread epub-view 置中於 629px 容器，使可視區域落在 x=314~943，
        // 導致左右兩頁圖片各露出一半，看起來像兩張相同圖片偏移顯示。
        // 強制 flex-start 讓 epub-view 從左側對齊，只顯示 x=0~629（單頁）。
        const epubLayoutFix = document.createElement('style')
        epubLayoutFix.id = 'tit-epub-layout-fix'
        epubLayoutFix.textContent = '.epub-container { justify-content: flex-start !important; }'
        document.head.appendChild(epubLayoutFix)

        rendition.hooks.content.register((view: unknown) => {
          // epub.js bug 修補：IframeView.underline null range crash、reframe null range crash
          patchIframeViewPrototype(Object.getPrototypeOf(view) as Record<string, unknown>)

          const doc = (view as { document: Document }).document

          // 腳本轉換：只在顯示腳本與書本原始語言不同時才轉換
          if (scriptRef.current !== baseScriptRef.current) {
            convertDoc(doc, scriptRef.current === 'sc' ? getToSC() : getToTC())
          }

          // mousemove：持續記錄游標座標（供 annotation callback fallback 使用）
          // 用 mousemove 而非 mousedown，因為 marks-pane SVG 可能攔截 mousedown 事件
          doc.addEventListener('mousemove', (mvEvt: MouseEvent) => {
            const iframeEl = viewerRef.current?.querySelector('iframe')
            const iframeRect = iframeEl?.getBoundingClientRect()
            if (iframeRect) {
              lastIframeClickRef.current = {
                x: iframeRect.left + mvEvt.clientX,
                y: iframeRect.top + mvEvt.clientY,
              }
            }
          })
          // mousedown / touchstart 關閉現有 popup
          // popupSetTime 防止 removeAllRanges() 後 iOS 重新選取觸發的 touchstart 誤關 popup
          let popupSetTime = 0
          doc.addEventListener('mousedown', () => {
            if (renditionRef.current) removePendingAnnotation(renditionRef.current)
            setPopup(null)
            setEditPopup(null)
          })
          doc.addEventListener('touchstart', (e: TouchEvent) => {
            swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
            if (Date.now() - popupSetTime < 600) return
            setPopup(null)
            setEditPopup(null)
          }, { passive: true })
          doc.addEventListener('touchend', (e: TouchEvent) => {
            if (window.innerWidth >= 768) return
            const start = swipeStartRef.current
            if (!start) return
            const dx = e.changedTouches[0].clientX - start.x
            const dy = e.changedTouches[0].clientY - start.y
            swipeStartRef.current = null
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
            // 有實際選取範圍（長按選字）時不翻頁
            const currentSel = doc.defaultView?.getSelection()
            if (currentSel && !currentSel.isCollapsed && currentSel.rangeCount > 0) return
            const isRtl = readingDirectionRef.current === 'rtl'
            if ((dx < 0) !== isRtl) nextPageRef.current()
            else prevPageRef.current()
          }, { passive: true })

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const viewContents = view as any
          if (navigator.maxTouchPoints > 0) {
            let selTimer: ReturnType<typeof setTimeout> | null = null
            doc.addEventListener('selectionchange', () => {
              if (selTimer) clearTimeout(selTimer)
              // 立即更新狀態：有非空選取就鎖定，避免 touchend 翻頁
              const currentSel = doc.defaultView?.getSelection()
              if (currentSel && !currentSel.isCollapsed && currentSel.rangeCount > 0) {
                isSelectingRef.current = true
              }
              selTimer = setTimeout(() => {
                isSelectingRef.current = false
                const sel = doc.defaultView?.getSelection()
                if (!sel || sel.isCollapsed || !sel.rangeCount) return
                const text = sel.toString().trim()
                if (!text || !viewContents) return
                const range = sel.getRangeAt(0).cloneRange()
                let cfi: string
                try { cfi = viewContents.cfiFromRange(range) } catch { return }
                const rect = range.getBoundingClientRect()
                const iframeEl = viewerRef.current?.querySelector('iframe')
                const iframeRect = iframeEl?.getBoundingClientRect()
                if (!iframeRect) return
                // 行動裝置：新增暫時視覺高亮，避免 native selection 消失後使用者看不到選取範圍
                if (renditionRef.current) addPendingAnnotation(renditionRef.current, cfi)
                sel.removeAllRanges()
                popupSetTime = Date.now()
                const rawX = iframeRect.left + rect.left + rect.width / 2
                const rawY = Math.max(iframeRect.top + rect.top, 80)
                setPopup({
                  left: Math.min(Math.max(rawX, 98), window.innerWidth - 98),
                  top: rawY - 52 >= 8 ? rawY - 52 : Math.min(rawY + 8, window.innerHeight - 52),
                  cfi,
                  text,
                })
              }, 300)
            }, { passive: true })
          }

          // iframe 內的鍵盤左右鍵翻頁（epub 內容取得焦點時，鍵盤事件不冒泡到外層）
          doc.addEventListener('keydown', (e: KeyboardEvent) => {
            const isRtl = readingDirectionRef.current === 'rtl'
            if (e.key === 'ArrowLeft') { e.preventDefault(); isRtl ? nextPageRef.current() : prevPageRef.current() }
            if (e.key === 'ArrowRight') { e.preventDefault(); isRtl ? prevPageRef.current() : nextPageRef.current() }
          })

          // 各功能獨立注入 !important 樣式，互不干擾
          applyDarkOverride(doc, darkModeRef.current)
          applyFontFamilyOverride(doc, fontFamilyRef.current)
          applyLineHeightOverride(doc, lineHeightRef.current)
          applyLetterSpacingOverride(doc, letterSpacingRef.current)

          // hooks.render 比 contents 就緒早，部分 annotation inject 可能失敗
          // 在 rendered（contents 已就緒）後對當前 view 做 clear + inject 確保顯示
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const annApi = rendition.annotations as any
          annApi.clear(view)
          annApi.inject(view)
        })

        // 監聽文字選取
        rendition.on('selected', (cfiRange: string, contents: unknown) => {
          if (navigator.maxTouchPoints > 0) return  // 觸控裝置由 selectionchange 路徑處理
          const c = contents as { window: Window }
          const selection = c.window.getSelection()
          if (!selection || selection.isCollapsed) { setPopup(null); return }
          const text = selection.toString()

          const range = selection.getRangeAt(0)
          const rect = range.getBoundingClientRect()
          const iframe = viewerRef.current?.querySelector('iframe')
          const iframeRect = iframe?.getBoundingClientRect()
          if (!iframeRect) return

          const rawX = iframeRect.left + rect.left + rect.width / 2
          const rawY = iframeRect.top + rect.top
          setPopup({
            left: Math.min(Math.max(rawX, 98), window.innerWidth - 98),
            top: rawY - 52 >= 8 ? rawY - 52 : Math.min(rawY + 8, window.innerHeight - 52),
            cfi: cfiRange,
            text,
          })
        })

        rendition.on('relocated', (loc: unknown) => {
          // 頁面跳轉時立即清除暫時高亮，防止舊 CFI 在新章節 inject 時污染 annotation pane
          if (pendingAnnotationCfiRef.current && renditionRef.current) {
            removePendingAnnotation(renditionRef.current)
            setPopup(null)
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const l = loc as any
          setCurrentHref((l?.start?.href ?? '').split('#')[0])
          if (l?.start?.cfi) {
            saveProgress(bookId, l.start.cfi)
            setCurrentCfi(l.start.cfi)
          }
          setAtStart(l?.atStart ?? false)
          setAtEnd(l?.atEnd ?? false)
          atEndRef.current = l?.atEnd ?? false

          // 章節剩餘頁（左側小字）
          const d = l?.start?.displayed as { page: number; total: number } | undefined
          if (d) setChapterRemaining(d.total - d.page)

          // 全書頁碼（右下角）：以 chapterPagesRef 累計章節真實頁數計算當前位置
          // total 由背景掃描器負責更新，這裡只更新 page，避免 avg 隨掃描進度改變造成 total 跳動
          const spineIdx = l?.start?.index as number | undefined
          if (d && spineIdx !== undefined) {
            currentSpineIndexRef.current = spineIdx // 同步追蹤當前合法的 spine 索引
            currentChapterPageRef.current = d.page
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const spineTotal: number = (bookRef.current as any)?.spine?.items?.length ?? 1
            chapterPagesRef.current = new Map(chapterPagesRef.current).set(spineIdx, d.total) // 主渲染的真實章節頁數
            const known = chapterPagesRef.current
            const knownValues = [...known.values()]
            const avg = knownValues.reduce((a, b) => a + b, 0) / knownValues.length
            let prevPages = 0
            for (let i = 0; i < spineIdx; i++) prevPages += known.get(i) ?? avg
            const globalPage = prevPages + d.page
            const page = Math.max(Math.round(globalPage), 1)
            console.log('[Progress] relocated 頁碼計算', {
              spineIdx,
              spineTotal,
              chapterPage: d.page,
              chapterTotal: d.total,
              knownChapters: known.size,
              avg: Math.round(avg),
              prevPages: Math.round(prevPages),
              globalPage: Math.round(globalPage),
              page,
              isEstimated: known.size < spineTotal,
            })
            setPageInfo(prev => {
              if (prev) return { page, total: Math.max(prev.total, page) }
              let totalPages = 0
              for (let i = 0; i < spineTotal; i++) totalPages += known.get(i) ?? avg
              const estimatedTotal = Math.max(Math.round(totalPages), page)
              // 掃描未完成時，以 stored progress 換算初始頁碼，確保顯示正確 %
              const storedProgress = bookRecordRef.current?.progress
              if (storedProgress != null && storedProgress > 0 && known.size < spineTotal) {
                const storedPage = Math.max(Math.round(storedProgress * estimatedTotal), 1)
                return { page: storedPage, total: estimatedTotal }
              }
              return { page, total: estimatedTotal }
            })
          }
        })

        return book.ready
          .then(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pkg = (book as any).package?.metadata
            const lang = (pkg?.language as string | undefined) ?? ''
            setBookTitle((pkg?.title as string | undefined)?.trim() ?? '')
            // 簡體判斷：zh-CN / zh-Hans / zh-SG，或單獨的 "zh"（不帶 region code）
            // baseScriptRef 永遠反映書本原始語言，scriptRef / store script 優先使用使用者儲存的偏好
            if (/^zh$|zh[-_]?(cn|hans|sg)/i.test(lang)) {
              baseScriptRef.current = 'sc'
              if (!savedSettings) {
                scriptRef.current = 'sc'
                setScript('sc')
              }
            } else {
              baseScriptRef.current = 'tc'
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setToc(((book.navigation as any).toc ?? []) as TocItem[])

            // 載入此書已儲存的 annotation，並透過 epub.js 內建系統（SVG）渲染
            // 使用 SVG overlay 取代 DOM mark，完全避免 EpubCFI.toRange 的 DOMException 問題
            loadForBook(loadAnnotationsForBook(bookId))
            const restored = useAnnotationStore.getState().annotations
            restored.forEach((ann) => addEpubAnnotation(rendition, ann))

            const savedCfi = loadProgress(bookId)
            return rendition.display(savedCfi ?? undefined).catch(async (err: unknown) => {
              console.warn('[Reader] display(savedCfi) 失敗:', err)

              // fallback 1：數字索引 0（epubjs 支援 spine index）
              try {
                return await rendition.display(0 as unknown as string)
              } catch (e1) { console.warn('[Reader] index=0 失敗:', e1) }

              // fallback 2：第一個 spine item 的 href
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const spineItems: any[] = (book as any).spine?.items ?? []
              const firstHref = spineItems[0]?.href as string | undefined
              if (firstHref) {
                try {
                  return await rendition.display(firstHref)
                } catch (e2) { console.warn('[Reader] href fallback 失敗:', e2) }
              }

              // fallback 3：常見 section id / idref 名稱
              const commonNames = [
                'text', 'body', 'content', 'main',
                'chapter1', 'chapter-1', 'chap01', 'chap1',
                'item1', 'item-1', 'section1', 'page1',
                'cover', 'toc', 'nav',
              ]
              for (const name of commonNames) {
                try {
                  return await rendition.display(name)
                } catch { /* 繼續嘗試下一個 */ }
              }

              // fallback 最終：無參數（epubjs 顯示第一個可用 section）
              return rendition.display()
            })
          })
          .then(() => {
            if (!destroyed) {
              setReady(true)
              // 書本就緒後立即掃描所有章節，取得精確全書頁數
              scanAllChapterPages()
            }
          })
      })
      .catch((err: unknown) => {
        console.error('[Reader] 初始化失敗:', err)
      })

    return () => {
      destroyed = true
      if (forwardSelChange) document.removeEventListener('selectionchange', forwardSelChange)
      document.getElementById('tit-epub-layout-fix')?.remove()
      // 離開書本前儲存目前閱讀設定
      const { fontSize: fs, fontFamily: ff, script: sc, lineHeight: lh, letterSpacing: ls, readingDirection: rd } = useReaderStore.getState()
      saveBookSettings(bookId, { fontSize: fs, fontFamily: ff, script: sc, lineHeight: lh, letterSpacing: ls, readingDirection: rd })
      scanAbortRef.current.aborted = true
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
      setReady(false)
      setPopup(null)
      setToc([])
      setCurrentHref('')
      setCurrentCfi('')
      setBookmarks([])
      setBookmarkPendingDeleteId(null)
      setBookTitle('')
      setPageInfo(null)
      chapterPagesRef.current = new Map()
      currentChapterPageRef.current = 1
      setChapterRemaining(null)
      setAtStart(false)
      setAtEnd(false)
      stopRef.current()
      unsubAnnotations() // 先 unsub，再 clearAll，避免儲存空陣列覆蓋 localStorage
      clearAnnotations()
      renditionRef.current = null
      bookRef.current?.destroy()
      bookRef.current = null
    }
  }, [bookPath, bookId, resetScript, setScript, clearAnnotations, loadForBook])

  // 字體大小（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    fontSizeRef.current = fontSize
    try { renditionRef.current?.themes.override('font-size', `${fontSize}px`) } catch { /* epubjs 時序問題，忽略 */ }
    triggerScan()
  }, [fontSize, ready])

  // 取得當前 epubjs view 的 document（比 querySelector('iframe').contentDocument 更可靠，
  // 避免 blob: iframe cross-origin 限制導致 contentDocument 為 null）
  const applyToCurrentDoc = (fn: (doc: Document) => void) => {
    renditionRef.current?.views().forEach((view: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (view as any).document as Document | undefined
      if (doc) fn(doc)
    })
  }

  // 文字排版改變後，重新計算 marks-pane SVG 座標（pane.render 會重呼叫 getClientRects）
  const rerenderAnnotationPane = () => {
    setTimeout(() => {
      renditionRef.current?.views().forEach((view: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (view as any).pane?.render()
      })
    }, 50)
  }

  // 字體家族（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    const normalizedFamily = normalizeFontFamily(fontFamily)
    if (normalizedFamily !== fontFamily) {
      setFontFamily(normalizedFamily)
      return
    }
    fontFamilyRef.current = normalizedFamily
    try { renditionRef.current?.themes.override('font-family', normalizedFamily) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyFontFamilyOverride(doc, normalizedFamily))
    rerenderAnnotationPane()
    triggerScan()
  }, [fontFamily, ready, setFontFamily])

  // 行距（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    lineHeightRef.current = lineHeight
    try { renditionRef.current?.themes.override('line-height', String(lineHeight)) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyLineHeightOverride(doc, lineHeight))
    rerenderAnnotationPane()
    triggerScan()
  }, [lineHeight, ready])

  // 字距（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    letterSpacingRef.current = letterSpacing
    try { renditionRef.current?.themes.override('letter-spacing', `${letterSpacing}em`) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyLetterSpacingOverride(doc, letterSpacing))
    rerenderAnnotationPane()
    triggerScan()
  }, [letterSpacing, ready])

  // 深色模式（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    darkModeRef.current = darkMode
    try {
      if (darkMode) {
        renditionRef.current?.themes.override('color', '#e8e0d4')
        renditionRef.current?.themes.override('background', '#1a1816')
      } else {
        renditionRef.current?.themes.override('color', '#2a2420')
        renditionRef.current?.themes.override('background', '#f9f7f2')
      }
    } catch { /* epubjs 時序問題，忽略 */ }
    const doc = viewerRef.current?.querySelector('iframe')?.contentDocument
    if (doc) applyDarkOverride(doc, darkMode)
  }, [darkMode, ready])

  // 同步 ready state 到 ref，讓 prevPage/nextPage 不需捕捉 ready 就能讀到最新值
  useEffect(() => { readyRef.current = ready }, [ready])

  const prevPage = useCallback(() => {
    if (!readyRef.current) return
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    setPopup(null)
    renditionRef.current?.prev()
  }, [removePendingAnnotation])

  const nextPage = useCallback(() => {
    if (!readyRef.current) return
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    setPopup(null)
    renditionRef.current?.next()
  }, [removePendingAnnotation])

  // 保持 ref 指向最新版本，供 iframe 內鍵盤事件使用（useEffect 避免 render 期間 mutation，確保 React Compiler 可正常優化）
  useEffect(() => {
    prevPageRef.current = prevPage
    nextPageRef.current = nextPage
  }, [prevPage, nextPage])

  const handleScriptToggle = () => {
    const newScript: Script = script === 'tc' ? 'sc' : 'tc'
    scriptRef.current = newScript
    setScript(newScript)
    const doc = viewerRef.current?.querySelector('iframe')?.contentDocument
    if (!doc?.body) return
    if (newScript === baseScriptRef.current) {
      restoreDoc(doc)
    } else {
      convertDoc(doc, newScript === 'sc' ? getToSC() : getToTC())
    }
  }

  const getChapterTitle = (): string => {
    if (!bookRef.current) return ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const location = (renditionRef.current as any)?.currentLocation?.()
      const curFile = (location?.start?.href ?? '').split('#')[0]
      if (!curFile) return ''

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tocItems: any[] = (bookRef.current.navigation as any).toc ?? []
      let bestLabel = ''
      let bestDepth = -1

      const search = (items: any[], depth: number) => {
        for (const item of items) {
          const itemFile = (item.href as string ?? '').split('#')[0]
          if (itemFile === curFile && depth > bestDepth) {
            bestLabel = (item.label as string)?.trim() ?? ''
            bestDepth = depth
          }
          if (item.subitems?.length) search(item.subitems, depth + 1)
        }
      }
      search(tocItems, 0)
      return bestLabel
    } catch {
      return ''
    }
  }

  const handleHighlight = (color: string) => {
    if (!popup) return
    const iframe = viewerRef.current?.querySelector('iframe')
    const win = iframe?.contentWindow
    if (win) win.getSelection()?.removeAllRanges()
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)

    const ann = { cfi: popup.cfi, text: popup.text, color, chapter: getChapterTitle() }
    addAnnotation(ann)
    const id = useAnnotationStore.getState().annotations.at(-1)?.id ?? crypto.randomUUID()

    if (renditionRef.current) {
      addEpubAnnotation(renditionRef.current, { cfi: popup.cfi, color, id })
    }

    setPopup(null)
  }

  const handleChangeColor = (id: string, color: string) => {
    const ann = useAnnotationStore.getState().annotations.find((a) => a.id === id)
    if (ann && renditionRef.current) {
      renditionRef.current.annotations.remove(ann.cfi, 'underline')
      addEpubAnnotation(renditionRef.current, { cfi: ann.cfi, color, id })
    }
    updateColor(id, color)
  }

  const handleDeleteMark = (id: string) => {
    const ann = useAnnotationStore.getState().annotations.find((a) => a.id === id)
    if (ann) {
      renditionRef.current?.annotations.remove(ann.cfi, 'underline')
    }
    removeAnnotation(id)
    setEditPopup(null)
  }

  const handleEditColor = (id: string, color: string) => {
    handleChangeColor(id, color)
    setEditPopup(null)
  }

  const handleNavigateToAnnotation = (cfi: string) => {
    renditionRef.current?.display(cfi).catch((err: unknown) => {
      console.warn('[Reader] 跳轉至註記失敗（No Section Found？）:', err)
    })
  }

  const handleNavigateToChapter = (href: string) => {
    // TOC href 格式可能與 spine item href 不一致，需正規化後再 display
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineItems: any[] = (bookRef.current as any)?.spine?.items ?? []
    const cleanHref = href.split('#')[0]
    const filename = cleanHref.split('/').pop() ?? ''
    const spineItem = spineItems.find((item: any) =>
      item.href === href ||
      item.href === cleanHref ||
      item.idref === cleanHref ||
      item.idref === filename ||
      (filename && item.href?.endsWith('/' + filename)) ||
      (filename && item.href === filename)
    )
    const target = spineItem?.href ?? href
    renditionRef.current?.display(target).catch((err: unknown) => {
      console.warn('[Reader] 跳轉至章節失敗:', err)
    })
  }

  const togglePanel = (panel: 'notes' | 'chapters' | 'settings' | 'bookinfo' | 'mobilepanel' | 'bookmarks') =>
    setActivePanel((cur) => (cur === panel ? null : panel))

  const handleDeleteBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.id !== id)
      saveBookmarks(bookId, next)
      return next
    })
  }

  const getBookmarkLabel = (): string => {
    const exact = getChapterTitle()
    if (exact) return exact

    // 精確比對失敗（如圖片頁），往前找最近的 TOC 章節
    if (!bookRef.current) return '書籤'
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loc = (renditionRef.current as any)?.currentLocation?.()
      const curSpineIdx = loc?.start?.index as number | undefined
      if (curSpineIdx === undefined) return '書籤'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spineItems: any[] = (bookRef.current as any)?.spine?.items ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tocItems: any[] = (bookRef.current.navigation as any).toc ?? []

      // 把 TOC href 轉換成 spine index
      const hrefToSpineIdx = (href: string): number => {
        const file = href.split('#')[0]
        const idx = spineItems.findIndex((s: any) =>
          s.href === file || s.href === href ||
          (file && (s.href?.endsWith('/' + file) || file?.endsWith('/' + s.href)))
        )
        return idx
      }

      let bestLabel = ''
      let bestIdx = -1

      const search = (items: any[]) => {
        for (const item of items) {
          const si = hrefToSpineIdx(item.href ?? '')
          if (si !== -1 && si <= curSpineIdx && si > bestIdx) {
            bestLabel = (item.label as string)?.trim() ?? ''
            bestIdx = si
          }
          if (item.subitems?.length) search(item.subitems)
        }
      }
      search(tocItems)
      return bestLabel || '書籤'
    } catch {
      return '書籤'
    }
  }

  const handleToggleBookmark = () => {
    const cfi = currentCfi
    if (!cfi) return
    setBookmarks((prev) => {
      let next: Bookmark[]
      if (prev.some((b) => b.cfi === cfi)) {
        next = prev.filter((b) => b.cfi !== cfi)
      } else {
        const label = getBookmarkLabel()
        next = [...prev, { id: crypto.randomUUID(), cfi, label, addedAt: Date.now() }]
      }
      saveBookmarks(bookId, next)
      return next
    })
  }

  const speakCurrentPage = () => {
    if (!viewerRef.current) return
    const iframe = viewerRef.current.querySelector('iframe')
    if (!iframe?.contentDocument?.body) return

    const fullText = iframe.contentDocument.body.innerText?.trim() ?? ''
    if (!fullText) return

    // 從 epub.js 取得當前頁資訊
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loc = (renditionRef.current as any)?.currentLocation?.()
    const displayed = loc?.start?.displayed as { page: number; total: number } | undefined
    const totalPages = Math.max(displayed?.total ?? 1, 1)
    const currentPageIdx = Math.max((displayed?.page ?? 1) - 1, 0) // 0-indexed

    // 計算當前頁在章節全文中的起始位置
    // 優先用 percentage（epub.js 提供，最準確）；其次用 page/total 估算
    let startOffset = 0
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const percentage = (loc as any)?.start?.percentage as number | undefined
      const approx = (typeof percentage === 'number' && percentage > 0)
        ? Math.floor(percentage * fullText.length)
        : Math.floor(currentPageIdx / totalPages * fullText.length)

      if (approx > 0) {
        // 嘗試從當前頁 CFI 取得文字樣本，在全文中搜尋最近似位置（精確定位）
        const startCfi = loc?.start?.cfi as string | undefined
        let found = false
        if (startCfi) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const range = (renditionRef.current as any).getRange?.(startCfi) as Range | null | undefined
          const startNode = range?.startContainer
          if (startNode?.nodeType === Node.TEXT_NODE) {
            const nodeText = (startNode.nodeValue ?? '').slice(range!.startOffset)
            const sample = nodeText.replace(/\s+/g, '').substring(0, 15)
            if (sample.length >= 3) {
              // 搜尋全文，選擇距離 approx 最近的符合位置（解決舊版窗口過窄問題）
              const normalFull = fullText.replace(/\s+/g, '')
              const approxNorm = Math.round(approx / fullText.length * normalFull.length)
              let bestNormIdx = -1, bestDist = Infinity, pos = 0
              while (true) {
                const idx = normalFull.indexOf(sample, pos)
                if (idx < 0) break
                const dist = Math.abs(idx - approxNorm)
                if (dist < bestDist) { bestDist = dist; bestNormIdx = idx }
                pos = idx + 1
              }
              if (bestNormIdx >= 0) {
                let normCount = 0
                for (let i = 0; i < fullText.length; i++) {
                  if (!/\s/.test(fullText[i])) {
                    if (normCount === bestNormIdx) { startOffset = i; break }
                    normCount++
                  }
                }
                found = true
              }
            }
          }
        }
        // CFI 定位失敗時，直接採用 approx（percentage/page-based），對齊到詞首
        if (!found) {
          startOffset = approx
          while (startOffset > 0 && !/[\s\n]/.test(fullText[startOffset - 1])) startOffset--
        }
      }
    } catch { /* 保持 startOffset = 0 */ }

    const textToRead = fullText.slice(startOffset)
    if (!textToRead.trim()) return

    // 取得 spine 索引：優先用 location，備選用已追蹤的 currentSpineIndexRef
    let currentSpineIdx = (loc as any)?.start?.index as number | undefined
    if (currentSpineIdx === undefined) {
      currentSpineIdx = currentSpineIndexRef.current >= 0 ? currentSpineIndexRef.current : 0
      console.warn('[TTS] speakCurrentPage: location.index 未定義，使用備選 spine 索引', { currentSpineIdx })
    }
    console.log('[TTS] speakCurrentPage 開始', { currentSpineIdx, pageIdx: currentPageIdx, textLength: textToRead.length })
    speak(textToRead, () => {
      console.log('[TTS] speakCurrentPage 完成，準備加載下一章節', { nextSpineIdx: currentSpineIdx + 1 })
      continueFromSpineRef.current(currentSpineIdx + 1)
    })
  }

  // 背景載入後續章節並繼續朗讀，不翻頁
  const continueFromSpine = (spineIdx: number) => {
    const book = bookRef.current
    if (!book) { console.warn('[TTS] continueFromSpine: book 未初始化', { spineIdx }); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineItems: any[] = (book as any)?.spine?.items ?? []
    if (spineIdx >= spineItems.length) {
      console.log('[TTS] continueFromSpine: 已到達書籍末尾', { spineIdx, totalCount: spineItems.length })
      return
    }
    if (spineIdx < 0) {
      console.warn('[TTS] continueFromSpine: spine 索引無效', { spineIdx })
      return
    }

    const item = spineItems[spineIdx]
    const token = { aborted: false }
    loadingAbortRef.current = token // 記錄當前加載 token，支持後續取消

    console.log('[TTS] continueFromSpine: 開始載入章節', { spineIdx, totalCount: spineItems.length, href: item?.href ?? item?.idref })
    ;(async () => {
      try {
        // 設置超時保護：手機版可能因 GC 或系統限制導致異步操作遲遲未完成
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const section = (book as any).spine.get(item.href ?? item.idref)
        if (!section || token.aborted) {
          console.warn('[TTS] continueFromSpine: section 無效或操作已取消', { spineIdx, aborted: token.aborted })
          continueFromSpineRef.current(spineIdx + 1)
          return
        }

        // 設置超時 promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('章節載入超時（手機版可能受系統限制）')), 8000)
        })

        // section.load() 回傳的是 xml.documentElement（Element），不是 Document
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loadPromise = section.load((book as any).load.bind(book)) as Promise<Element>
        const element: Element = await Promise.race([loadPromise, timeoutPromise])

        // 檢查操作是否被取消（用户停止朗讀或頁面關閉）
        if (token.aborted) {
          console.log('[TTS] continueFromSpine: 操作已取消', { spineIdx })
          section.unload?.()
          return
        }

        const root = element?.cloneNode(true) as Element | undefined
        root?.querySelectorAll('script, style').forEach(el => el.remove())
        let text = (root?.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (text && scriptRef.current !== baseScriptRef.current)
          text = (scriptRef.current === 'sc' ? getToSC() : getToTC())(text)
        section.unload?.()

        if (!text) {
          console.warn('[TTS] continueFromSpine: 章節文字為空', { spineIdx })
          continueFromSpineRef.current(spineIdx + 1)
          return
        }

        console.log('[TTS] continueFromSpine: 章節載入成功，準備朗讀', { spineIdx, textLength: text.length })
        // 更新追蹤的 spine 索引
        currentSpineIndexRef.current = spineIdx
        speak(text, () => continueFromSpineRef.current(spineIdx + 1))
      } catch (err) {
        if (!token.aborted) {
          console.error('[TTS] continueFromSpine: 章節載入失敗', { spineIdx, error: err instanceof Error ? err.message : String(err) })
          continueFromSpineRef.current(spineIdx + 1)
        }
      }
    })()
  }

  useEffect(() => { continueFromSpineRef.current = continueFromSpine }, [continueFromSpine])

  const clearSleepTimer = () => {
    if (sleepIntervalRef.current !== null) {
      clearInterval(sleepIntervalRef.current)
      sleepIntervalRef.current = null
    }
    setSleepRemaining(null)
  }

  const startSleepTimer = (minutes: number) => {
    if (sleepIntervalRef.current !== null) {
      clearInterval(sleepIntervalRef.current)
      sleepIntervalRef.current = null
    }
    if (minutes <= 0) { setSleepRemaining(null); return }
    setSleepRemaining(minutes * 60)
    sleepIntervalRef.current = setInterval(() => {
      setSleepRemaining(prev => (prev !== null && prev > 0) ? prev - 1 : prev)
    }, 1000)
  }

  useEffect(() => {
    if (sleepRemaining === 0) {
      if (sleepIntervalRef.current !== null) {
        clearInterval(sleepIntervalRef.current)
        sleepIntervalRef.current = null
      }
      setSleepRemaining(null)
      stop()
    }
  }, [sleepRemaining, stop])

  const handleSleepChange = (minutes: number) => {
    setSleepMinutes(minutes)
    sleepMinutesRef.current = minutes
    if (playing) {
      if (minutes > 0) startSleepTimer(minutes)
      else clearSleepTimer()
    }
  }

  const handleTTSPlay = () => {
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    setPopup(null)
    speakCurrentPage()
    if (sleepMinutesRef.current > 0) startSleepTimer(sleepMinutesRef.current)
  }

  const handleTTSStop = () => {
    stop()
    clearSleepTimer()
    // 取消任何待處理的章節載入（手機版保護機制）
    loadingAbortRef.current.aborted = true
    console.log('[TTS] handleTTSStop: 朗讀停止，已取消待處理的異步操作')
  }


  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: darkMode ? '#1a1816' : '#f9f7f2' }}
      onClick={() => { setPopup(null); setEditPopup(null) }}
    >
      <Toolbar
        onBack={onBack}
        bookTitle={bookTitle}
        bookAuthor={bookRecord?.author}
        pageInfo={pageInfo}
        darkMode={darkMode}
        onToggleDark={onToggleDark}
        onToggleMobilePanel={() => togglePanel('mobilepanel')}
        onToggleBookInfo={() => togglePanel('bookinfo')}
        onToggleNotes={() => togglePanel('notes')}
        onToggleChapters={() => togglePanel('chapters')}
        onToggleSettings={() => togglePanel('settings')}
        activePanel={activePanel}
        isBookmarked={isBookmarked}
        onToggleBookmark={handleToggleBookmark}
        onToggleBookmarkList={() => togglePanel('bookmarks')}
      />
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-1 relative overflow-hidden"
          onTouchStart={(e) => { swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={(e) => {
            if (window.innerWidth >= 768) return
            const start = swipeStartRef.current
            if (!start) return
            const dx = e.changedTouches[0].clientX - start.x
            const dy = e.changedTouches[0].clientY - start.y
            swipeStartRef.current = null
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
            const isRtl = readingDirectionRef.current === 'rtl'
            if ((dx < 0) !== isRtl) nextPageRef.current()
            else prevPageRef.current()
          }}
        >
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-stone-400 dark:text-stone-500">
              載入中…
            </div>
          )}
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 hidden md:flex items-center justify-center rounded-full bg-transparent hover:bg-stone-300/50 dark:hover:bg-stone-600/50 transition text-xl disabled:opacity-30 text-stone-400 dark:text-stone-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
            onClick={readingDirection === 'rtl' ? nextPage : prevPage}
            disabled={!ready || (readingDirection === 'rtl' ? atEnd : atStart)}
            aria-label={readingDirection === 'rtl' ? '下一頁' : '上一頁'}
          >
            ‹
          </button>
          <div ref={viewerRef} className="absolute top-2 bottom-2 md:bottom-8 left-0 right-0 overflow-hidden" />

          {/* 章節剩餘頁（底部左側小字，僅桌面版） */}
          {ready && chapterRemaining !== null && (
            <div className="hidden md:block absolute md:bottom-2 left-14 z-10 pointer-events-none">
              <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, color: darkMode ? '#7a706a' : '#9a8f80', letterSpacing: '0.04em', userSelect: 'none' }}>
                還有 {chapterRemaining} 頁
              </span>
            </div>
          )}
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 hidden md:flex items-center justify-center rounded-full bg-transparent hover:bg-stone-300/50 dark:hover:bg-stone-600/50 transition text-xl disabled:opacity-30 text-stone-400 dark:text-stone-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
            onClick={readingDirection === 'rtl' ? prevPage : nextPage}
            disabled={!ready || (readingDirection === 'rtl' ? atStart : atEnd)}
            aria-label={readingDirection === 'rtl' ? '上一頁' : '下一頁'}
          >
            ›
          </button>

          {/* 編輯現有註記 popup */}
          {editPopup && (
            <div
              className="fixed z-50 flex items-center gap-1.5 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-stone-200 dark:border-stone-700"
              style={{ left: editPopup.left, top: editPopup.top, transform: 'translateX(-50%)' }}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 shadow hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value }}
                  onClick={() => handleEditColor(editPopup.annotationId, c.value)}
                  aria-label={`${c.label}色`}
                  title={`${c.label}色`}
                />
              ))}
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-700 hover:bg-red-100 dark:hover:bg-red-900 text-stone-400 hover:text-red-500 dark:hover:text-red-400 text-xs transition"
                onClick={() => handleDeleteMark(editPopup.annotationId)}
                aria-label="刪除此註記"
                title="刪除"
              >
                ✕
              </button>
            </div>
          )}

          {/* 顏色選擇器 popup */}
          {popup && (
            <div
              className="fixed z-50 flex gap-1.5 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-stone-200 dark:border-stone-700"
              style={{ left: popup.left, top: popup.top, transform: 'translateX(-50%)' }}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 shadow hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value }}
                  onClick={() => handleHighlight(c.value)}
                  aria-label={`${c.label}色標記`}
                  title={`${c.label}色標記`}
                />
              ))}
            </div>
          )}
        </div>

        {activePanel === 'settings' && (
          <SettingsPanel
            darkMode={darkMode}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            fontFamily={fontFamily}
            onFontChange={setFontFamily}
            script={script}
            onScriptToggle={handleScriptToggle}
            readingDirection={readingDirection}
            onReadingDirectionChange={setReadingDirection}
            ttsPlaying={playing}
            onTTSPlay={handleTTSPlay}
            onTTSStop={handleTTSStop}
            ttsVoices={voices}
            ttsSelectedVoice={selectedVoice}
            onTTSVoiceChange={setSelectedVoice}
            ttsRate={rate}
            onTTSRateChange={setRate}
            ttsSleepMinutes={sleepMinutes}
            onTTSSleepChange={handleSleepChange}
            ttsSleepRemaining={sleepRemaining}
            lineHeight={lineHeight}
            onLineHeightChange={setLineHeight}
            letterSpacing={letterSpacing}
            onLetterSpacingChange={setLetterSpacing}
          />
        )}
        {activePanel === 'notes' && (
          <NotePanel
            onNavigate={handleNavigateToAnnotation}
            onChangeColor={handleChangeColor}
            onRemoveAnnotation={handleDeleteMark}
            darkMode={darkMode}
            bookTitle={bookTitle}
          />
        )}
        {activePanel === 'chapters' && (
          <ChapterPanel
            toc={toc}
            currentHref={currentHref}
            onNavigate={handleNavigateToChapter}
            darkMode={darkMode}
          />
        )}
        {activePanel === 'bookinfo' && bookRecord && (
          <BookInfoPanel
            record={bookRecord}
            getCoverDataUrl={getCoverDataUrl}
            darkMode={darkMode}
            onClose={() => setActivePanel(null)}
            progress={bookRecord.progress ?? (pageInfo && pageInfo.total > 0 ? pageInfo.page / pageInfo.total : null)}
          />
        )}
        {activePanel === 'bookmarks' && (() => {
          const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
          const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
          const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
          const ink3Col   = darkMode ? '#7a706a' : '#9a8f80'
          return (
            <div style={{ width: 260, flexShrink: 0, height: '100%', borderLeft: `1px solid ${borderCol}`, background: paperBg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${borderCol}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: inkCol }}>書籤清單</div>
                <button
                  onClick={() => setActivePanel(null)}
                  style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink3Col, cursor: 'pointer', transition: 'all .12s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = inkCol; e.currentTarget.style.background = darkMode ? '#231f1c' : '#f1ede4' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = ink3Col; e.currentTarget.style.background = 'transparent' }}
                  aria-label="關閉"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {bookmarks.length === 0 ? (
                  <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 12, color: ink3Col, letterSpacing: '0.04em' }}>尚無書籤</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {[...bookmarks].sort((a, b) => a.addedAt - b.addedAt).map((bm) => (
                      <div
                        key={bm.id}
                        style={{ borderBottom: `1px solid ${borderCol}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', transition: 'background .12s' }}
                        onClick={() => { renditionRef.current?.display(bm.cfi).catch(() => {}); setActivePanel(null) }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = darkMode ? '#231f1c' : '#f1ede4')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ fontFamily: SERIF, fontSize: 13, color: inkCol, lineHeight: 1.5, wordBreak: 'break-all' }}>
                          {bm.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.04em' }}>
                            {new Date(bm.addedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setBookmarkPendingDeleteId(bookmarkPendingDeleteId === bm.id ? null : bm.id) }}
                            style={{ fontFamily: MONO, fontSize: 10, color: bookmarkPendingDeleteId === bm.id ? '#ef4444' : ink3Col, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'all .12s', background: bookmarkPendingDeleteId === bm.id ? (darkMode ? '#3a1a1a' : '#fff0f0') : 'transparent' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = darkMode ? '#3a1a1a' : '#fff0f0' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = bookmarkPendingDeleteId === bm.id ? '#ef4444' : ink3Col; e.currentTarget.style.background = bookmarkPendingDeleteId === bm.id ? (darkMode ? '#3a1a1a' : '#fff0f0') : 'transparent' }}
                            aria-label="移除書籤"
                          >
                            移除
                          </button>
                        </div>
                        {bookmarkPendingDeleteId === bm.id && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                            <span style={{ fontFamily: MONO, fontSize: 11, color: '#ef4444', letterSpacing: '0.02em', flexShrink: 0 }}>確定移除？</span>
                            <button
                              style={{ height: 22, padding: '0 8px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: ink3Col, background: darkMode ? '#2a2520' : '#ede8e0', cursor: 'pointer' }}
                              onClick={() => setBookmarkPendingDeleteId(null)}
                            >取消</button>
                            <button
                              style={{ height: 22, padding: '0 8px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: '#fff', background: '#ef4444', cursor: 'pointer' }}
                              onClick={() => { handleDeleteBookmark(bm.id); setBookmarkPendingDeleteId(null) }}
                            >移除</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })()}
        {activePanel === 'mobilepanel' && (
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`, background: darkMode ? '#1a1816' : '#f9f7f2', overflow: 'hidden' }}>
            {/* Tab 切換列 */}
            <div style={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}` }}>
              {([
                { key: 'bookinfo',   label: '書籍' },
                { key: 'chapters',   label: '目錄' },
                { key: 'bookmarks',  label: '書籤' },
                { key: 'notes',      label: '註記' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 11, cursor: 'pointer', transition: 'all .12s',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace', letterSpacing: '0.04em',
                    borderBottom: `2px solid ${mobilePanelTab === key ? 'oklch(0.62 0.14 40)' : 'transparent'}`,
                    color: mobilePanelTab === key ? 'oklch(0.62 0.14 40)' : (darkMode ? '#7a706a' : '#9a8f80'),
                    touchAction: 'manipulation',
                  }}
                  onTouchEnd={(e) => { e.preventDefault(); setMobilePanelTab(key) }}
                  onClick={() => setMobilePanelTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 內容區 */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {mobilePanelTab === 'bookinfo' && bookRecord && (
                <BookInfoPanel
                  record={bookRecord}
                  getCoverDataUrl={getCoverDataUrl}
                  darkMode={darkMode}
                  progress={bookRecord.progress ?? (pageInfo && pageInfo.total > 0 ? pageInfo.page / pageInfo.total : null)}
                  embedded
                />
              )}
              {mobilePanelTab === 'chapters' && (
                <ChapterPanel toc={toc} currentHref={currentHref} onNavigate={handleNavigateToChapter} darkMode={darkMode} embedded />
              )}
              {mobilePanelTab === 'bookmarks' && (() => {
                const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
                const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
                const ink3Col   = darkMode ? '#7a706a' : '#9a8f80'
                return bookmarks.length === 0 ? (
                  <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 12, color: ink3Col, letterSpacing: '0.04em' }}>尚無書籤</div>
                ) : (
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {[...bookmarks].sort((a, b) => a.addedAt - b.addedAt).map((bm) => (
                      <div
                        key={bm.id}
                        style={{ borderBottom: `1px solid ${borderCol}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', transition: 'background .12s', touchAction: 'manipulation' }}
                        onClick={() => { renditionRef.current?.display(bm.cfi).catch(() => {}); setActivePanel(null) }}
                        onTouchEnd={(e) => { e.preventDefault(); renditionRef.current?.display(bm.cfi).catch(() => {}); setActivePanel(null) }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = darkMode ? '#231f1c' : '#f1ede4')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ fontFamily: SERIF, fontSize: 13, color: inkCol, lineHeight: 1.5, wordBreak: 'break-all' }}>
                          {bm.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.04em' }}>
                            {new Date(bm.addedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setBookmarkPendingDeleteId(bookmarkPendingDeleteId === bm.id ? null : bm.id) }}
                            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setBookmarkPendingDeleteId(bookmarkPendingDeleteId === bm.id ? null : bm.id) }}
                            style={{ fontFamily: MONO, fontSize: 10, color: bookmarkPendingDeleteId === bm.id ? '#ef4444' : ink3Col, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'all .12s', touchAction: 'manipulation', background: bookmarkPendingDeleteId === bm.id ? (darkMode ? '#3a1a1a' : '#fff0f0') : 'transparent' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = darkMode ? '#3a1a1a' : '#fff0f0' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = bookmarkPendingDeleteId === bm.id ? '#ef4444' : ink3Col; e.currentTarget.style.background = bookmarkPendingDeleteId === bm.id ? (darkMode ? '#3a1a1a' : '#fff0f0') : 'transparent' }}
                          >
                            移除
                          </button>
                        </div>
                        {bookmarkPendingDeleteId === bm.id && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }} onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
                            <span style={{ fontFamily: MONO, fontSize: 11, color: '#ef4444', letterSpacing: '0.02em', flexShrink: 0 }}>確定移除？</span>
                            <button
                              style={{ height: 22, padding: '0 8px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: ink3Col, background: darkMode ? '#2a2520' : '#ede8e0', cursor: 'pointer', touchAction: 'manipulation' }}
                              onClick={(e) => { e.stopPropagation(); setBookmarkPendingDeleteId(null) }}
                              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setBookmarkPendingDeleteId(null) }}
                            >取消</button>
                            <button
                              style={{ height: 22, padding: '0 8px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: '#fff', background: '#ef4444', cursor: 'pointer', touchAction: 'manipulation' }}
                              onClick={(e) => { e.stopPropagation(); handleDeleteBookmark(bm.id); setBookmarkPendingDeleteId(null) }}
                              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteBookmark(bm.id); setBookmarkPendingDeleteId(null) }}
                            >移除</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })()}
              {mobilePanelTab === 'notes' && (
                <NotePanel
                  onNavigate={handleNavigateToAnnotation}
                  onChangeColor={handleChangeColor}
                  onRemoveAnnotation={handleDeleteMark}
                  darkMode={darkMode}
                  bookTitle={bookTitle}
                  embedded
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 手機版底部進度列 — 永遠佔位避免 epub 初始化尺寸錯誤 */}
      <div
        className="flex md:hidden items-center"
        style={{
          height: 32, flexShrink: 0, gap: 10, padding: '0 16px',
          borderTop: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`,
          background: darkMode ? '#1a1816' : '#f9f7f2',
        }}
      >
        {ready && pageInfo && (
          <>
            <span style={{ fontFamily: MONO, fontSize: 10, color: darkMode ? '#7a706a' : '#9a8f80', whiteSpace: 'nowrap', letterSpacing: '0.04em', flexShrink: 0 }}>
              第 {pageInfo.page} 頁
            </span>
            <div style={{ flex: 1, height: 2, background: darkMode ? '#3a3430' : '#e4ddd0', borderRadius: 2 }}>
              <div style={{ width: `${Math.min(pageInfo.page / pageInfo.total * 100, 100)}%`, height: '100%', background: 'oklch(0.62 0.14 40)', borderRadius: 2, transition: 'width .3s' }} />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 10, color: darkMode ? '#7a706a' : '#9a8f80', whiteSpace: 'nowrap', letterSpacing: '0.04em', flexShrink: 0 }}>
              / {pageInfo.total} · {Math.round(pageInfo.page / pageInfo.total * 100)}%
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default Reader
