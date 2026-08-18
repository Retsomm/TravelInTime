import { useEffect, useRef, useState } from 'react'
import type { Book, Rendition } from 'epubjs'
import Toolbar from '@/components/Toolbar'
import NotePanel from '@/components/NotePanel'
import ChapterPanel from '@/components/ChapterPanel'
import SettingsPanel from '@/components/SettingsPanel'
import useTTS from '@/hooks/useTTS'
import { useReaderStore } from '@/store/useReaderStore'
import type { BookRecord } from '@/hooks/useLibrary'
import { HIGHLIGHT_COLORS } from '@/components/Reader/annotationUtils'
import BookInfoPanel from '@/components/Reader/BookInfoPanel'
import BookmarkList from '@/components/Reader/BookmarkList'
import { findChapterTitleByHref, findNearestChapterLabel } from '@/components/Reader/tocLookup'
import { useBookmarks } from '@/hooks/reader/useBookmarks'
import { useAnnotations } from '@/hooks/reader/useAnnotations'
import { useAnnotationPopups } from '@/hooks/reader/useAnnotationPopups'
import { useChapterPageScan } from '@/hooks/reader/useChapterPageScan'
import { useReaderEngine } from '@/hooks/reader/useReaderEngine'

interface Props {
  bookPath: string
  bookId: string
  bookRecord: BookRecord | null
  initialCfi?: string
  getCoverDataUrl: (id: string) => Promise<string | null>
  onBack: () => void
  darkMode: boolean
  onToggleDark: () => void
  onUpdateProgress?: (pct: number) => void
  onApplyLatestVersion: () => void | Promise<void>
}



