import type { Bookmark } from '@/hooks/useLibrary'
import { formatBookmarkDate, sortBookmarksByAddedAt } from '@/components/Reader/bookmarkUtils'

interface Props {
  bookmarks: Bookmark[]
  pendingDeleteId: string | null
  onSelect: (cfi: string) => void
  onTogglePendingDelete: (id: string) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
}

// 桌面版側欄與行動版覆層皆用同一份書籤清單渲染邏輯，僅外層容器/標題列不同，
// 觸控事件（onTouchEnd）在兩種版面都掛上——桌面滑鼠事件不會觸發 touch handler，
// 行動裝置則需要 preventDefault 避免點擊延遲/重複觸發，兩者互不影響可以共用。
const BookmarkList = ({
  bookmarks, pendingDeleteId, onSelect, onTogglePendingDelete, onConfirmDelete, onCancelDelete,
}: Props) => {
  if (bookmarks.length === 0) {
    return (
      <div className="py-8 px-5 text-center font-ui-mono text-xs text-ink-3 tracking-[0.04em]">尚無書籤</div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
      {sortBookmarksByAddedAt(bookmarks).map((bm) => (
        <div
          key={bm.id}
          className="border-b border-border py-3 px-4 flex flex-col gap-1.5 cursor-pointer transition-colors duration-120 touch-manipulation hover:bg-paper-2"
          onClick={() => onSelect(bm.cfi)}
          onTouchEnd={(e) => { e.preventDefault(); onSelect(bm.cfi) }}
        >
          <div className="font-ui-serif text-[13px] text-ink leading-normal break-all">
            {bm.label}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-ui-mono text-[10px] text-ink-3 tracking-[0.04em]">
              {formatBookmarkDate(bm.addedAt)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePendingDelete(bm.id) }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePendingDelete(bm.id) }}
              className={`font-ui-mono text-[10px] cursor-pointer py-0.5 px-1.5 rounded transition-all duration-120 touch-manipulation hover:text-red-500 hover:bg-[#fff0f0] dark:hover:bg-[#3a1a1a] ${
                pendingDeleteId === bm.id ? 'text-red-500 bg-[#fff0f0] dark:bg-[#3a1a1a]' : 'text-ink-3 bg-transparent'
              }`}
              aria-label="移除書籤"
            >
              移除
            </button>
          </div>
          {pendingDeleteId === bm.id && (
            <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
              <span className="font-ui-mono text-[11px] text-red-500 tracking-[0.02em] shrink-0">確定移除？</span>
              <button
                className="h-5.5 px-2 rounded-[5px] font-ui-mono text-[11px] text-ink-3 bg-[#ede8e0] dark:bg-[#2a2520] cursor-pointer touch-manipulation"
                onClick={(e) => { e.stopPropagation(); onCancelDelete() }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onCancelDelete() }}
              >取消</button>
              <button
                className="h-5.5 px-2 rounded-[5px] font-ui-mono text-[11px] text-white bg-red-500 cursor-pointer touch-manipulation"
                onClick={(e) => { e.stopPropagation(); onConfirmDelete(bm.id) }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onConfirmDelete(bm.id) }}
              >移除</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default BookmarkList
