import { useEffect, useRef, useState } from 'react'
import { SERIF, MONO } from '@/constants/fonts'

const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 1-15.5 6.2" />
    <path d="M3 12A9 9 0 0 1 18.5 5.8" />
    <path d="M18 2v5h-5" />
    <path d="M6 22v-5h5" />
  </svg>
)

const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const IconChapters = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)

const IconNotes = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
)

const IconSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)

const IconMoon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const IconBack = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const IconBook = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)

const IconPanels = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <line x1="3" y1="9" x2="15" y2="9" />
    <line x1="3" y1="15" x2="15" y2="15" />
  </svg>
)

const IconBookmarkOutline = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)

const IconBookmarkFill = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)

const IconBookmarkList = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 21l-5-4-5 4V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16z" />
    <line x1="17" y1="7" x2="21" y2="7" />
    <line x1="17" y1="11" x2="21" y2="11" />
    <line x1="17" y1="15" x2="21" y2="15" />
  </svg>
)

export type ActivePanel = 'notes' | 'chapters' | 'settings' | 'bookinfo' | 'mobilepanel' | 'bookmarks' | null

interface Props {
  onBack: () => void
  bookTitle?: string
  bookAuthor?: string
  pageInfo?: { page: number; total: number } | null
  darkMode: boolean
  onToggleDark: () => void
  onToggleNotes: () => void
  onToggleChapters: () => void
  onToggleSettings: () => void
  onToggleBookInfo: () => void
  onToggleMobilePanel: () => void
  activePanel: ActivePanel
  isBookmarked: boolean
  onToggleBookmark: () => void
  onToggleBookmarkList: () => void
  onApplyLatestVersion: () => void | Promise<void>
}

