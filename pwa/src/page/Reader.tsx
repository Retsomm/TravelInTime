import { useEffect, useRef, useState } from 'react'
import type { Book, Rendition } from 'epubjs'
import Toolbar from '@/components/Toolbar'
import NotePanel from '@/components/NotePanel'
import ChapterPanel from '@/components/ChapterPanel'
import SettingsPanel from '@/components/SettingsPanel'
import useTTS from '@/hooks/useTTS'
import { useReaderStore } from '@/store/useReaderStore'
import { useAnnotationStore } from '@/store/useAnnotationStore'
import type { BookRecord } from '@/hooks/useLibrary'
import { HIGHLIGHT_COLORS } from '@/components/Reader/annotationUtils'
import BookInfoPanel from '@/components/Reader/BookInfoPanel'
import { MONO, SERIF } from '@/components/Reader/bookCoverStyles'
import { findChapterTitleByHref, findNearestChapterLabel } from '@/components/Reader/tocLookup'
import { formatBookmarkDate, sortBookmarksByAddedAt } from '@/components/Reader/bookmarkUtils'
import { useBookmarks } from '@/hooks/reader/useBookmarks'
import { useAnnotationPopups } from '@/hooks/reader/useAnnotationPopups'
import { useChapterPageScan } from '@/hooks/reader/useChapterPageScan'
import { useReaderEngine } from '@/hooks/reader/useReaderEngine'

interface Props {
  bookPath: string
  bookId: string
  bookRecord: BookRecord | null
  getCoverDataUrl: (id: string) => Promise<string | null>
  onBack: () => void
  darkMode: boolean
  onToggleDark: () => void
  onUpdateProgress?: (pct: number) => void
  onApplyLatestVersion: () => void | Promise<void>
}



