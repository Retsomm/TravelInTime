import { useCallback, useEffect, useRef, useState } from 'react'
import ePub from 'epubjs'
import type { Book, Rendition } from 'epubjs'
import type { TocItem } from '@/components/ChapterPanel'
import type { TTSProgressSource } from '@/hooks/useTTS'
import { DEFAULT_SETTINGS, useReaderStore } from '@/store/useReaderStore'
import type { Script } from '@/store/useReaderStore'
import { useAnnotationStore, loadAnnotationsForBook, saveAnnotationsForBook } from '@/store/useAnnotationStore'
import type { Annotation } from '@/store/useAnnotationStore'
import { saveProgress, loadProgress, saveBookSettings, loadBookSettings } from '@/hooks/useLibrary'
import type { BookRecord } from '@/hooks/useLibrary'
import { patchBookPrototype, patchIframeViewPrototype, patchRenditionPrototype } from '@/components/Reader/epubPatches'
import { applyDarkOverride, applyFontFamilyOverride, applyFontSizeOverride, applyLetterSpacingOverride, applyLineHeightOverride, applyWritingModeOverride, normalizeFontFamily } from '@/components/Reader/readerStyles'
import { convertDoc, getToSC, getToTC, restoreDoc } from '@/components/Reader/scriptConversion'
import { DEBUG_TTS_FOLLOW, TTS_HIGHLIGHT_INTERVAL, TTS_NEW_PAGE_AUTO_FOLLOW_GUARD, TTS_PAGE_END_FIXED_LEAD, TTS_USER_INPUT_GRACE, clearTTSHighlight, clearTTSHighlights, collectContentDocuments, createRangeFromTextOffset, ensureTTSHighlightStyle, getBoundaryOffsetFromRange, getTTSRangeViewportState, getTextIndex, paintTTSHighlightOverlay, ttsTextIndexCache } from '@/components/Reader/ttsHighlight'
import { computeAccurateTotal, computeChapterAverage, computeGlobalPage, clampProgressRatio, resolveInitialPageInfo } from '@/components/Reader/progressCalculations'
import { resolveSpineTarget } from '@/components/Reader/tocLookup'
import { computeApproxOffsetFromPercentage, computeContinuousPage, computePageEntryGuard, computePageTurnOffset, locateApproxOffsetByFuzzyMatch, shouldAdvanceTTSPage, snapOffsetToWordStart } from '@/components/Reader/ttsFollowCalculations'

const DEBUG_READER_LOG = false

type PageInfo = { page: number; total: number }
type PopupState = { left: number; top: number; cfi: string; text: string } | null
type EditPopupState = { left: number; top: number; annotationId: string } | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLoc = any

