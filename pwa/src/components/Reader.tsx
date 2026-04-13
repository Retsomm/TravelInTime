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
import { useReaderStore } from '../store/useReaderStore'
import type { Script } from '../store/useReaderStore'
import { useAnnotationStore, loadAnnotationsForBook, saveAnnotationsForBook } from '../store/useAnnotationStore'
import { saveProgress, loadProgress, saveBookSettings, loadBookSettings } from '../hooks/useLibrary'
import type { BookRecord } from '../hooks/useLibrary'

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
  const bg = isDark ? '#111827' : '#fafaf9'
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
  injectStyle(doc, 'tit-font', `* { font-family: ${family} !important; }`)
  const fontKey = Object.keys(WEB_FONT_URLS).find(k => family.includes(k))
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
  { label: '粉', value: '#ec4899' },
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
}

const GRADIENTS = [
  'from-indigo-400 to-purple-500',
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-pink-500',
  'from-sky-400 to-blue-500',
  'from-violet-400 to-fuchsia-500',
]
const gradientFor = (id: string) => GRADIENTS[id.charCodeAt(0) % GRADIENTS.length]
const formatDate = (ts: number) =>
  ts ? new Date(ts).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'

const BookInfoPanel = ({ record, getCoverDataUrl, embedded }: { record: BookRecord; getCoverDataUrl: (id: string) => Promise<string | null>; embedded?: boolean }) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  useEffect(() => {
    setCoverUrl(null)
    if (!record.hasCover) return
    getCoverDataUrl(record.id).then((url) => { if (url) setCoverUrl(url) })
  }, [record.id, record.hasCover, getCoverDataUrl])

  const body = (
    <div className="overflow-y-auto flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-md">
          {coverUrl ? (
            <img src={coverUrl} alt={record.title} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradientFor(record.id)} flex items-end p-3`}>
              <span className="text-white text-4xl font-bold leading-none opacity-60 select-none">
                {record.title.charAt(0)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="px-4 flex flex-col gap-3 pb-5">
        <div>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 leading-snug">{record.title}</p>
          {record.author && (
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{record.author}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 text-xs text-stone-400 dark:text-stone-500">
          <div className="flex flex-col gap-0.5">
            <span>新增日期</span>
            <span className="text-stone-600 dark:text-stone-300">{formatDate(record.addedAt)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span>上次開啟</span>
            <span className="text-stone-600 dark:text-stone-300">
              {record.lastOpenedAt ? formatDate(record.lastOpenedAt) : '尚未記錄'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  if (embedded) return body

  return (
    <div className="w-56 shrink-0 flex flex-col border-l border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 shrink-0">
        <span className="text-sm font-medium text-stone-600 dark:text-stone-300">書籍資訊</span>
      </div>
      {body}
    </div>
  )
}

const Reader = ({ bookPath, bookId, bookRecord, getCoverDataUrl, onBack, darkMode, onToggleDark }: Props) => {
  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const chapterPagesRef = useRef<Map<number, number>>(new Map()) // spineIndex → 已渲染的章節總頁數
  const scanAbortRef = useRef<{ aborted: boolean }>({ aborted: false })
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAnnotationCfiRef = useRef<string | null>(null)

  const scriptRef = useRef<Script>('tc')
  const baseScriptRef = useRef<Script>('tc') // 書本原始語言，切換時用來判斷方向
  const readingDirectionRef = useRef<'ltr' | 'rtl'>('ltr')
  const darkModeRef = useRef(darkMode)
  const lastIframeClickRef = useRef({ x: 0, y: 0 }) // iframe 內最後一次點擊的主視窗座標
  const [activePanel, setActivePanel] = useState<'notes' | 'chapters' | 'settings' | 'bookinfo' | 'mobilepanel' | null>(null)
  const [mobilePanelTab, setMobilePanelTab] = useState<'bookinfo' | 'chapters' | 'notes'>('chapters')
  const [toc, setToc] = useState<TocItem[]>([])
  const [currentHref, setCurrentHref] = useState('')
  const [ready, setReady] = useState(false)
  const [popup, setPopup] = useState<{ x: number; y: number; cfi: string; text: string } | null>(null)
  const [editPopup, setEditPopup] = useState<{ x: number; y: number; annotationId: string } | null>(null)
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
  // 睡眠計時器
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null)
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sleepMinutesRef = useRef(0)
  // 供鍵盤事件存取最新的 prevPage/nextPage（避免閉包 stale 問題）
  const prevPageRef = useRef<() => void>(() => {})
  const nextPageRef = useRef<() => void>(() => {})
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
    chapterPagesRef.current.clear()

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
            chapterPagesRef.current.set(idx, d.total)
            // 逐章更新總頁數估算
            const known = chapterPagesRef.current
            const knownValues = [...known.values()]
            const avg = knownValues.reduce((a, b) => a + b, 0) / knownValues.length
            let totalPages = 0
            for (let i = 0; i < spineTotal; i++) totalPages += known.get(i) ?? avg
            setPageInfo(prev => prev ? { page: prev.page, total: Math.round(totalPages) } : prev)
          }
        } catch { /* 略過無法渲染的章節 */ }
        await new Promise<void>(r => setTimeout(r, 0)) // 讓 UI 有機會更新
      }
    } finally {
      hiddenEl.remove()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (hiddenRendition as any).destroy() } catch { /* ignore */ }
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
        setEditPopup({ x, y, annotationId })
      },
      `ann-${ann.id}`,
      { stroke: ann.color, 'stroke-opacity': '1', 'stroke-width': '1.5', fill: 'none' }
    )
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

  const removePendingAnnotation = (rendition: Rendition) => {
    if (!pendingAnnotationCfiRef.current) return
    try { rendition.annotations.remove(pendingAnnotationCfiRef.current, 'underline') } catch {}
    pendingAnnotationCfiRef.current = null
  }

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
      const store = useReaderStore.getState()
      store.setFontSize(savedSettings.fontSize)
      store.setFontFamily(savedSettings.fontFamily)
      store.setLineHeight(savedSettings.lineHeight)
      store.setLetterSpacing(savedSettings.letterSpacing)
      store.setReadingDirection(savedSettings.readingDirection)
      store.setScript(savedSettings.script)
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
        // 在 prototype 上 wrap 一次即覆蓋所有 rendition。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renditionProto = Object.getPrototypeOf(rendition) as any
        if (renditionProto.injectIdentifier && !renditionProto._injectIdentifierGuard) {
          const origInjectIdentifier = renditionProto.injectIdentifier
          renditionProto.injectIdentifier = function (this: { book?: { packaging?: unknown } }, doc: Document, section: unknown) {
            if (!this.book?.packaging) return doc
            return origInjectIdentifier.call(this, doc, section)
          }
          renditionProto._injectIdentifierGuard = true
        }

        // 修復預分頁 ePub 圖片重複問題：epub-container 是 flex 容器，預設 justify-content: center
        // 會將 1258px 的 spread epub-view 置中於 629px 容器，使可視區域落在 x=314~943，
        // 導致左右兩頁圖片各露出一半，看起來像兩張相同圖片偏移顯示。
        // 強制 flex-start 讓 epub-view 從左側對齊，只顯示 x=0~629（單頁）。
        const epubLayoutFix = document.createElement('style')
        epubLayoutFix.id = 'tit-epub-layout-fix'
        epubLayoutFix.textContent = '.epub-container { justify-content: flex-start !important; }'
        document.head.appendChild(epubLayoutFix)

        rendition.hooks.content.register((view: unknown) => {
          // hooks.content 的第一個參數是 IframeView（非 Contents）
          // 利用此時機在 hooks.render（Annotations.inject）執行前修補 IframeView.prototype
          const proto = Object.getPrototypeOf(view) as Record<string, unknown>

          // epub.js bug 修補：IframeView.underline 未檢查 contents.range() 是否為 null
          // 若 CFI 在當前章節找不到節點，toRange 回傳 null → Underline(null Range) 被建立
          // 之後 Pane.render → filteredRanges → this.range.getClientRects() 就會 crash
          if (!proto._nullRangeGuard) {
            const origUnderline = proto.underline as (...a: unknown[]) => unknown
            proto.underline = function (
              this: Record<string, unknown>,
              cfiRange: string,
              ...rest: unknown[]
            ) {
              const c = this.contents as { range: (cfi: string) => Range | null } | undefined
              if (!c) return null
              const range = c.range(cfiRange)
              if (!range) {
                console.warn('[Annotation] CFI 解析失敗，略過建立 underline（可能為舊版無效資料）:', cfiRange)
                return null
              }
              return origUnderline.call(this, cfiRange, ...rest)
            }
            proto._nullRangeGuard = true
          }

          // 第二道防護（prototype 層）：wrap IframeView.prototype.reframe
          // reframe 在章節跳轉後 layout 更新時呼叫所有 view 的 pane.render()，
          // 若 Underline 持有 null range 就會 crash；在 prototype 上 wrap 一次即覆蓋所有 view
          if (!proto._reframeGuard) {
            const origReframe = proto.reframe as ((...a: unknown[]) => unknown) | undefined
            if (typeof origReframe === 'function') {
              proto.reframe = function (this: unknown, ...args: unknown[]) {
                try { return origReframe.apply(this, args) } catch (e) {
                  console.warn('[epubjs] reframe null range 異常，已略過:', e)
                }
              }
            }
            proto._reframeGuard = true
          }

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
            if (isSelectingRef.current || Date.now() - popupSetTime < 600) return
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
            // 防止在註解選取期間翻頁
            if (isSelectingRef.current) return
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
                const sel = doc.defaultView?.getSelection()
                if (!sel || sel.isCollapsed || !sel.rangeCount) {
                  isSelectingRef.current = false
                  return
                }
                const text = sel.toString().trim()
                if (!text || !viewContents) {
                  isSelectingRef.current = false
                  return
                }
                const range = sel.getRangeAt(0).cloneRange()
                let cfi: string
                try { cfi = viewContents.cfiFromRange(range) } catch {
                  isSelectingRef.current = false
                  return
                }
                const rect = range.getBoundingClientRect()
                const iframeEl = viewerRef.current?.querySelector('iframe')
                const iframeRect = iframeEl?.getBoundingClientRect()
                if (!iframeRect) {
                  isSelectingRef.current = false
                  return
                }
                // 行動裝置：新增暫時視覺高亮，避免 native selection 消失後使用者看不到選取範圍
                if (renditionRef.current) addPendingAnnotation(renditionRef.current, cfi)
                sel.removeAllRanges()
                popupSetTime = Date.now()
                setPopup({
                  x: iframeRect.left + rect.left + rect.width / 2,
                  y: Math.max(iframeRect.top + rect.top, 80),
                  cfi,
                  text,
                })
                isSelectingRef.current = false
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

          setPopup({
            x: iframeRect.left + rect.left + rect.width / 2,
            y: iframeRect.top + rect.top,
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
          if (l?.start?.cfi) saveProgress(bookId, l.start.cfi)
          setAtStart(l?.atStart ?? false)
          setAtEnd(l?.atEnd ?? false)
          atEndRef.current = l?.atEnd ?? false

          // 章節剩餘頁（左側小字）
          const d = l?.start?.displayed as { page: number; total: number } | undefined
          if (d) setChapterRemaining(d.total - d.page)

          // 全書頁碼（右下角）：以 chapterPagesRef 累計章節真實頁數計算當前位置
          // 背景掃描（scanAllChapterPages）會逐章填入精確頁數，這裡同步更新主渲染章節並重新計算
          const spineIdx = l?.start?.index as number | undefined
          if (d && spineIdx !== undefined) {
            currentSpineIndexRef.current = spineIdx // 同步追蹤當前合法的 spine 索引
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const spineTotal: number = (bookRef.current as any)?.spine?.items?.length ?? 1
            chapterPagesRef.current.set(spineIdx, d.total) // 主渲染的真實章節頁數
            const known = chapterPagesRef.current
            const knownValues = [...known.values()]
            const avg = knownValues.reduce((a, b) => a + b, 0) / knownValues.length
            let prevPages = 0
            for (let i = 0; i < spineIdx; i++) prevPages += known.get(i) ?? avg
            let totalPages = 0
            for (let i = 0; i < spineTotal; i++) totalPages += known.get(i) ?? avg
            const globalPage = prevPages + d.page
            setPageInfo({ page: Math.max(Math.round(globalPage), 1), total: Math.max(Math.round(totalPages), Math.round(globalPage)) })
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
      setBookTitle('')
      setPageInfo(null)
      chapterPagesRef.current.clear()
      setChapterRemaining(null)
      setAtStart(false)
      setAtEnd(false)
      stop()
      unsubAnnotations() // 先 unsub，再 clearAll，避免儲存空陣列覆蓋 localStorage
      clearAnnotations()
      renditionRef.current = null
      bookRef.current?.destroy()
      bookRef.current = null
    }
  }, [bookPath, bookId, stop, resetScript, setScript, clearAnnotations, loadForBook])

  // 字體大小（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    fontSizeRef.current = fontSize
    try { renditionRef.current?.themes.override('font-size', `${fontSize}px`) } catch { /* epubjs 時序問題，忽略 */ }
    triggerScan()
  }, [fontSize, ready, triggerScan])

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
    fontFamilyRef.current = fontFamily
    try { renditionRef.current?.themes.override('font-family', fontFamily) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyFontFamilyOverride(doc, fontFamily))
    rerenderAnnotationPane()
    triggerScan()
  }, [fontFamily, ready, triggerScan])

  // 行距（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    lineHeightRef.current = lineHeight
    try { renditionRef.current?.themes.override('line-height', String(lineHeight)) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyLineHeightOverride(doc, lineHeight))
    rerenderAnnotationPane()
    triggerScan()
  }, [lineHeight, ready, triggerScan])

  // 字距（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    letterSpacingRef.current = letterSpacing
    try { renditionRef.current?.themes.override('letter-spacing', `${letterSpacing}em`) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyLetterSpacingOverride(doc, letterSpacing))
    rerenderAnnotationPane()
    triggerScan()
  }, [letterSpacing, ready, triggerScan])

  // 深色模式（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    darkModeRef.current = darkMode
    try {
      if (darkMode) {
        renditionRef.current?.themes.override('color', '#e5e7eb')
        renditionRef.current?.themes.override('background', '#111827')
      } else {
        renditionRef.current?.themes.override('color', '#1c1917')
        renditionRef.current?.themes.override('background', '#fafaf9')
      }
    } catch { /* epubjs 時序問題，忽略 */ }
    const doc = viewerRef.current?.querySelector('iframe')?.contentDocument
    if (doc) applyDarkOverride(doc, darkMode)
  }, [darkMode, ready])

  const prevPage = () => {
    if (!ready) return
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    setPopup(null)
    renditionRef.current?.prev()
  }

  const nextPage = () => {
    if (!ready) return
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    setPopup(null)
    renditionRef.current?.next()
  }

  // 保持 ref 指向最新版本，供 iframe 內鍵盤事件使用
  prevPageRef.current = prevPage
  nextPageRef.current = nextPage

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

  const togglePanel = (panel: 'notes' | 'chapters' | 'settings' | 'bookinfo' | 'mobilepanel') =>
    setActivePanel((cur) => (cur === panel ? null : panel))

  const speakCurrentPage = useCallback(() => {
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
  }, [speak])

  // 背景載入後續章節並繼續朗讀，不翻頁
  const continueFromSpine = useCallback((spineIdx: number) => {
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
  }, [speak])

  useEffect(() => { continueFromSpineRef.current = continueFromSpine }, [continueFromSpine])

  const clearSleepTimer = useCallback(() => {
    if (sleepIntervalRef.current !== null) {
      clearInterval(sleepIntervalRef.current)
      sleepIntervalRef.current = null
    }
    setSleepRemaining(null)
  }, [])

  const startSleepTimer = useCallback((minutes: number) => {
    if (sleepIntervalRef.current !== null) {
      clearInterval(sleepIntervalRef.current)
      sleepIntervalRef.current = null
    }
    if (minutes <= 0) { setSleepRemaining(null); return }
    let remaining = minutes * 60
    setSleepRemaining(remaining)
    sleepIntervalRef.current = setInterval(() => {
      remaining--
      setSleepRemaining(remaining)
      if (remaining <= 0) {
        if (sleepIntervalRef.current !== null) {
          clearInterval(sleepIntervalRef.current)
          sleepIntervalRef.current = null
        }
        setSleepRemaining(null)
        stop()
      }
    }, 1000)
  }, [stop])

  const handleSleepChange = useCallback((minutes: number) => {
    setSleepMinutes(minutes)
    sleepMinutesRef.current = minutes
    if (playing) {
      if (minutes > 0) startSleepTimer(minutes)
      else clearSleepTimer()
    }
  }, [playing, startSleepTimer, clearSleepTimer])

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
      className="flex flex-col h-screen bg-stone-50 dark:bg-gray-900"
      onClick={() => { setPopup(null); setEditPopup(null) }}
    >
      <Toolbar
        onBack={onBack}
        bookTitle={bookTitle}
        darkMode={darkMode}
        onToggleDark={onToggleDark}
        onToggleMobilePanel={() => togglePanel('mobilepanel')}
        onToggleBookInfo={() => togglePanel('bookinfo')}
        onToggleNotes={() => togglePanel('notes')}
        onToggleChapters={() => togglePanel('chapters')}
        onToggleSettings={() => togglePanel('settings')}
        activePanel={activePanel}
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
            const isRtl = readingDirection === 'rtl'
            if ((dx < 0) !== isRtl) nextPage()
            else prevPage()
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
          <div ref={viewerRef} className="absolute top-2 bottom-7 left-0 right-0 overflow-hidden" />

          {/* 頁面資訊：底部 */}
          {ready && (
            <div className="absolute bottom-2 left-14 right-14 flex justify-between z-10 pointer-events-none">
              <span className="text-xs text-stone-400 dark:text-stone-500 select-none">
                {chapterRemaining !== null ? `這一章還有 ${chapterRemaining} 頁` : ''}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500 select-none">
                {pageInfo ? `第 ${pageInfo.page} 頁（共 ${pageInfo.total} 頁）` : ''}
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
              style={{
                left: Math.min(Math.max(editPopup.x, 115), window.innerWidth - 115),
                top: editPopup.y - 52 >= 8 ? editPopup.y - 52 : Math.min(editPopup.y + 8, window.innerHeight - 52),
                transform: 'translateX(-50%)',
              }}
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
              style={{
                left: Math.min(Math.max(popup.x, 98), window.innerWidth - 98),
                top: popup.y - 52 >= 8 ? popup.y - 52 : Math.min(popup.y + 8, window.innerHeight - 52),
                transform: 'translateX(-50%)',
              }}
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
          />
        )}
        {activePanel === 'bookinfo' && bookRecord && (
          <BookInfoPanel record={bookRecord} getCoverDataUrl={getCoverDataUrl} />
        )}
        {activePanel === 'mobilepanel' && (
          <div className="w-64 shrink-0 flex flex-col border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-gray-800 overflow-hidden">
            {/* Tab 切換列 */}
            <div className="flex shrink-0 border-b border-stone-200 dark:border-stone-700">
              {([
                { key: 'bookinfo', label: '書籍' },
                { key: 'chapters', label: '目錄' },
                { key: 'notes',    label: '註記' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  className={`flex-1 py-2.5 text-xs font-medium transition border-b-2 ${
                    mobilePanelTab === key
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                  }`}
                  onClick={() => setMobilePanelTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 內容區 */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {mobilePanelTab === 'bookinfo' && bookRecord && (
                <BookInfoPanel record={bookRecord} getCoverDataUrl={getCoverDataUrl} embedded />
              )}
              {mobilePanelTab === 'chapters' && (
                <ChapterPanel toc={toc} currentHref={currentHref} onNavigate={handleNavigateToChapter} embedded />
              )}
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
    </div>
  )
}

export default Reader
