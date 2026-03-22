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

export type ActivePanel = 'notes' | 'chapters' | 'settings' | 'bookinfo' | 'mobilepanel' | null

interface Props {
  onBack: () => void
  bookTitle?: string
  darkMode: boolean
  onToggleDark: () => void
  onToggleNotes: () => void
  onToggleChapters: () => void
  onToggleSettings: () => void
  onToggleBookInfo: () => void
  onToggleMobilePanel: () => void
  activePanel: ActivePanel
}

const Toolbar = ({
  onBack,
  bookTitle,
  darkMode,
  onToggleDark,
  onToggleNotes,
  onToggleChapters,
  onToggleSettings,
  onToggleBookInfo,
  onToggleMobilePanel,
  activePanel,
}: Props) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-gray-800">
      <button
        className="p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition text-stone-600 dark:text-stone-300 shrink-0"
        onClick={onBack}
        aria-label="返回書庫"
        title="返回書庫"
      >
        <IconBack />
      </button>

      <div className="flex-1 flex justify-center overflow-hidden">
        {bookTitle && (
          <span className="text-xs text-stone-400 dark:text-stone-500 truncate select-none pointer-events-none">
            {bookTitle}
          </span>
        )}
      </div>

      {/* 手機：合併面板按鈕（md 以上隱藏） */}
      <button
        className={`md:hidden p-2 rounded transition text-stone-500 dark:text-stone-400 ${
          activePanel === 'mobilepanel'
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
            : 'hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
        onClick={onToggleMobilePanel}
        aria-label="書籍資訊／目錄／註記"
        title="書籍資訊／目錄／註記"
      >
        <IconPanels />
      </button>

      {/* 桌面：個別按鈕（手機隱藏） */}
      <button
        className={`hidden md:block p-2 rounded transition text-stone-500 dark:text-stone-400 ${
          activePanel === 'bookinfo'
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
            : 'hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
        onClick={onToggleBookInfo}
        aria-label="書籍資訊"
        title="書籍資訊"
      >
        <IconBook />
      </button>
      <button
        className={`p-2 rounded transition text-stone-500 dark:text-stone-400 ${
          activePanel === 'settings'
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
            : 'hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
        onClick={onToggleSettings}
        aria-label="排版與語音設定"
        title="排版與語音設定"
      >
        <IconSettings />
      </button>
      <button
        className={`hidden md:block p-2 rounded transition text-stone-500 dark:text-stone-400 ${
          activePanel === 'chapters'
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
            : 'hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
        onClick={onToggleChapters}
        aria-label="切換章節目錄"
        title="章節目錄"
      >
        <IconChapters />
      </button>
      <button
        className={`hidden md:block p-2 rounded transition text-stone-500 dark:text-stone-400 ${
          activePanel === 'notes'
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
            : 'hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
        onClick={onToggleNotes}
        aria-label="切換註記面板"
        title="我的註記"
      >
        <IconNotes />
      </button>
      <button
        className="p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition text-stone-500 dark:text-stone-400"
        onClick={onToggleDark}
        aria-label={darkMode ? '切換淺色模式' : '切換深色模式'}
      >
        {darkMode ? <IconSun /> : <IconMoon />}
      </button>
    </div>
  )
}

export default Toolbar