const Reader = ({ bookPath, bookId, bookRecord, initialCfi, getCoverDataUrl, onBack, darkMode, onToggleDark, onUpdateProgress, onApplyLatestVersion }: Props) => {
  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const lastIframeClickRef = useRef({ x: 0, y: 0 }) // iframe 內最後一次點擊的主視窗座標
  const [activePanel, setActivePanel] = useState<'notes' | 'chapters' | 'settings' | 'bookinfo' | 'mobilepanel' | 'bookmarks' | null>(null)
  const [mobilePanelTab, setMobilePanelTab] = useState<'bookinfo' | 'chapters' | 'notes' | 'bookmarks'>('chapters')

  const {
    fontSize, fontFamily, script, lineHeight, letterSpacing, readingDirection,
    setFontSize, setFontFamily, setScript, resetScript, setLineHeight, setLetterSpacing, setReadingDirection,
  } = useReaderStore()
  const fontSizeRef = useRef(fontSize)
  const lineHeightRef = useRef(lineHeight)
  const fontFamilyRef = useRef(fontFamily)
  const letterSpacingRef = useRef(letterSpacing)
  const {
    annotations,
    loadForBook,
    addAnnotation,
    removeAnnotation,
    updateColor: updateAnnotationColor,
    updateNote,
    clearAll: clearAnnotations,
  } = useAnnotations(bookId)
  const { playing, paused: ttsPaused, speak, pause, resume, stop, reset: resetTTS, voices, selectedVoice, setSelectedVoice, rate, setRate } = useTTS()
  const ttsActiveRef = useRef(false)
  useEffect(() => { ttsActiveRef.current = playing || ttsPaused }, [playing, ttsPaused])
  const [pageInfo, setPageInfo] = useState<{ page: number; total: number } | null>(null)

  const {
    chapterPagesRef,
    currentChapterPageRef,
    bookBufferRef,
    scanAllChapterPages,
    triggerScan,
    cancelScan,
    resetScanState,
    hydrateFromCache,
  } = useChapterPageScan({ bookId, viewerRef, bookRef, renditionRef, fontSizeRef, fontFamilyRef, lineHeightRef, letterSpacingRef, ttsActiveRef, setPageInfo })

  // 依當前 location 找出 TOC 中對應的章節標題（book/rendition 準備好前回傳空字串）
  const getChapterTitle = (): string => {
    if (!bookRef.current) return ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const location = (renditionRef.current as any)?.currentLocation?.()
      const curFile = (location?.start?.href ?? '').split('#')[0]
      if (!curFile) return ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tocItems: any[] = (bookRef.current.navigation as any).toc ?? []
      return findChapterTitleByHref(tocItems, curFile)
    } catch {
      return ''
    }
  }

  const {
    bookmarks,
    pendingDeleteId: bookmarkPendingDeleteId,
    setPendingDeleteId: setBookmarkPendingDeleteId,
    isBookmarked: isBookmarkedFn,
    toggle: toggleBookmarkAction,
    remove: handleDeleteBookmark,
    reset: resetBookmarks,
  } = useBookmarks(bookId)

  const {
    popup, setPopup,
    editPopup, setEditPopup,
    pendingAnnotationCfiRef,
    addEpubAnnotation,
    addPendingAnnotation,
    removePendingAnnotation,
    handleHighlight,
    handleSearchSelectedText,
    handleCopySelectedText,
    handleChangeColor,
    handleDeleteMark,
    handleEditColor,
    handleNavigateToAnnotation,
  } = useAnnotationPopups({
    renditionRef, viewerRef, lastIframeClickRef, getChapterTitle,
    annotations, addAnnotation, updateColor: updateAnnotationColor, removeAnnotation,
  })

  const {
    ready, toc, currentHref, bookTitle, chapterRemaining, atStart, atEnd, currentCfi,
    displayPageInfo, prevPage, nextPage,
    handleScriptToggle, handleNavigateToChapter,
    noteUserInteraction,
    sleepMinutes, sleepRemaining, handleSleepChange,
    handleTTSPlay, handleTTSPause, handleTTSReset,
    swipeStartRef, isSelectingRef,
  } = useReaderEngine({
    bookPath, bookId, bookRecord, initialCfi, darkMode, activePanel, onUpdateProgress,
    viewerRef, bookRef, renditionRef, lastIframeClickRef,
    fontSize, fontFamily, script, lineHeight, letterSpacing, readingDirection,
    setFontFamily, setScript, resetScript,
    fontSizeRef, fontFamilyRef, lineHeightRef, letterSpacingRef,
    playing, ttsPaused, speak, pause, resume, stop, resetTTS, ttsActiveRef,
    pageInfo, setPageInfo,
    chapterPagesRef, currentChapterPageRef, bookBufferRef, scanAllChapterPages, triggerScan, cancelScan, resetScanState, hydrateFromCache,
    setPopup, setEditPopup, pendingAnnotationCfiRef, addEpubAnnotation, addPendingAnnotation, removePendingAnnotation,
    loadForBook, clearAnnotations, resetBookmarks,
  })

  const isBookmarked = isBookmarkedFn(currentCfi)

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
      return findNearestChapterLabel(tocItems, spineItems, curSpineIdx) || '書籤'
    } catch {
      return '書籤'
    }
  }

  const handleToggleBookmark = () => {
    if (!currentCfi) return
    toggleBookmarkAction(currentCfi, getBookmarkLabel())
  }

  const togglePanel = (panel: 'notes' | 'chapters' | 'settings' | 'bookinfo' | 'mobilepanel' | 'bookmarks') =>
    setActivePanel((cur) => (cur === panel ? null : panel))

  return (
    <div
      className="flex flex-col h-full bg-paper"
      onPointerDownCapture={noteUserInteraction}
      onTouchStartCapture={noteUserInteraction}
      onClick={() => { setPopup(null); setEditPopup(null) }}
    >
      <Toolbar
        onBack={onBack}
        bookTitle={bookTitle}
        bookAuthor={bookRecord?.author}
        pageInfo={displayPageInfo}
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
        onApplyLatestVersion={onApplyLatestVersion}
      />
      <div className="flex flex-1 overflow-hidden relative">
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
            if (isSelectingRef.current) return
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
          <div ref={viewerRef} className="absolute top-2 bottom-2 md:bottom-13 left-0 right-0 overflow-hidden" />

          {/* 章節剩餘頁（底部左側小字，僅桌面版） */}
          {ready && chapterRemaining !== null && (
            <div className="hidden md:block absolute md:bottom-2 left-14 z-10 pointer-events-none">
              <span className="font-ui-mono text-[10px] text-ink-3 tracking-[0.04em] select-none">
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
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-500 dark:text-stone-300 text-xs font-semibold transition"
                onClick={handleSearchSelectedText}
                aria-label="使用 Google 搜尋選取文字"
                title="Google 搜尋"
              >
                G
              </button>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-500 dark:text-stone-300 transition"
                onClick={handleCopySelectedText}
                aria-label="複製選取文字"
                title="複製"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {activePanel === 'settings' && (
          /* 手機版：absolute 覆層，不佔 flex 空間，epub 容器寬度不受影響；桌面版：正常 flex 側欄 */
          <div
            className="absolute inset-0 z-40 overflow-hidden md:relative md:inset-auto md:z-auto bg-paper"
          >
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
              ttsPaused={ttsPaused}
              onTTSPlay={handleTTSPlay}
              onTTSPause={handleTTSPause}
              onTTSReset={handleTTSReset}
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
              onApplyLatestVersion={onApplyLatestVersion}
            />
          </div>
        )}
        {activePanel === 'notes' && (
          <NotePanel
            annotations={annotations}
            onUpdateNote={updateNote}
            onNavigate={handleNavigateToAnnotation}
            onChangeColor={handleChangeColor}
            onRemoveAnnotation={handleDeleteMark}
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
          <BookInfoPanel
            record={bookRecord}
            getCoverDataUrl={getCoverDataUrl}
            onClose={() => setActivePanel(null)}
            progress={bookRecord.progress ?? (pageInfo && pageInfo.total > 0 ? pageInfo.page / pageInfo.total : null)}
          />
        )}
        {activePanel === 'bookmarks' && (
          <div className="w-65 shrink-0 h-full border-l border-border bg-paper flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border shrink-0 flex items-center justify-between">
              <div className="font-ui-serif text-[15px] font-medium text-ink">書籤清單</div>
              <button
                onClick={() => setActivePanel(null)}
                className="w-6.5 h-6.5 rounded-md flex items-center justify-center text-ink-3 cursor-pointer transition-all duration-120 hover:text-ink hover:bg-paper-2"
                aria-label="關閉"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <BookmarkList
              bookmarks={bookmarks}
              pendingDeleteId={bookmarkPendingDeleteId}
              onSelect={(cfi) => { renditionRef.current?.display(cfi).catch(() => {}); setActivePanel(null) }}
              onTogglePendingDelete={(id) => setBookmarkPendingDeleteId(bookmarkPendingDeleteId === id ? null : id)}
              onConfirmDelete={(id) => { handleDeleteBookmark(id); setBookmarkPendingDeleteId(null) }}
              onCancelDelete={() => setBookmarkPendingDeleteId(null)}
            />
          </div>
        )}
        {activePanel === 'mobilepanel' && (
          /* absolute 覆層：不佔 flex 空間，epub 容器寬度不受影響 */
          <div className="absolute inset-0 z-40 overflow-hidden flex flex-col bg-paper">
            {/* Tab 切換列 */}
            <div className="flex shrink-0 border-b border-border">
              {([
                { key: 'bookinfo',   label: '書籍' },
                { key: 'chapters',   label: '目錄' },
                { key: 'bookmarks',  label: '書籤' },
                { key: 'notes',      label: '註記' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  className={`flex-1 py-2.5 text-[11px] cursor-pointer transition-all duration-120 font-ui-mono tracking-[0.04em] border-b-2 touch-manipulation ${
                    mobilePanelTab === key ? 'border-accent text-accent' : 'border-transparent text-ink-3'
                  }`}
                  onTouchEnd={(e) => { e.preventDefault(); setMobilePanelTab(key) }}
                  onClick={() => setMobilePanelTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 內容區 */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {mobilePanelTab === 'bookinfo' && bookRecord && (
                <BookInfoPanel
                  record={bookRecord}
                  getCoverDataUrl={getCoverDataUrl}
                  progress={bookRecord.progress ?? (pageInfo && pageInfo.total > 0 ? pageInfo.page / pageInfo.total : null)}
                  embedded
                />
              )}
              {mobilePanelTab === 'chapters' && (
                <ChapterPanel toc={toc} currentHref={currentHref} onNavigate={handleNavigateToChapter} embedded />
              )}
              {mobilePanelTab === 'bookmarks' && (
                <BookmarkList
                  bookmarks={bookmarks}
                  pendingDeleteId={bookmarkPendingDeleteId}
                  onSelect={(cfi) => { renditionRef.current?.display(cfi).catch(() => {}); setActivePanel(null) }}
                  onTogglePendingDelete={(id) => setBookmarkPendingDeleteId(bookmarkPendingDeleteId === id ? null : id)}
                  onConfirmDelete={(id) => { handleDeleteBookmark(id); setBookmarkPendingDeleteId(null) }}
                  onCancelDelete={() => setBookmarkPendingDeleteId(null)}
                />
              )}
              {mobilePanelTab === 'notes' && (
                <NotePanel
                  annotations={annotations}
                  onUpdateNote={updateNote}
                  onNavigate={handleNavigateToAnnotation}
                  onChangeColor={handleChangeColor}
                  onRemoveAnnotation={handleDeleteMark}
                  bookTitle={bookTitle}
                  embedded
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 手機版底部列 — 永遠佔位避免 epub 初始化尺寸錯誤 */}
      <div className="md:hidden shrink-0 border-t border-border bg-paper pb-[env(safe-area-inset-bottom)]">
        {/* 手機版朗讀控制列：永遠佔位（44px），用 visibility 切換顯示，避免動態加入/移除造成 epub.js ResizeObserver 觸發重新分頁 */}
        <div
          className={`flex items-center gap-2.5 px-4 h-9 border-b border-border ${(playing || ttsPaused) ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <span className={`flex-1 text-xs font-ui-mono tracking-[0.04em] select-none ${playing ? 'text-accent dark:text-[#c8b89a]' : 'text-ink-3'}`}>
            {playing ? '朗讀中…' : '已暫停'}
          </span>
          <button
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); playing ? handleTTSPause() : handleTTSPlay() }}
            onClick={(e) => { e.stopPropagation(); playing ? handleTTSPause() : handleTTSPlay() }}
            className="w-9 h-7 rounded-lg cursor-pointer bg-[#f1ede4] dark:bg-[#2a2520] border border-border text-ink flex items-center justify-center touch-manipulation shrink-0"
            aria-label={playing ? '暫停朗讀' : '繼續朗讀'}
          >
            {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>}
          </button>
          <button
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleTTSReset() }}
            onClick={(e) => { e.stopPropagation(); handleTTSReset() }}
            className="w-9 h-7 rounded-lg cursor-pointer bg-[#f1ede4] dark:bg-[#2a2520] border border-border text-ink-3 flex items-center justify-center touch-manipulation shrink-0"
            aria-label="停止朗讀"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        </div>
        <div className="flex items-center h-6 gap-2.5 px-4">
          {ready && displayPageInfo && (
            <>
              <span className="font-ui-mono text-[10px] text-ink-3 whitespace-nowrap tracking-[0.04em] shrink-0">
                第 {displayPageInfo.page} 頁
              </span>
              <div className="flex-1 h-0.5 bg-border rounded-sm">
                <div className="h-full bg-accent rounded-sm transition-[width] duration-300" style={{ width: `${Math.min(displayPageInfo.page / displayPageInfo.total * 100, 100)}%` }} />
              </div>
              <span className="font-ui-mono text-[10px] text-ink-3 whitespace-nowrap tracking-[0.04em] shrink-0">
                / {displayPageInfo.total} · {Math.round(displayPageInfo.page / displayPageInfo.total * 100)}%
              </span>
            </>
          )}
        </div>
      </div>

      {/* 桌面版朗讀控制列 — fixed 定位，永遠佔位，用 visibility 切換，避免條件渲染觸發任何潛在副作用 */}
      <div
        className={`hidden md:flex fixed left-0 right-0 bottom-0 z-20 h-11 items-center gap-2.5 px-5 bg-paper border-t border-border ${
          (playing || ttsPaused) ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
      >
          <span className={`flex-1 text-xs font-ui-mono tracking-[0.04em] select-none ${playing ? 'text-accent dark:text-[#c8b89a]' : 'text-ink-3'}`}>
            {playing ? '朗讀中…' : '已暫停'}
          </span>
          <button
            onClick={() => playing ? handleTTSPause() : handleTTSPlay()}
            className="w-11 h-8 rounded-lg cursor-pointer bg-[#f1ede4] dark:bg-[#2a2520] border border-border text-ink flex items-center justify-center shrink-0"
            aria-label={playing ? '暫停朗讀' : '繼續朗讀'}
          >
            {playing ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>}
          </button>
          <button
            onClick={handleTTSReset}
            className="w-11 h-8 rounded-lg cursor-pointer bg-[#f1ede4] dark:bg-[#2a2520] border border-border text-ink-3 flex items-center justify-center shrink-0"
            aria-label="停止朗讀"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        </div>
    </div>
  )
}

export default Reader