const Reader = ({ bookPath, bookId, bookRecord, getCoverDataUrl, onBack, darkMode, onToggleDark, onUpdateProgress, onApplyLatestVersion }: Props) => {
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
  const clearAnnotations = useAnnotationStore((s) => s.clearAll)
  const loadForBook = useAnnotationStore((s) => s.loadForBook)
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
  } = useChapterPageScan({ viewerRef, bookRef, renditionRef, fontSizeRef, fontFamilyRef, lineHeightRef, letterSpacingRef, ttsActiveRef, setPageInfo })

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
  } = useAnnotationPopups({ renditionRef, viewerRef, lastIframeClickRef, getChapterTitle })

  const {
    ready, toc, currentHref, bookTitle, chapterRemaining, atStart, atEnd, currentCfi,
    displayPageInfo, prevPage, nextPage,
    handleScriptToggle, handleNavigateToChapter,
    noteUserInteraction,
    sleepMinutes, sleepRemaining, handleSleepChange,
    handleTTSPlay, handleTTSPause, handleTTSReset,
    swipeStartRef, isSelectingRef,
  } = useReaderEngine({
    bookPath, bookId, bookRecord, darkMode, activePanel, onUpdateProgress,
    viewerRef, bookRef, renditionRef, lastIframeClickRef,
    fontSize, fontFamily, script, lineHeight, letterSpacing, readingDirection,
    setFontFamily, setScript, resetScript,
    fontSizeRef, fontFamilyRef, lineHeightRef, letterSpacingRef,
    playing, ttsPaused, speak, pause, resume, stop, resetTTS, ttsActiveRef,
    pageInfo, setPageInfo,
    chapterPagesRef, currentChapterPageRef, bookBufferRef, scanAllChapterPages, triggerScan, cancelScan, resetScanState,
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
      className="flex flex-col h-full"
      style={{ background: darkMode ? '#1a1816' : '#f9f7f2' }}
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
            className="absolute inset-0 z-40 overflow-hidden md:relative md:inset-auto md:z-auto"
            style={{ background: darkMode ? '#1a1816' : '#f9f7f2' }}
          >
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
            />
          </div>
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
                    {sortBookmarksByAddedAt(bookmarks).map((bm) => (
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
                            {formatBookmarkDate(bm.addedAt)}
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
          /* absolute 覆層：不佔 flex 空間，epub 容器寬度不受影響 */
          <div className="absolute inset-0 z-40 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', background: darkMode ? '#1a1816' : '#f9f7f2' }}>
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
                    {sortBookmarksByAddedAt(bookmarks).map((bm) => (
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
                            {formatBookmarkDate(bm.addedAt)}
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

      {/* 手機版底部列 — 永遠佔位避免 epub 初始化尺寸錯誤 */}
      <div
        className="md:hidden"
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`,
          background: darkMode ? '#1a1816' : '#f9f7f2',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* 手機版朗讀控制列：永遠佔位（44px），用 visibility 切換顯示，避免動態加入/移除造成 epub.js ResizeObserver 觸發重新分頁 */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 44, borderBottom: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`, visibility: (playing || ttsPaused) ? 'visible' : 'hidden', pointerEvents: (playing || ttsPaused) ? 'auto' : 'none' }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <span style={{ flex: 1, fontSize: 12, fontFamily: MONO, letterSpacing: '0.04em', color: playing ? (darkMode ? '#c8b89a' : 'oklch(0.62 0.14 40)') : (darkMode ? '#7a706a' : '#9a8f80'), userSelect: 'none' }}>
            {playing ? '朗讀中…' : '已暫停'}
          </span>
          <button
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); playing ? handleTTSPause() : handleTTSPlay() }}
            onClick={(e) => { e.stopPropagation(); playing ? handleTTSPause() : handleTTSPlay() }}
            style={{ width: 44, height: 36, borderRadius: 8, cursor: 'pointer', background: darkMode ? '#2a2520' : '#f1ede4', border: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`, color: darkMode ? '#e8e0d4' : '#2a2420', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', flexShrink: 0 }}
            aria-label={playing ? '暫停朗讀' : '繼續朗讀'}
          >
            {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>}
          </button>
          <button
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleTTSReset() }}
            onClick={(e) => { e.stopPropagation(); handleTTSReset() }}
            style={{ width: 44, height: 36, borderRadius: 8, cursor: 'pointer', background: darkMode ? '#2a2520' : '#f1ede4', border: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`, color: darkMode ? '#7a706a' : '#9a8f80', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', flexShrink: 0 }}
            aria-label="停止朗讀"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        </div>
        <div
          className="flex items-center"
          style={{ height: 32, gap: 10, padding: '0 16px' }}
        >
          {ready && displayPageInfo && (
            <>
              <span style={{ fontFamily: MONO, fontSize: 10, color: darkMode ? '#7a706a' : '#9a8f80', whiteSpace: 'nowrap', letterSpacing: '0.04em', flexShrink: 0 }}>
                第 {displayPageInfo.page} 頁
              </span>
              <div style={{ flex: 1, height: 2, background: darkMode ? '#3a3430' : '#e4ddd0', borderRadius: 2 }}>
                <div style={{ width: `${Math.min(displayPageInfo.page / displayPageInfo.total * 100, 100)}%`, height: '100%', background: 'oklch(0.62 0.14 40)', borderRadius: 2, transition: 'width .3s' }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: darkMode ? '#7a706a' : '#9a8f80', whiteSpace: 'nowrap', letterSpacing: '0.04em', flexShrink: 0 }}>
                / {displayPageInfo.total} · {Math.round(displayPageInfo.page / displayPageInfo.total * 100)}%
              </span>
            </>
          )}
        </div>
      </div>

      {/* 桌面版朗讀控制列 — fixed 定位，永遠佔位，用 visibility 切換，避免條件渲染觸發任何潛在副作用 */}
      <div
        className="hidden md:flex"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
          height: 44,
          alignItems: 'center', gap: 10, padding: '0 20px',
          background: darkMode ? '#1a1816' : '#f9f7f2',
          borderTop: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`,
          visibility: (playing || ttsPaused) ? 'visible' : 'hidden',
          pointerEvents: (playing || ttsPaused) ? 'auto' : 'none',
        }}
      >
          <span style={{ flex: 1, fontSize: 12, fontFamily: MONO, letterSpacing: '0.04em', color: playing ? (darkMode ? '#c8b89a' : 'oklch(0.62 0.14 40)') : (darkMode ? '#7a706a' : '#9a8f80'), userSelect: 'none' }}>
            {playing ? '朗讀中…' : '已暫停'}
          </span>
          <button
            onClick={() => playing ? handleTTSPause() : handleTTSPlay()}
            style={{ width: 44, height: 32, borderRadius: 8, cursor: 'pointer', background: darkMode ? '#2a2520' : '#f1ede4', border: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`, color: darkMode ? '#e8e0d4' : '#2a2420', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            aria-label={playing ? '暫停朗讀' : '繼續朗讀'}
          >
            {playing ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>}
          </button>
          <button
            onClick={handleTTSReset}
            style={{ width: 44, height: 32, borderRadius: 8, cursor: 'pointer', background: darkMode ? '#2a2520' : '#f1ede4', border: `1px solid ${darkMode ? '#3a3430' : '#e4ddd0'}`, color: darkMode ? '#7a706a' : '#9a8f80', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            aria-label="停止朗讀"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        </div>
    </div>
  )
}

export default Reader