const Toolbar = ({
  onBack,
  bookTitle,
  bookAuthor,
  pageInfo,
  darkMode,
  onToggleDark,
  onToggleNotes,
  onToggleChapters,
  onToggleSettings,
  onToggleBookInfo,
  onToggleMobilePanel,
  activePanel,
  isBookmarked,
  onToggleBookmark,
  onToggleBookmarkList,
  onApplyLatestVersion,
}: Props) => {
  const [logoMenuOpen, setLogoMenuOpen] = useState(false)
  const [applyingUpdate, setApplyingUpdate] = useState(false)
  const logoMenuRef = useRef<HTMLDivElement>(null)

  const pct = pageInfo && pageInfo.total > 0
    ? Math.round(pageInfo.page / pageInfo.total * 100)
    : null

  useEffect(() => {
    if (!logoMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (logoMenuRef.current?.contains(event.target as Node)) return
      setLogoMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [logoMenuOpen])

  const handleApplyLatestVersion = async () => {
    if (applyingUpdate) return
    setApplyingUpdate(true)
    try {
      await onApplyLatestVersion()
    } finally {
      setApplyingUpdate(false)
    }
  }

  const btn = (
    isActive: boolean,
    onClick: () => void,
    children: React.ReactNode,
    ariaLabel: string,
    extraClassName?: string,
  ) => (
    <button
      className={`w-8.5 h-8.5 rounded-lg cursor-pointer transition-colors duration-120 flex items-center justify-center shrink-0 touch-manipulation ${
        isActive ? 'text-accent bg-[rgba(180,100,60,0.10)] dark:bg-[rgba(180,100,60,0.18)]' : `text-ink-3 bg-transparent hover:bg-paper-2 ${extraClassName ?? ''}`
      }`}
      onTouchEnd={(e) => { e.preventDefault(); onClick() }}
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {children}
    </button>
  )

  return (
    <div className="bg-paper shrink-0 border-b border-border pt-[env(safe-area-inset-top)]">
    <div className="flex items-center gap-0.5 px-2.5 h-14">
      {/* 左：返回 + 書名作者（固定寬度區塊） */}
      <div className="flex items-center gap-1 shrink-0">
        {btn(false, onBack, <IconBack />, '返回書庫', 'text-ink')}
        {/* T logo + 套用最新版選單：桌面版才顯示，行動版空間不足故隱藏 */}
        <div ref={logoMenuRef} className="hidden md:block relative shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setLogoMenuOpen((open) => !open) }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setLogoMenuOpen((open) => !open) }}
            aria-label="Travel in Time 選單"
            title="Travel in Time"
            className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center font-ui-serif italic font-bold text-[17px] cursor-pointer touch-manipulation ${
              logoMenuOpen ? 'bg-[rgba(180,100,60,0.10)] dark:bg-[rgba(180,100,60,0.18)] text-accent' : 'bg-ink text-paper'
            }`}
          >
            T
          </button>
          {logoMenuOpen && (
            <div
              className="absolute left-0 top-10 z-60 w-44.5 p-1.5 rounded-lg bg-paper border border-border shadow-[0_14px_32px_-14px_rgba(0,0,0,0.45)]"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleApplyLatestVersion}
                disabled={applyingUpdate}
                className={`w-full min-h-8.5 rounded-md py-2 px-2.5 flex items-center gap-2 bg-transparent font-[inherit] text-[13px] text-left transition-colors duration-120 hover:bg-paper-2 ${
                  applyingUpdate ? 'text-ink-3 cursor-default opacity-70' : 'text-ink cursor-pointer opacity-100'
                }`}
              >
                <IconRefresh />
                <span>{applyingUpdate ? '更新中…' : '套用最新版'}</span>
              </button>
            </div>
          )}
        </div>
        {bookTitle && (
          <div className="flex flex-col justify-center w-37.5">
            <div className="font-ui-serif text-[13px] text-ink overflow-hidden text-ellipsis whitespace-nowrap leading-[1.3]">
              {bookTitle}
            </div>
            {bookAuthor && (
              <div className="font-ui-mono text-[10px] text-ink-3 overflow-hidden text-ellipsis whitespace-nowrap tracking-[0.04em] leading-[1.3]">
                {bookAuthor}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 中：進度條（桌面版才顯示） */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-2 px-2 min-w-0 overflow-hidden">
        {pageInfo && pct !== null && (
          <>
            <span className="font-ui-mono text-[10px] text-ink-3 whitespace-nowrap tracking-[0.04em] shrink-0">
              第 {pageInfo.page} 頁
            </span>
            <div className="w-25 h-0.75 bg-border rounded-sm shrink-0">
              <div className="h-full bg-accent rounded-sm transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-ui-mono text-[10px] text-ink-3 whitespace-nowrap tracking-[0.04em] shrink-0">
              / {pageInfo.total} · {pct}%
            </span>
          </>
        )}
      </div>
      {/* 手機版：佔位讓圖示靠右 */}
      <div className="md:hidden flex-1" />

      {/* 右：圖示按鈕 */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* 收藏按鈕（手機 + 桌面共用） */}
        {btn(isBookmarked, onToggleBookmark, isBookmarked ? <IconBookmarkFill /> : <IconBookmarkOutline />, isBookmarked ? '移除書籤' : '加入書籤')}
        {/* 手機版：panels + settings（wrapper 只用 className，不加 inline display） */}
        <div className="flex md:hidden items-center">
          {btn(activePanel === 'mobilepanel', onToggleMobilePanel, <IconPanels />, '書籍資訊／目錄／註記')}
          {btn(activePanel === 'settings', onToggleSettings, <IconSettings />, '排版與語音設定')}
        </div>
        {/* 桌面版：個別按鈕 */}
        <div className="hidden md:flex items-center">
          {btn(activePanel === 'bookinfo', onToggleBookInfo, <IconBook />, '書籍資訊')}
          {btn(activePanel === 'settings', onToggleSettings, <IconSettings />, '排版與語音設定')}
          {btn(activePanel === 'chapters', onToggleChapters, <IconChapters />, '章節目錄')}
          {btn(activePanel === 'notes', onToggleNotes, <IconNotes />, '我的註記')}
          {btn(activePanel === 'bookmarks', onToggleBookmarkList, <IconBookmarkList />, '書籤清單')}
        </div>
        {btn(false, onToggleDark, darkMode ? <IconSun /> : <IconMoon />, darkMode ? '切換淺色模式' : '切換深色模式')}
      </div>
    </div>
    </div>
  )
}

export default Toolbar
