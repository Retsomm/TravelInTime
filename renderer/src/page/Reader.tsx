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
import BookInfoPanel from '@/components/Reader/BookInfoPanel'
import BookmarkPanel from '@/components/Reader/BookmarkPanel'
import HighlightPopup from '@/components/Reader/HighlightPopup'
import { findChapterTitleByHref, findNearestChapterLabel } from '@/components/Reader/tocLookup'
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
}

const Reader = ({ bookPath, bookId, bookRecord, getCoverDataUrl, onBack, darkMode, onToggleDark, onUpdateProgress }: Props) => {
  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const lastIframeClickRef = useRef({ x: 0, y: 0 }) // iframe 內最後一次點擊的主視窗座標
  const [activePanel, setActivePanel] = useState<'notes' | 'chapters' | 'settings' | 'bookinfo' | 'bookmarks' | null>(null)

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
  } = useReaderEngine({
    bookPath, bookId, bookRecord, darkMode, activePanel, onUpdateProgress,
    viewerRef, bookRef, renditionRef, lastIframeClickRef,
    fontSize, fontFamily, script, lineHeight, letterSpacing, readingDirection,
    setFontFamily, setScript, resetScript,
    fontSizeRef, fontFamilyRef, lineHeightRef, letterSpacingRef,
    playing, ttsPaused, speak, pause, resume, stop, resetTTS, ttsActiveRef,
    pageInfo, setPageInfo,
    chapterPagesRef, currentChapterPageRef, bookBufferRef, scanAllChapterPages, triggerScan, cancelScan, resetScanState,
    setPopup, setEditPopup, pendingAnnotationCfiRef, addEpubAnnotation, removePendingAnnotation,
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

  const togglePanel = (panel: 'notes' | 'chapters' | 'settings' | 'bookinfo' | 'bookmarks') =>
    setActivePanel((cur) => (cur === panel ? null : panel))

  return (
    <div
      className="flex flex-col h-screen"
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
        <div className="flex-1 relative overflow-hidden">
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-stone-400 dark:text-stone-500">
              載入中…
            </div>
          )}
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full transition text-xl disabled:opacity-30" style={{ background: 'transparent', color: darkMode ? '#7a706a' : '#9a8f80' }}
            onClick={readingDirection === 'rtl' ? nextPage : prevPage}
            disabled={!ready || (readingDirection === 'rtl' ? atEnd : atStart)}
            aria-label={readingDirection === 'rtl' ? '下一頁' : '上一頁'}
          >
            ‹
          </button>
          <div ref={viewerRef} className="absolute top-2 bottom-7 left-12 right-12 overflow-hidden" />

          {/* 頁面資訊：底部 */}
          {ready && (
            <div className="absolute bottom-2 left-14 right-14 flex justify-between z-10 pointer-events-none">
              <span className="text-xs text-stone-400 dark:text-stone-500 select-none">
                {chapterRemaining !== null ? `這一章還有 ${chapterRemaining} 頁` : ''}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500 select-none">
                {displayPageInfo ? `第 ${displayPageInfo.page} 頁（共 ${displayPageInfo.total} 頁）` : ''}
              </span>
            </div>
          )}
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full transition text-xl disabled:opacity-30" style={{ background: 'transparent', color: darkMode ? '#7a706a' : '#9a8f80' }}
            onClick={readingDirection === 'rtl' ? prevPage : nextPage}
            disabled={!ready || (readingDirection === 'rtl' ? atStart : atEnd)}
            aria-label={readingDirection === 'rtl' ? '上一頁' : '下一頁'}
          >
            ›
          </button>

          {editPopup && (
            <HighlightPopup
              mode="edit"
              x={editPopup.x}
              y={editPopup.y}
              darkMode={darkMode}
              annotationId={editPopup.annotationId}
              onEditColor={handleEditColor}
              onDelete={handleDeleteMark}
            />
          )}

          {popup && (
            <HighlightPopup
              mode="selection"
              x={popup.x}
              y={popup.y}
              darkMode={darkMode}
              onHighlight={handleHighlight}
              onSearch={handleSearchSelectedText}
              onCopy={handleCopySelectedText}
            />
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
            progress={pageInfo && pageInfo.total > 0 ? pageInfo.page / pageInfo.total : null}
          />
        )}
        {activePanel === 'bookmarks' && (
          <BookmarkPanel
            bookmarks={bookmarks}
            darkMode={darkMode}
            pendingDeleteId={bookmarkPendingDeleteId}
            onClose={() => setActivePanel(null)}
            onNavigate={(bookmark) => { renditionRef.current?.display(bookmark.cfi).catch(() => {}); setActivePanel(null) }}
            onDeleteRequest={setBookmarkPendingDeleteId}
            onDelete={handleDeleteBookmark}
          />
        )}
      </div>
    </div>
  )
}

export default Reader
