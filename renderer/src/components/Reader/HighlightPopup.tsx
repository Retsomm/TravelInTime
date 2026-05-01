import { HIGHLIGHT_COLORS } from '@/components/Reader/annotationUtils'

interface BaseProps {
  x: number
  y: number
  darkMode: boolean
}

interface SelectionPopupProps extends BaseProps {
  mode: 'selection'
  onHighlight: (color: string) => void
  onSearch: () => void
  onCopy: () => void
}

interface EditPopupProps extends BaseProps {
  mode: 'edit'
  annotationId: string
  onEditColor: (id: string, color: string) => void
  onDelete: (id: string) => void
}

type Props = SelectionPopupProps | EditPopupProps

const HighlightPopup = (props: Props) => (
  <div
    className="fixed z-50 flex gap-1.5 p-2 rounded-xl shadow-xl"
    style={{ left: props.x, top: props.y - 52, transform: 'translateX(-50%)', background: props.darkMode ? '#231f1c' : '#f9f7f2', border: `1px solid ${props.darkMode ? '#3a3430' : '#e4ddd0'}` }}
    onClick={(e) => e.stopPropagation()}
  >
    {HIGHLIGHT_COLORS.map((c) => (
      <button
        key={c.value}
        className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 shadow hover:scale-110 transition-transform"
        style={{ backgroundColor: c.value }}
        onClick={() => props.mode === 'edit' ? props.onEditColor(props.annotationId, c.value) : props.onHighlight(c.value)}
        aria-label={props.mode === 'edit' ? `${c.label}色` : `${c.label}色標記`}
        title={props.mode === 'edit' ? `${c.label}色` : `${c.label}色標記`}
      />
    ))}
    {props.mode === 'selection' ? (
      <>
        <button className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-500 dark:text-stone-300 text-xs font-semibold transition" onClick={props.onSearch} aria-label="使用 Google 搜尋選取文字" title="Google 搜尋">
          G
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-500 dark:text-stone-300 transition" onClick={props.onCopy} aria-label="複製選取文字" title="複製">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </>
    ) : (
      <button className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-700 hover:bg-red-100 dark:hover:bg-red-900 text-stone-400 hover:text-red-500 dark:hover:text-red-400 text-xs transition" onClick={() => props.onDelete(props.annotationId)} aria-label="刪除此註記" title="刪除">
        ✕
      </button>
    )}
  </div>
)

export default HighlightPopup