// book/rendition 生命週期與 TTS 跟讀邏輯實際上雙向耦合（relocated 事件會呼叫 TTS 的頁尾更新函數，
// TTS 又依賴 book 初始化時建立的 currentDocRef／ttsVisibleSpineIndexRef 等狀態），因此合併為單一 hook，
// 而非強行拆成兩個獨立但仍要互相呼叫的檔案。
export const useReaderEngine = (params: {
  bookPath: string
  bookId: string
  bookRecord: BookRecord | null
  darkMode: boolean
  activePanel: string | null
  onUpdateProgress?: (pct: number) => void

  viewerRef: { current: HTMLDivElement | null }
  bookRef: { current: Book | null }
  renditionRef: { current: Rendition | null }
  lastIframeClickRef: { current: { x: number; y: number } }

  fontSize: number
  fontFamily: string
  script: Script
  lineHeight: number
  letterSpacing: number
  readingDirection: 'ltr' | 'rtl'
  setFontFamily: (v: string) => void
  setScript: (v: Script) => void
  resetScript: () => void
  fontSizeRef: { current: number }
  fontFamilyRef: { current: string }
  lineHeightRef: { current: number }
  letterSpacingRef: { current: number }

  playing: boolean
  ttsPaused: boolean
  speak: (text: string, onDone: () => void, onProgress: (charIdx: number, source: TTSProgressSource) => void) => void
  pause: () => void
  resume: () => void
  stop: () => void
  resetTTS: () => void
  ttsActiveRef: { current: boolean }

  chapterPagesRef: { current: Map<number, number> }
  currentChapterPageRef: { current: number }
  bookBufferRef: { current: ArrayBuffer | null }
  scanAllChapterPages: () => Promise<void>
  triggerScan: () => void
  cancelScan: () => void
  resetScanState: () => void

  setPopup: (v: PopupState) => void
  setEditPopup: (v: EditPopupState) => void
  pendingAnnotationCfiRef: { current: string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEpubAnnotation: (rendition: Rendition, ann: { cfi: string; color: string; id: string }) => void
  addPendingAnnotation: (rendition: Rendition, cfi: string) => void
  removePendingAnnotation: (rendition: Rendition) => void

  pageInfo: PageInfo | null
  setPageInfo: (updater: PageInfo | null | ((prev: PageInfo | null) => PageInfo | null)) => void

  loadForBook: (annotations: Annotation[]) => void
  clearAnnotations: () => void
  resetBookmarks: () => void
}) => {
  const {
    bookPath, bookId, bookRecord, darkMode, activePanel, onUpdateProgress,
    viewerRef, bookRef, renditionRef, lastIframeClickRef,
    fontSize, fontFamily, script, lineHeight, letterSpacing, readingDirection,
    setFontFamily, setScript, resetScript,
    fontSizeRef, fontFamilyRef, lineHeightRef, letterSpacingRef,
    playing, ttsPaused, speak, pause, resume, stop, resetTTS, ttsActiveRef,
    chapterPagesRef, currentChapterPageRef, bookBufferRef, scanAllChapterPages, triggerScan, cancelScan, resetScanState,
    setPopup, setEditPopup, pendingAnnotationCfiRef, addEpubAnnotation, addPendingAnnotation, removePendingAnnotation,
    pageInfo, setPageInfo,
    loadForBook, clearAnnotations, resetBookmarks,
  } = params

  const bookRecordRef = useRef(bookRecord)
  useEffect(() => { bookRecordRef.current = bookRecord }, [bookRecord])

  const scriptRef = useRef<Script>('tc')
  const baseScriptRef = useRef<Script>('tc') // 書本原始語言，切換時用來判斷方向
  const readingDirectionRef = useRef<'ltr' | 'rtl'>('ltr')
  const darkModeRef = useRef(darkMode)
  const [currentCfi, setCurrentCfi] = useState<string>('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [currentHref, setCurrentHref] = useState('')
  const [ready, setReady] = useState(false)
  const [bookTitle, setBookTitle] = useState('')
  const [chapterRemaining, setChapterRemaining] = useState<number | null>(null)
  const [atStart, setAtStart] = useState(false)
  const [atEnd, setAtEnd] = useState(false)
  const atEndRef = useRef(false)
  const continueFromSpineRef = useRef<(spineIdx: number) => void>(() => {})
  const currentSpineIndexRef = useRef<number>(-1) // 追蹤當前合法的 spine 索引，用於朗讀時的備選
  const loadingAbortRef = useRef<{ aborted: boolean }>({ aborted: false }) // 追蹤異步章節載入，支持取消
  const isSelectingRef = useRef(false) // 追蹤是否正在選取文字，避免選取期間翻頁
  const currentDocRef = useRef<Document | null>(null)
  const ttsContentDocsRef = useRef<Set<Document>>(new Set())
  const ttsHighlightedDocRef = useRef<Document | null>(null)
  const ttsVisibleStartOffsetRef = useRef(0)
  const ttsCurrentPageStartOffsetRef = useRef<number | null>(null)
  const ttsVisiblePageEndOffsetRef = useRef<number | null>(null)
  const ttsLastAbsoluteOffsetRef = useRef(0)
  const ttsVisibleSpineIndexRef = useRef<number | null>(null)
  const ttsChapterTextLengthRef = useRef(0)
  const ttsChapterPageTotalRef = useRef(1)
  const ttsAutoFollowBusyRef = useRef(false)
  const ttsAutoFollowLastAtRef = useRef(0)
  const ttsAutoFollowUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ttsAutoFollowSequenceRef = useRef(0)
  const ttsAutoFollowPendingRef = useRef<{
    sequence: number
    fromPage: number
    fromOffset: number
    fromPageStartOffset: number | null
    fromPageEndOffset: number | null
  } | null>(null)
  const ttsManualNavigationUntilRef = useRef(0)
  const ttsUserInputUntilRef = useRef(0)
  const ttsHighlightFrameRef = useRef<number | null>(null)
  const ttsHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ttsPendingHighlightRef = useRef<{ absoluteOffset: number; allowAutoFollow: boolean; source: TTSProgressSource } | null>(null)
  const ttsLastHighlightAtRef = useRef(0)
  const ttsLastFollowDebugAtRef = useRef(0)
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop }, [stop])

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

  useEffect(() => {
    if (!pageInfo || pageInfo.total <= 0) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineTotal: number = (bookRef.current as any)?.spine?.items?.length ?? 1
    const knownChapters = chapterPagesRef.current.size
    if (knownChapters < spineTotal) {
      // 掃描尚未完成，估算不可靠，跳過存入避免覆蓋 Library 正確進度
      if (DEBUG_READER_LOG) console.log('[Progress] 跳過存入（掃描中）', { knownChapters, spineTotal, estimatedPct: `${Math.round(pageInfo.page / pageInfo.total * 100)}%` })
      return
    }
    const rawRatio = pageInfo.page / pageInfo.total
    // 朗讀播放中，視覺頁碼可能超前於音訊，避免提早存入 100%
    const ratio = clampProgressRatio(rawRatio, ttsActiveRef.current)
    if (DEBUG_READER_LOG) console.log('[Progress] 存入 Library', {
      page: pageInfo.page,
      total: pageInfo.total,
      pct: `${Math.round(rawRatio * 100)}%`,
      stored: `${Math.round(ratio * 100)}%`,
    })
    onUpdateProgress?.(ratio)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageInfo])

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
        if (DEBUG_READER_LOG) console.log('[Reader] 頁面進入背景，取消待處理的異步操作')
        loadingAbortRef.current.aborted = true
      } else {
        if (DEBUG_READER_LOG) console.log('[Reader] 頁面回到前台，重置操作取消標誌')
        loadingAbortRef.current.aborted = false
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
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
      // 這本書沒有自己存過的排版設定，重設整個 store 回預設值，避免沿用同一個 session
      // 裡前一本書留下的設定（尤其 readingDirection，見 useReaderStore.ts 的說明）
      useReaderStore.getState().resetToDefaults()
      resetScript()
      scriptRef.current = DEFAULT_SETTINGS.script
      fontFamilyRef.current = DEFAULT_SETTINGS.fontFamily
      // fontSizeRef/lineHeightRef/letterSpacingRef 只在 ready 之後才會被上面的
      // useEffect 同步（見下方 `if (!ready) return` 那幾個 effect），開新書當下
      // ready 還是 false，若不在這裡立即同步，第一次渲染的內文（hooks.content
      // register）會直接讀到前一本書留下的數值，而不是這裡剛重設的預設值。
      fontSizeRef.current = DEFAULT_SETTINGS.fontSize
      lineHeightRef.current = DEFAULT_SETTINGS.lineHeight
      letterSpacingRef.current = DEFAULT_SETTINGS.letterSpacing
    }

    // 設定 annotation 自動儲存（先 unsub 再 clearAll，避免 clear 覆蓋 localStorage）
    const unsubAnnotations = useAnnotationStore.subscribe((state) => {
      saveAnnotationsForBook(bookId, state.annotations)
    })

    fetch(bookPath)
      .then((res) => {
        if (!res.ok) throw new Error(`載入書本檔案失敗: ${res.status} ${res.statusText}`)
        return res.arrayBuffer()
      })
      .then((buffer) => {
        if (destroyed) return

        bookBufferRef.current = buffer
        const book = ePub(buffer)
        bookRef.current = book

        // epub.js bug 修補：book.destroy() 後 this.resources 會變成 undefined，若此時
        // replacements()/replaceCss() 的非同步鏈仍在跑就會 crash（dev 模式下 effect
        // 重複掛載很容易踩到：先建立又立刻 destroy 的那個 book 實例）。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patchBookPrototype(Object.getPrototypeOf(book) as any)

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

        // 部分書本（尤其直式排版的中文書）OPF spine 帶 page-progression-direction="rtl"，
        // epub.js 在 rendition 啟動時會據此自動把整個 rendition 設成「從右到左」翻頁——
        // 不只是文字方向，連 manager 的 next()/prev() 捲動方向、分頁欄位的填色順序都會反過來。
        // 這裡永遠強制成 ltr，不跟著使用者設定面板的「翻頁方向」偏好走：epub.js 的分頁引擎
        // （contents.js columns()）跟 manager 的 next()/prev() 是用同一個 direction 值決定
        // CSS 多欄排版順序「跟」捲動方向要不要反過來，這個 direction 一旦設成 rtl，內文的
        // CSS 排版（欄位順序、text-align/bidi）也會跟著整個鏡射變成靠右、行內文字順序顛倒
        // ——但「翻頁方向」這個設定在使用者的認知裡只是「按哪個按鈕/往哪滑算是下一頁」的
        // 操作偏好，不應該連動影響內文排版本身要不要鏡射。所以兩者要拆開：epub.js 內部的
        // direction 永遠固定 ltr（讓內文排版跟分頁邏輯保持正常、一致），使用者的翻頁方向
        // 偏好只透過下面 prevPage/nextPage 呼叫時的按鈕/手勢對應去實現（見 nextPage/prevPage
        // 呼叫端 `readingDirection === 'rtl' ? nextPage : prevPage` 那段），不會碰到這裡。
        // 這段必須在第一次 rendition.display() 之前完成：epub.js 的 rendition.direction()
        // 內部若偵測到 manager 已經 render 過（this.manager.isRendered() && this.location
        // 皆為真），會自動觸發 this.manager.clear() + this.display(this.location.start.cfi)
        // 重新導頁一次。若這段跟下面 book.ready 分頭啟動的 rendition.display(savedCfi) 沒有
        // 先後保證，兩者的執行順序取決於 promise microtask 排程而非程式碼順序，一旦 display()
        // 先跑完，接著才跑到這裡的 direction()/layout() 就會在使用者剛打開書時觸發一次「強制
        // 翻頁」的重新導頁，且容易落在跟原本不同的頁面（表現成「一開始就強制往左翻頁，然後
        // 翻到看似章節末頁又跳回第一頁」）。因此改成回傳這個 promise，讓下面 book.ready 的
        // rendition.display() 明確等它完成後才呼叫。
        const forceReadingDirection = rendition.started.then(() => {
          if (destroyed) return
          try {
            const direction = 'ltr' as const
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const globalLayoutProperties = (rendition.settings as any).globalLayoutProperties
            const props = { ...globalLayoutProperties, direction }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(rendition.settings as any).globalLayoutProperties = props
            rendition.direction(direction)
            rendition.layout(props)
          } catch (err) {
            // 方向修正失敗不該卡住開書：寧可維持這本書可能沒被修正的原始翻頁方向，
            // 也要讓下面等待這個 promise 的 display() 繼續執行。
            console.warn('[Reader] forceReadingDirection 方向修正失敗，略過:', err)
          }
        }).catch((err) => {
          console.warn('[Reader] forceReadingDirection: rendition.started 失敗，略過方向修正:', err)
        })

        rendition.hooks.content.register((view: unknown) => {
          // epub.js bug 修補：IframeView.underline null range crash、reframe null range crash
          patchIframeViewPrototype(Object.getPrototypeOf(view) as Record<string, unknown>)

          const doc = (view as { document: Document }).document
          currentDocRef.current = doc
          ttsContentDocsRef.current.add(doc)
          ttsTextIndexCache.delete(doc)
          clearTTSHighlight(doc)
          // 內文排版方向永遠固定 ltr，理由同上面 forceReadingDirection 的說明——不跟隨
          // 使用者的翻頁方向偏好，那個偏好只影響按鈕/手勢要呼叫 next 還是 prev
          applyWritingModeOverride(doc, 'ltr')

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
            noteUserInteraction()
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
            // 正在選取文字或有選取範圍時不翻頁
            if (isSelectingRef.current) return
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
          applyFontSizeOverride(doc, fontSizeRef.current)
          applyLineHeightOverride(doc, lineHeightRef.current)
          applyLetterSpacingOverride(doc, letterSpacingRef.current)
          ensureTTSHighlightStyle(doc)

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
          const l = loc as AnyLoc
          setCurrentHref((l?.start?.href ?? '').split('#')[0])
          if (l?.start?.cfi) {
            saveProgress(bookId, l.start.cfi)
            setCurrentCfi(l.start.cfi)
          }
          setAtStart(l?.atStart ?? false)
          setAtEnd(l?.atEnd ?? false)
          atEndRef.current = l?.atEnd ?? false
          if (ttsActiveRef.current) {
            setTimeout(() => {
              const activeDoc = currentDocRef.current
              if (activeDoc) clearOtherTTSHighlights(activeDoc)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              refreshTTSPageEndOffset('relocated 後用 end.cfi 更新頁尾', (renditionRef.current as any)?.currentLocation?.())
            }, 120)
          }
          const pendingAutoFollow = ttsAutoFollowPendingRef.current
          if (ttsAutoFollowBusyRef.current && pendingAutoFollow) {
            console.log('[TTS:follow] relocated 後等待版面穩定再解鎖自動翻頁', {
              href: l?.start?.href,
              spineIdx: l?.start?.index,
              displayed: l?.start?.displayed,
              sequence: pendingAutoFollow.sequence,
              fromPage: pendingAutoFollow.fromPage,
              fromOffset: pendingAutoFollow.fromOffset,
            })
            if (ttsAutoFollowUnlockTimerRef.current) {
              clearTimeout(ttsAutoFollowUnlockTimerRef.current)
            }
            const sequence = pendingAutoFollow.sequence
            ttsAutoFollowUnlockTimerRef.current = setTimeout(() => {
              if (ttsAutoFollowPendingRef.current?.sequence !== sequence) return
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              unlockTTSAutoFollow('relocated 後解鎖前用 end.cfi 更新頁尾', (renditionRef.current as any)?.currentLocation?.())
              console.log('[TTS:follow] relocated 後已解鎖自動翻頁', { sequence })
            }, 450)
          }

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
            const avg = computeChapterAverage(known)
            const page = computeGlobalPage(spineIdx, d.page, known, avg)
            if (DEBUG_READER_LOG) console.log('[Progress] relocated 頁碼計算', {
              spineIdx,
              spineTotal,
              chapterPage: d.page,
              chapterTotal: d.total,
              knownChapters: known.size,
              avg: Math.round(avg),
              page,
              isEstimated: known.size < spineTotal,
            })
            setPageInfo(prev => {
              if (prev) return { page, total: Math.max(prev.total, page) }
              const estimatedTotal = Math.max(computeAccurateTotal(spineTotal, known, avg), page)
              // 掃描未完成時，以 stored progress 換算初始頁碼，確保顯示正確 %
              return resolveInitialPageInfo({
                storedProgress: bookRecordRef.current?.progress,
                estimatedTotal,
                knownSize: known.size,
                spineTotal,
                page,
              })
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

            // 等待上面的翻頁方向修正完成，確保第一次 display() 不會跟 direction()/layout()
            // 內部可能觸發的重新導頁互相搶跑
            return forceReadingDirection.then(() => {
              // 等待期間元件可能已經卸載（換書／離開閱讀畫面），不能再對已卸載的
              // rendition 呼叫 display。
              if (destroyed) return
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
      resetScanState()
      setReady(false)
      setPopup(null)
      setToc([])
      setCurrentHref('')
      setCurrentCfi('')
      cancelScheduledTTSHighlight()
      clearAllTTSHighlights()
      currentDocRef.current = null
      ttsContentDocsRef.current.clear()
      ttsVisibleSpineIndexRef.current = null
      ttsVisibleStartOffsetRef.current = 0
      ttsCurrentPageStartOffsetRef.current = null
      ttsVisiblePageEndOffsetRef.current = null
      ttsLastAbsoluteOffsetRef.current = 0
      ttsChapterTextLengthRef.current = 0
      ttsChapterPageTotalRef.current = 1
      ttsAutoFollowBusyRef.current = false
      ttsAutoFollowLastAtRef.current = 0
      ttsAutoFollowPendingRef.current = null
      ttsManualNavigationUntilRef.current = 0
      if (ttsAutoFollowUnlockTimerRef.current) {
        clearTimeout(ttsAutoFollowUnlockTimerRef.current)
        ttsAutoFollowUnlockTimerRef.current = null
      }
      resetBookmarks()
      setBookTitle('')
      setPageInfo(null)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookPath, bookId, resetScript, setScript, clearAnnotations, loadForBook])

  // 取得當前 epubjs view 的 document（比 querySelector('iframe').contentDocument 更可靠，
  // 避免 blob: iframe cross-origin 限制導致 contentDocument 為 null）
  const applyToCurrentDoc = (fn: (doc: Document) => void) => {
    renditionRef.current?.views().forEach((view: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (view as any).document as Document | undefined
      if (doc) fn(doc)
    })
  }

  // 字體大小（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    fontSizeRef.current = fontSize
    try { renditionRef.current?.themes.override('font-size', `${fontSize}px`) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyFontSizeOverride(doc, fontSize))
    triggerScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize, ready])

  // 文字排版改變後，重新計算 marks-pane SVG 座標（pane.render 會重呼叫 getClientRects）
  const rerenderAnnotationPane = () => {
    setTimeout(() => {
      renditionRef.current?.views().forEach((view: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (view as any).pane?.render()
      })
    }, 50)
  }

  const getVisibleContentDocument = (): Document | null => {
    const viewer = viewerRef.current
    if (!viewer) return null

    const iframe = viewer.querySelector('iframe') as HTMLIFrameElement | null
    if (iframe?.contentDocument?.body) return iframe.contentDocument

    const viewerRect = viewer.getBoundingClientRect()
    let best: { doc: Document; area: number } | null = null
    for (const frame of Array.from(viewer.querySelectorAll('iframe')) as HTMLIFrameElement[]) {
      try {
        const doc = frame.contentDocument
        if (!doc?.body) continue
        const rect = frame.getBoundingClientRect()
        const width = Math.max(0, Math.min(rect.right, viewerRect.right) - Math.max(rect.left, viewerRect.left))
        const height = Math.max(0, Math.min(rect.bottom, viewerRect.bottom) - Math.max(rect.top, viewerRect.top))
        const area = width * height
        if (area > 0 && (!best || area > best.area)) best = { doc, area }
      } catch { /* ignore cross-origin iframe */ }
    }

    return best?.doc ?? currentDocRef.current
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily, ready, setFontFamily])

  // 行距（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    lineHeightRef.current = lineHeight
    try { renditionRef.current?.themes.override('line-height', String(lineHeight)) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyLineHeightOverride(doc, lineHeight))
    rerenderAnnotationPane()
    triggerScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineHeight, ready])

  // 字距（獨立，不影響其他設定）
  useEffect(() => {
    if (!ready) return
    letterSpacingRef.current = letterSpacing
    try { renditionRef.current?.themes.override('letter-spacing', `${letterSpacing}em`) } catch { /* epubjs 時序問題，忽略 */ }
    applyToCurrentDoc(doc => applyLetterSpacingOverride(doc, letterSpacing))
    rerenderAnnotationPane()
    triggerScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterSpacing, ready])

  // 設定面板開關時重新計算 epub 寬高（桌面版 settings panel 是 flex 側欄，會縮窄 viewer）
  useEffect(() => {
    if (!ready) return
    const rendition = renditionRef.current
    const viewer = viewerRef.current
    if (!rendition || !viewer) return
    // 延遲讓 React layout 更新完成
    const t = setTimeout(() => {
      const newWidth = viewer.clientWidth
      const newHeight = viewer.clientHeight
      if (newWidth <= 0 || newHeight <= 0) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const curWidth = (rendition as any).settings?.width
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const curHeight = (rendition as any).settings?.height
      if (Math.abs(curWidth - newWidth) > 2 || Math.abs(curHeight - newHeight) > 2) {
        if (DEBUG_READER_LOG) console.log('[Reader] activePanel 變更，重設 rendition 尺寸', { curWidth, curHeight, newWidth, newHeight })
        try { rendition.resize(newWidth, newHeight) } catch { /* ignore */ }
        triggerScan()
      }
    }, 80)
    return () => clearTimeout(t)
  }, [activePanel, ready, triggerScan, viewerRef, renditionRef])

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
    applyToCurrentDoc(doc => applyDarkOverride(doc, darkMode))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode, ready])

  // 同步 ready state 到 ref，讓 prevPage/nextPage 不需捕捉 ready 就能讀到最新值
  useEffect(() => { readyRef.current = ready }, [ready])

  const prevPage = useCallback(() => {
    if (!readyRef.current) return
    if (playing || ttsPaused) {
      ttsManualNavigationUntilRef.current = Date.now() + 6000
      console.log('[TTS:follow] 使用者手動翻頁，暫停自動跟隨', { direction: 'prev', until: ttsManualNavigationUntilRef.current })
    }
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    setPopup(null)
    renditionRef.current?.prev()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ttsPaused, removePendingAnnotation])

  const nextPage = useCallback(() => {
    if (!readyRef.current) return
    if (playing || ttsPaused) {
      ttsManualNavigationUntilRef.current = Date.now() + 6000
      console.log('[TTS:follow] 使用者手動翻頁，暫停自動跟隨', { direction: 'next', until: ttsManualNavigationUntilRef.current })
    }
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    setPopup(null)
    renditionRef.current?.next()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ttsPaused, removePendingAnnotation])

  // 保持 ref 指向最新版本，供 iframe 內鍵盤事件使用（useEffect 避免 render 期間 mutation，確保 React Compiler 可正常優化）
  useEffect(() => {
    prevPageRef.current = prevPage
    nextPageRef.current = nextPage
  }, [prevPage, nextPage])

  const handleScriptToggle = (target: Script) => {
    if (target === script) return
    const newScript: Script = target
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

  const handleNavigateToChapter = (href: string) => {
    // TOC href 格式可能與 spine item href 不一致，需正規化後再 display
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineItems: any[] = (bookRef.current as any)?.spine?.items ?? []
    const target = resolveSpineTarget(spineItems, href)
    renditionRef.current?.display(target).catch((err: unknown) => {
      console.warn('[Reader] 跳轉至章節失敗:', err)
    })
  }

  const noteUserInteraction = () => {
    ttsUserInputUntilRef.current = Date.now() + TTS_USER_INPUT_GRACE
  }

  const clearAllTTSHighlights = () => {
    const docs = collectContentDocuments(viewerRef.current, ttsContentDocsRef.current)
    clearTTSHighlights(docs)
    clearTTSHighlight(currentDocRef.current)
    clearTTSHighlight(ttsHighlightedDocRef.current)
    ttsHighlightedDocRef.current = null
  }

  const clearOtherTTSHighlights = (activeDoc: Document) => {
    const docs = collectContentDocuments(viewerRef.current, ttsContentDocsRef.current)
    for (const doc of docs) {
      if (doc !== activeDoc) clearTTSHighlight(doc)
    }
    if (ttsHighlightedDocRef.current && ttsHighlightedDocRef.current !== activeDoc) {
      clearTTSHighlight(ttsHighlightedDocRef.current)
    }
  }

  const measureCurrentPageEdgeOffset = (doc: Document, loc: AnyLoc, edge: 'start' | 'end'): number | null => {
    const cfi = loc?.[edge]?.cfi as string | undefined
    if (!cfi) return null

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const range = (renditionRef.current as any)?.getRange?.(cfi) as Range | null | undefined
      const offset = getBoundaryOffsetFromRange(doc, range, edge)
      const textLength = getTextIndex(doc)?.total ?? ttsChapterTextLengthRef.current
      if (offset === null) return null
      return Math.max(0, Math.min(offset, textLength))
    } catch (err) {
      if (DEBUG_TTS_FOLLOW) {
        console.warn(`[TTS:follow] ${edge}.cfi 轉 offset 失敗`, {
          cfi,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return null
    }
  }

  const measureCurrentPageEndOffset = (doc: Document, loc?: AnyLoc): number | null =>
    measureCurrentPageEdgeOffset(doc, loc, 'end')

  const measureCurrentPageStartOffset = (doc: Document, loc?: AnyLoc): number | null =>
    measureCurrentPageEdgeOffset(doc, loc, 'start')

  const refreshTTSPageEndOffset = (label: string, loc?: AnyLoc) => {
    const doc = currentDocRef.current
    const visibleSpineIdx = loc?.start?.index as number | undefined
    if (!doc || !ttsActiveRef.current || visibleSpineIdx !== ttsVisibleSpineIndexRef.current) return

    const pageStartOffset = measureCurrentPageStartOffset(doc, loc)
    const pageEndOffset = measureCurrentPageEndOffset(doc, loc)
    ttsCurrentPageStartOffsetRef.current = pageStartOffset
    ttsVisiblePageEndOffsetRef.current = pageEndOffset
    if (DEBUG_TTS_FOLLOW) {
      console.log(`[TTS:follow] ${label}`, {
        absoluteOffset: ttsLastAbsoluteOffsetRef.current,
        pageStartOffset,
        pageEndOffset,
        displayed: loc?.start?.displayed,
        startCfi: loc?.start?.cfi,
        endCfi: loc?.end?.cfi,
      })
    }
  }

  const unlockTTSAutoFollow = (label: string, loc?: AnyLoc) => {
    const pending = ttsAutoFollowPendingRef.current
    refreshTTSPageEndOffset(label, loc)
    if (DEBUG_TTS_FOLLOW && pending && pending.fromPageStartOffset !== null && pending.fromPageEndOffset !== null) {
      const nextPageStartOffset = ttsCurrentPageStartOffsetRef.current
      if (nextPageStartOffset !== null) {
        console.log('[TTS:follow] relocated 後頁界線參考', {
          fromPageStartOffset: pending.fromPageStartOffset,
          fromPageEndOffset: pending.fromPageEndOffset,
          nextPageStartOffset,
          endToNextStartDelta: pending.fromPageEndOffset - nextPageStartOffset,
        })
      }
    }
    ttsAutoFollowBusyRef.current = false
    ttsAutoFollowPendingRef.current = null
    ttsAutoFollowUnlockTimerRef.current = null
  }

  const requestTTSAutoNextPage = (
    displayed: { page: number; total: number } | undefined,
    absoluteOffset: number,
    pageStartOffset: number | null,
    pageEndOffset: number | null,
  ) => {
    if (ttsAutoFollowBusyRef.current) return

    const now = Date.now()
    if (now - ttsAutoFollowLastAtRef.current < 650) {
      if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] skip next: 節流中', {
        msSinceLast: now - ttsAutoFollowLastAtRef.current,
        displayed,
      })
      return
    }

    const sequence = ++ttsAutoFollowSequenceRef.current
    ttsAutoFollowBusyRef.current = true
    ttsAutoFollowLastAtRef.current = now
    ttsAutoFollowPendingRef.current = {
      sequence,
      fromPage: displayed?.page ?? 1,
      fromOffset: absoluteOffset,
      fromPageStartOffset: pageStartOffset,
      fromPageEndOffset: pageEndOffset,
    }

    if (ttsAutoFollowUnlockTimerRef.current) clearTimeout(ttsAutoFollowUnlockTimerRef.current)
    ttsAutoFollowUnlockTimerRef.current = setTimeout(() => {
      if (ttsAutoFollowPendingRef.current?.sequence !== sequence) return
      console.warn('[TTS:follow] relocated 未如期觸發，fallback 解鎖自動翻頁', { displayed, absoluteOffset, sequence })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unlockTTSAutoFollow('relocated fallback 用 end.cfi 更新頁尾', (renditionRef.current as any)?.currentLocation?.())
    }, 2500)

    Promise.resolve(renditionRef.current?.next())
      .catch((err: unknown) => {
        console.warn('[TTS] 自動跟讀翻頁失敗:', err)
        if (ttsAutoFollowPendingRef.current?.sequence === sequence) {
          ttsAutoFollowBusyRef.current = false
          ttsAutoFollowPendingRef.current = null
          if (ttsAutoFollowUnlockTimerRef.current) {
            clearTimeout(ttsAutoFollowUnlockTimerRef.current)
            ttsAutoFollowUnlockTimerRef.current = null
          }
        }
      })
  }

  const cancelScheduledTTSHighlight = () => {
    if (ttsHighlightFrameRef.current !== null) {
      cancelAnimationFrame(ttsHighlightFrameRef.current)
      ttsHighlightFrameRef.current = null
    }
    if (ttsHighlightTimerRef.current !== null) {
      clearTimeout(ttsHighlightTimerRef.current)
      ttsHighlightTimerRef.current = null
    }
    ttsPendingHighlightRef.current = null
  }

  const scheduleTTSHighlight = (absoluteOffset: number, allowAutoFollow = true, source: TTSProgressSource = 'boundary') => {
    ttsPendingHighlightRef.current = { absoluteOffset, allowAutoFollow, source }
    if (ttsHighlightFrameRef.current !== null || ttsHighlightTimerRef.current !== null) return

    ttsHighlightFrameRef.current = requestAnimationFrame(() => {
      ttsHighlightFrameRef.current = null
      const pending = ttsPendingHighlightRef.current
      if (!pending) return
      if (Date.now() < ttsUserInputUntilRef.current) {
        const delay = Math.max(0, ttsUserInputUntilRef.current - Date.now())
        ttsHighlightTimerRef.current = setTimeout(() => {
          ttsHighlightTimerRef.current = null
          const latest = ttsPendingHighlightRef.current
          if (!latest) return
          ttsPendingHighlightRef.current = null
          ttsLastHighlightAtRef.current = Date.now()
          updateTTSHighlight(latest.absoluteOffset, latest.allowAutoFollow, latest.source)
        }, delay)
        return
      }
      const now = Date.now()
      const shouldPaint = !pending.allowAutoFollow || now - ttsLastHighlightAtRef.current >= TTS_HIGHLIGHT_INTERVAL
      if (!shouldPaint) {
        const delay = TTS_HIGHLIGHT_INTERVAL - (now - ttsLastHighlightAtRef.current)
        ttsHighlightTimerRef.current = setTimeout(() => {
          ttsHighlightTimerRef.current = null
          const latest = ttsPendingHighlightRef.current
          if (!latest || Date.now() < ttsUserInputUntilRef.current) {
            if (latest) scheduleTTSHighlight(latest.absoluteOffset, latest.allowAutoFollow, latest.source)
            return
          }
          ttsPendingHighlightRef.current = null
          ttsLastHighlightAtRef.current = Date.now()
          updateTTSHighlight(latest.absoluteOffset, latest.allowAutoFollow, latest.source)
        }, delay)
        return
      }

      ttsPendingHighlightRef.current = null
      ttsLastHighlightAtRef.current = now
      updateTTSHighlight(pending.absoluteOffset, pending.allowAutoFollow, pending.source)
    })
  }

  const updateTTSHighlight = (absoluteOffset: number, allowAutoFollow = true, source: TTSProgressSource = 'boundary') => {
    ttsLastAbsoluteOffsetRef.current = absoluteOffset
    const doc = getVisibleContentDocument() ?? currentDocRef.current
    if (!doc) {
      if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] skip highlight: no current doc', { absoluteOffset })
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loc = (renditionRef.current as any)?.currentLocation?.()
    const visibleSpineIdx = loc?.start?.index as number | undefined
    if (visibleSpineIdx !== undefined && ttsVisibleSpineIndexRef.current !== visibleSpineIdx) {
      if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] skip highlight: visible spine 不符合朗讀 spine', {
        absoluteOffset,
        visibleSpineIdx,
        readingSpineIdx: ttsVisibleSpineIndexRef.current,
      })
      clearAllTTSHighlights()
      return
    }

    ensureTTSHighlightStyle(doc)
    const range = createRangeFromTextOffset(doc, absoluteOffset)
    if (!range) {
      if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] skip highlight: range not found', { absoluteOffset })
      clearAllTTSHighlights()
      followTTSRange(null, doc, absoluteOffset, allowAutoFollow, source)
      return
    }

    clearOtherTTSHighlights(doc)
    const painted = paintTTSHighlightOverlay(doc, range)
    if (painted) {
      ttsHighlightedDocRef.current = doc
    } else {
      clearTTSHighlight(doc)
      if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] overlay 無可用 rect，僅自動跟隨進度', { absoluteOffset })
    }
    followTTSRange(range, doc, absoluteOffset, allowAutoFollow, source)
  }

  const followTTSRange = (range: Range | null, doc: Document, absoluteOffset: number, allowAutoFollow: boolean, source: TTSProgressSource) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loc = (renditionRef.current as any)?.currentLocation?.()
    const displayed = loc?.start?.displayed as { page: number; total: number } | undefined
    const currentPage = displayed?.page ?? 1
    const totalPages = Math.max(displayed?.total ?? ttsChapterPageTotalRef.current, 1)
    const textLength = Math.max(ttsChapterTextLengthRef.current, 1)
    const continuousPage = computeContinuousPage(absoluteOffset, textLength, totalPages)
    const estimatedPage = Math.min(totalPages, Math.max(1, Math.floor(continuousPage)))
    let pageStartOffset = ttsCurrentPageStartOffsetRef.current
    let pageEndOffset = ttsVisiblePageEndOffsetRef.current
    if (pageStartOffset === null) {
      pageStartOffset = measureCurrentPageStartOffset(doc, loc)
      ttsCurrentPageStartOffsetRef.current = pageStartOffset
    }
    if (pageEndOffset === null || pageEndOffset <= absoluteOffset) {
      pageEndOffset = measureCurrentPageEndOffset(doc, loc)
      ttsVisiblePageEndOffsetRef.current = pageEndOffset
    }
    const pageTurnOffset = computePageTurnOffset(pageStartOffset, pageEndOffset, TTS_PAGE_END_FIXED_LEAD)
    const distanceToPageEnd = pageTurnOffset === null ? null : pageTurnOffset - absoluteOffset
    if (!allowAutoFollow) {
      if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] skip next: 初始 highlight 不觸發翻頁', { absoluteOffset, currentPage, estimatedPage, totalPages, pageEndOffset, distanceToPageEnd })
      return
    }

    if (Date.now() < ttsManualNavigationUntilRef.current) {
      if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] skip display: 使用者剛手動翻頁，暫停自動跟隨', {
        absoluteOffset,
        currentPage,
        estimatedPage,
        until: ttsManualNavigationUntilRef.current,
      })
      return
    }

    if (ttsAutoFollowBusyRef.current) {
      if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] skip next: 翻頁中', { displayed })
      return
    }

    const geometry = (DEBUG_TTS_FOLLOW || pageEndOffset === null)
      ? getTTSRangeViewportState(doc, range)
      : null
    const pageSpan = pageStartOffset !== null && pageEndOffset !== null
      ? Math.max(1, pageEndOffset - pageStartOffset)
      : null
    const pageEntryGuard = computePageEntryGuard(pageStartOffset, pageSpan, TTS_NEW_PAGE_AUTO_FOLLOW_GUARD)
    const advanceResult = shouldAdvanceTTSPage({
      absoluteOffset,
      pageStartOffset,
      pageEndOffset,
      pageTurnOffset,
      continuousPage,
      currentPage,
      source,
      // 主要觸發：TTS 位置的文字已超出視窗範圍（epub.js column layout 下一頁在視窗右側）
      // 注意：不能用 !hasUsableRect，因為欄外文字仍有合法 clientRect，只是 outsidePage
      outsidePage: geometry?.outsidePage ?? false,
      pageEntryGuard,
    })
    const { beforeCurrentPageGuard, insideNewPageGuard, shouldAdvance } = advanceResult
    const measuredPageEndReached = advanceResult.reason === 'page-end-cfi'
    const progressShouldAdvance = advanceResult.reason === 'progress-fallback'
    const pageBoundaryShouldAdvance = measuredPageEndReached

    if (DEBUG_TTS_FOLLOW) {
      const now = Date.now()
      if (shouldAdvance || source === 'boundary' || now - ttsLastFollowDebugAtRef.current >= 1000) {
        ttsLastFollowDebugAtRef.current = now
        console.log('[TTS:follow] check', {
          source,
          displayed,
          absoluteOffset,
          visibleSpineIdx: loc?.start?.index,
          readingSpineIdx: ttsVisibleSpineIndexRef.current,
          visibleStartOffset: ttsVisibleStartOffsetRef.current,
          pageStartOffset,
          pageEndOffset,
          pageTurnOffset,
          pageEndLead: TTS_PAGE_END_FIXED_LEAD,
          distanceToPageEnd,
          chapterTextLength: textLength,
          estimatedPage,
          continuousPage: Number(continuousPage.toFixed(2)),
          currentPage,
          totalPages,
          rect: geometry?.rect ? {
            left: Math.round(geometry.rect.left),
            right: Math.round(geometry.rect.right),
            top: Math.round(geometry.rect.top),
            bottom: Math.round(geometry.rect.bottom),
            width: Math.round(geometry.rect.width),
            height: Math.round(geometry.rect.height),
          } : null,
          viewport: geometry?.viewport ?? null,
          lineHeight: geometry ? Math.round(geometry.lineHeight) : null,
          bottomGap: geometry?.bottomGap === null || geometry?.bottomGap === undefined ? null : Math.round(geometry.bottomGap),
          leftGap: geometry?.leftGap === null || geometry?.leftGap === undefined ? null : Math.round(geometry.leftGap),
          rightGap: geometry?.rightGap === null || geometry?.rightGap === undefined ? null : Math.round(geometry.rightGap),
          hasUsableRect: geometry?.hasUsableRect ?? null,
          geometryReason: geometry?.reason ?? null,
          pageBoundaryShouldAdvance,
          pageEntryGuard,
          beforeCurrentPageGuard,
          insideNewPageGuard,
          measuredPageEndReached,
          progressShouldAdvance,
          shouldAdvance,
        })
      }
    }

    if (!shouldAdvance) return

    if (DEBUG_TTS_FOLLOW) console.log('[TTS:follow] next() 延後自動翻到下一頁', {
      displayed,
      continuousPage: Number(continuousPage.toFixed(2)),
      absoluteOffset,
      pageStartOffset,
      pageEndOffset,
      pageTurnOffset,
      pageEndLead: TTS_PAGE_END_FIXED_LEAD,
      distanceToPageEnd,
      trigger: pageBoundaryShouldAdvance ? 'page-end-cfi' : 'progress-fallback',
      geometryReason: geometry?.reason ?? null,
      pageEntryGuard,
      beforeCurrentPageGuard,
      bottomGap: geometry?.bottomGap === null || geometry?.bottomGap === undefined ? null : Math.round(geometry.bottomGap),
      leftGap: geometry?.leftGap === null || geometry?.leftGap === undefined ? null : Math.round(geometry.leftGap),
      rightGap: geometry?.rightGap === null || geometry?.rightGap === undefined ? null : Math.round(geometry.rightGap),
      lineHeight: geometry ? Math.round(geometry.lineHeight) : null,
    })
    requestTTSAutoNextPage(displayed, absoluteOffset, pageStartOffset, pageEndOffset)
  }

  const speakCurrentPage = () => {
    if (!viewerRef.current) return
    const visibleDoc = getVisibleContentDocument()
    if (!visibleDoc?.body) return

    const textIndex = getTextIndex(visibleDoc)
    const fullText = textIndex?.text ?? ''
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
      const percentage = (loc as AnyLoc)?.start?.percentage as number | undefined
      const approx = computeApproxOffsetFromPercentage(percentage, currentPageIdx, totalPages, fullText.length)

      if (approx > 0) {
        // 嘗試從當前頁 CFI 取得文字樣本，在全文中搜尋最近似位置（精確定位）
        const startCfi = loc?.start?.cfi as string | undefined
        let located: number | null = null
        if (startCfi) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const range = (renditionRef.current as any).getRange?.(startCfi) as Range | null | undefined
          const startNode = range?.startContainer
          if (startNode?.nodeType === Node.TEXT_NODE) {
            const nodeText = (startNode.nodeValue ?? '').slice(range!.startOffset)
            const sample = nodeText.replace(/\s+/g, '').substring(0, 15)
            located = locateApproxOffsetByFuzzyMatch(fullText, approx, sample)
          }
        }
        // CFI 定位失敗時，直接採用 approx（percentage/page-based），對齊到詞首
        startOffset = located ?? snapOffsetToWordStart(fullText, approx)
      }
    } catch { /* 保持 startOffset = 0 */ }

    const textToRead = fullText.slice(startOffset)
    if (!textToRead.trim()) return

    // 取得 spine 索引：優先用 location，備選用已追蹤的 currentSpineIndexRef
    let currentSpineIdx = (loc as AnyLoc)?.start?.index as number | undefined
    if (currentSpineIdx === undefined) {
      currentSpineIdx = currentSpineIndexRef.current >= 0 ? currentSpineIndexRef.current : 0
      console.warn('[TTS] speakCurrentPage: location.index 未定義，使用備選 spine 索引', { currentSpineIdx })
    }
    ttsVisibleSpineIndexRef.current = currentSpineIdx
    ttsVisibleStartOffsetRef.current = startOffset
    ttsCurrentPageStartOffsetRef.current = measureCurrentPageStartOffset(visibleDoc, loc)
    ttsLastAbsoluteOffsetRef.current = startOffset
    ttsChapterTextLengthRef.current = fullText.length
    ttsChapterPageTotalRef.current = totalPages
    ttsVisiblePageEndOffsetRef.current = measureCurrentPageEndOffset(visibleDoc, loc)
    updateTTSHighlight(startOffset, false)
    console.log('[TTS] speakCurrentPage 開始', {
      currentSpineIdx,
      pageIdx: currentPageIdx,
      textLength: textToRead.length,
      visibleStartOffset: startOffset,
      pageStartOffset: ttsCurrentPageStartOffsetRef.current,
      pageEndOffset: ttsVisiblePageEndOffsetRef.current,
    })
    speak(textToRead, () => {
      clearAllTTSHighlights()
      console.log('[TTS] speakCurrentPage 完成，準備加載下一章節', { nextSpineIdx: currentSpineIdx + 1 })
      continueFromSpineRef.current(currentSpineIdx + 1)
    }, (charIdx, source) => {
      scheduleTTSHighlight(ttsVisibleStartOffsetRef.current + charIdx, charIdx > 24, source)
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
        clearAllTTSHighlights()
        ttsVisibleSpineIndexRef.current = spineIdx
        ttsVisibleStartOffsetRef.current = 0
        ttsCurrentPageStartOffsetRef.current = null
        ttsVisiblePageEndOffsetRef.current = null
        ttsLastAbsoluteOffsetRef.current = 0
        ttsChapterTextLengthRef.current = text.length
        ttsChapterPageTotalRef.current = 1
        ttsAutoFollowBusyRef.current = false
        ttsAutoFollowLastAtRef.current = 0
        ttsAutoFollowPendingRef.current = null

        try {
          await renditionRef.current?.display(item.href ?? item.idref)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const loc = (renditionRef.current as any)?.currentLocation?.()
          const displayed = loc?.start?.displayed as { page: number; total: number } | undefined
          const visibleTextIndex = currentDocRef.current ? getTextIndex(currentDocRef.current) : null
          if (visibleTextIndex?.text.trim()) {
            text = visibleTextIndex.text
          }
          ttsChapterTextLengthRef.current = text.length
          ttsChapterPageTotalRef.current = Math.max(displayed?.total ?? 1, 1)
          ttsCurrentPageStartOffsetRef.current = currentDocRef.current ? measureCurrentPageStartOffset(currentDocRef.current, loc) : null
          ttsVisiblePageEndOffsetRef.current = currentDocRef.current ? measureCurrentPageEndOffset(currentDocRef.current, loc) : null
          updateTTSHighlight(0, false)
        } catch (displayErr) {
          console.warn('[TTS] continueFromSpine: 主閱讀器跳至朗讀章節失敗，仍繼續背景朗讀', {
            spineIdx,
            error: displayErr instanceof Error ? displayErr.message : String(displayErr),
          })
          ttsVisibleSpineIndexRef.current = null
        }

        speak(
          text,
          () => {
            clearAllTTSHighlights()
            continueFromSpineRef.current(spineIdx + 1)
          },
          (charIdx, source) => scheduleTTSHighlight(ttsVisibleStartOffsetRef.current + charIdx, charIdx > 24, source),
        )
      } catch (err) {
        if (!token.aborted) {
          console.error('[TTS] continueFromSpine: 章節載入失敗', { spineIdx, error: err instanceof Error ? err.message : String(err) })
          continueFromSpineRef.current(spineIdx + 1)
        }
      }
    })()
  }

  useEffect(() => { continueFromSpineRef.current = continueFromSpine })

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
      cancelScheduledTTSHighlight()
      clearAllTTSHighlights()
      stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    ttsManualNavigationUntilRef.current = 0
    cancelScan()
    if (ttsPaused) {
      resume()
      if (sleepMinutesRef.current > 0) startSleepTimer(sleepMinutesRef.current)
      return
    }
    speakCurrentPage()
    if (sleepMinutesRef.current > 0) startSleepTimer(sleepMinutesRef.current)
  }

  const handleTTSPause = () => {
    pause()
    clearSleepTimer()
    // 取消任何待處理的章節載入（手機版保護機制）
    loadingAbortRef.current.aborted = true
    cancelScheduledTTSHighlight()
    ttsAutoFollowBusyRef.current = false
    ttsAutoFollowPendingRef.current = null
    if (ttsAutoFollowUnlockTimerRef.current) {
      clearTimeout(ttsAutoFollowUnlockTimerRef.current)
      ttsAutoFollowUnlockTimerRef.current = null
    }
    console.log('[TTS] handleTTSPause: 朗讀暫停，已記錄目前進度並取消待處理的異步操作')
  }

  const handleTTSReset = () => {
    resetTTS()
    clearSleepTimer()
    loadingAbortRef.current.aborted = true
    cancelScheduledTTSHighlight()
    clearAllTTSHighlights()
    ttsVisibleSpineIndexRef.current = null
    ttsVisibleStartOffsetRef.current = 0
    ttsCurrentPageStartOffsetRef.current = null
    ttsVisiblePageEndOffsetRef.current = null
    ttsLastAbsoluteOffsetRef.current = 0
    ttsChapterTextLengthRef.current = 0
    ttsChapterPageTotalRef.current = 1
    ttsAutoFollowBusyRef.current = false
    ttsAutoFollowLastAtRef.current = 0
    ttsAutoFollowPendingRef.current = null
    ttsManualNavigationUntilRef.current = 0
    if (ttsAutoFollowUnlockTimerRef.current) {
      clearTimeout(ttsAutoFollowUnlockTimerRef.current)
      ttsAutoFollowUnlockTimerRef.current = null
    }
    console.log('[TTS] handleTTSReset: 已重置朗讀進度')
  }

  // 朗讀中視覺頁碼可能比音訊超前，用 displayPageInfo 避免 UI 顯示 100%
  const displayPageInfo = ((playing || ttsPaused) && pageInfo && pageInfo.page >= pageInfo.total)
    ? { page: Math.max(pageInfo.total - 1, 1), total: pageInfo.total }
    : pageInfo

  return {
    ready, toc, currentHref, bookTitle, chapterRemaining, atStart, atEnd, currentCfi,
    displayPageInfo,
    prevPage, nextPage,
    handleScriptToggle, handleNavigateToChapter,
    noteUserInteraction,
    sleepMinutes, sleepRemaining, handleSleepChange,
    handleTTSPlay, handleTTSPause, handleTTSReset,
    swipeStartRef, isSelectingRef,
  }
}
