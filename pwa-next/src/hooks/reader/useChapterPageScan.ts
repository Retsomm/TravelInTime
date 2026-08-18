import { useCallback, useRef } from 'react'
import ePub from 'epubjs'
import type { Book, Rendition } from 'epubjs'
import { applyFontFamilyOverride, applyLetterSpacingOverride, applyLineHeightOverride, stripExternalFontFace } from '@/components/Reader/readerStyles'
import { computeAccurateTotal, computeChapterAverage, computeGlobalPage } from '@/components/Reader/progressCalculations'
import { loadPageCountCache, savePageCountCache, matchesCurrentSettings } from '@/components/Reader/pageCountCache'

type PageInfo = { page: number; total: number }

// 背景逐章渲染以取得精確全書頁數（反映當前字型、字距、行距），並在完成時校正 pageInfo。
export const useChapterPageScan = (params: {
  bookId: string
  viewerRef: React.RefObject<HTMLDivElement | null>
  bookRef: React.RefObject<Book | null>
  renditionRef: React.RefObject<Rendition | null>
  fontSizeRef: { current: number }
  fontFamilyRef: { current: string }
  lineHeightRef: { current: number }
  letterSpacingRef: { current: number }
  ttsActiveRef: { current: boolean }
  setPageInfo: (updater: (prev: PageInfo | null) => PageInfo | null) => void
}) => {
  const { bookId, viewerRef, bookRef, renditionRef, fontSizeRef, fontFamilyRef, lineHeightRef, letterSpacingRef, ttsActiveRef, setPageInfo } = params

  const chapterPagesRef = useRef<Map<number, number>>(new Map()) // spineIndex → 已渲染的章節總頁數
  const currentChapterPageRef = useRef<number>(1) // 當前章節內頁碼，供掃描完成後重算 page
  const bookBufferRef = useRef<ArrayBuffer | null>(null) // 儲存書本原始 buffer，供掃描用獨立 ePub 實例使用
  const scanAbortRef = useRef<{ aborted: boolean }>({ aborted: false })
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 開新書、字型設定尚未確定改變前呼叫：如果上次完整掃描這本書時的字型設定
  // 跟現在一致，直接把快取的每章頁數灌回 chapterPagesRef，讓第一次 relocated
  // 算出來的全書頁數估計就是準的，不用等這次掃描器重新跑一輪全書。
  const hydrateFromCache = useCallback(() => {
    const cache = loadPageCountCache(bookId)
    if (!cache) return
    const matches = matchesCurrentSettings(cache, {
      fontSize: fontSizeRef.current,
      fontFamily: fontFamilyRef.current,
      lineHeight: lineHeightRef.current,
      letterSpacing: letterSpacingRef.current,
    })
    if (!matches) return
    chapterPagesRef.current = new Map(
      Object.entries(cache.chapterPages).map(([spineIdx, pages]) => [Number(spineIdx), pages]),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  const scanAllChapterPages = useCallback(async () => {
    const book = bookRef.current
    const viewer = viewerRef.current
    const buffer = bookBufferRef.current
    if (!book || !viewer || !buffer) return
    if (ttsActiveRef.current) return

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

    // 建立完全獨立的 ePub 實例進行掃描，避免與主渲染器共享 book.spine.hooks 等狀態
    // （epub.js 的 book.renderTo 會覆寫 book.rendition，且 spine.hooks.content 為共享，
    //   使用同一 book 的第二個 rendition 會導致 hooks 互相觸發，進而讓主渲染器內容消失）
    const scanBook = ePub(buffer.slice(0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hiddenRendition = (scanBook as any).renderTo(hiddenEl, {
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
      stripExternalFontFace(doc)
      applyFontFamilyOverride(doc, fontFamilyRef.current)
      applyLineHeightOverride(doc, lineHeightRef.current)
      applyLetterSpacingOverride(doc, letterSpacingRef.current)
    })

    const spineTotal = spineItems.length
    let completedNormally = true
    try {
      for (const item of spineItems) {
        if (token.aborted || ttsActiveRef.current) { completedNormally = false; break }
        const href = item.href as string | undefined
        if (!href) continue
        try {
          await hiddenRendition.display(href)
          if (token.aborted || ttsActiveRef.current) { completedNormally = false; break }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const loc = (hiddenRendition as any).currentLocation?.()
          const d = loc?.start?.displayed as { page: number; total: number } | undefined
          const idx = item.index as number | undefined
          if (d && idx !== undefined) {
            chapterPagesRef.current = new Map(chapterPagesRef.current).set(idx, d.total)
          }
        } catch { /* 略過無法渲染的章節 */ }
        await new Promise<void>(r => setTimeout(r, 0)) // 讓 UI 有機會更新
      }
      // 掃描全部完成（含跳過無法渲染的章節）才更新 total，避免中途 abort 造成 avg 用不完整資料計算
      if (completedNormally && !token.aborted) {
        const known = chapterPagesRef.current
        const avg = computeChapterAverage(known)
        const accurateTotal = computeAccurateTotal(spineTotal, known, avg)
        // 直接從主渲染器讀取即時位置，避免 ref 快取和 scanner/主渲染器章節數差異問題
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mainLoc = (renditionRef.current as any)?.currentLocation?.()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mainD = mainLoc?.start?.displayed as { page: number; total: number } | undefined
        const mainSpineIdx = mainLoc?.start?.index as number | undefined
        setPageInfo(prev => {
          if (!prev) return prev
          const accuratePage = (mainD && mainSpineIdx !== undefined)
            ? computeGlobalPage(mainSpineIdx, mainD.page, known, avg)
            : prev.page
          // total 只能變大、不能變小：面板開關/視窗縮放會在 UI 過渡尺寸還沒穩定時就
          // 觸發重新掃描（見 useReaderEngine.ts「設定面板開關時重新計算 epub 寬高」那段
          // 呼叫的 triggerScan），拿過渡中的尺寸掃出來的 total 可能比實際偏低；比照
          // useReaderEngine.ts 主 relocated handler 已經採用的 Math.max(prev.total, page)
          // 防呆，這裡也不讓 total 比目前顯示的還小，避免使用者看到頁數突然變少。
          const total = Math.max(accurateTotal, accuratePage, prev.total)
          // 這次掃描算出的 accurateTotal 明顯比目前顯示的還低，代表很可能是在過渡尺寸下
          // 掃描的可疑結果，不寫入快取，避免把不準的每章頁數污染到下次開書的初始估計。
          if (accurateTotal >= prev.total) {
            savePageCountCache(bookId, {
              fontSize: fontSizeRef.current,
              fontFamily: fontFamilyRef.current,
              lineHeight: lineHeightRef.current,
              letterSpacing: letterSpacingRef.current,
              chapterPages: Object.fromEntries(known),
            })
          }
          return { page: accuratePage, total }
        })
      }
    } finally {
      hiddenEl.remove()
      // scanBook 是完全獨立的 ePub 實例，destroy() 不影響主渲染器
      try { (scanBook as any).destroy() } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerScan = useCallback(() => {
    if (ttsActiveRef.current) return
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
    scanTimerRef.current = setTimeout(scanAllChapterPages, 600)
  }, [scanAllChapterPages, ttsActiveRef])

  const cancelScan = useCallback(() => {
    scanAbortRef.current.aborted = true
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }
  }, [])

  const resetScanState = useCallback(() => {
    cancelScan()
    chapterPagesRef.current = new Map()
    currentChapterPageRef.current = 1
  }, [cancelScan])

  return {
    chapterPagesRef,
    currentChapterPageRef,
    bookBufferRef,
    scanAllChapterPages,
    triggerScan,
    cancelScan,
    resetScanState,
    hydrateFromCache,
  }
}
