import { useState } from 'react'

export interface TocItem {
  id: string
  href: string
  label: string
  subitems?: TocItem[]
}

interface RowProps {
  item: TocItem
  depth: number
  currentHref: string
  onNavigate: (href: string) => void
}

const DEPTH_PL = ['pl-4', 'pl-8', 'pl-12', 'pl-16', 'pl-20']

const TocRow = ({ item, depth, currentHref, onNavigate }: RowProps) => {
  const [open, setOpen] = useState(true)
  const hasChildren = (item.subitems?.length ?? 0) > 0
  const isActive = item.href.split('#')[0] === currentHref
  const pl = DEPTH_PL[Math.min(depth, DEPTH_PL.length - 1)]

  return (
    <>
      <li>
        <div
          className={`flex items-center gap-1 pr-4 py-1.5 cursor-pointer text-sm transition-colors
            hover:bg-stone-50 dark:hover:bg-gray-700/50
            ${pl}
            ${isActive
              ? 'text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-900/20'
              : 'text-stone-700 dark:text-stone-300'
            }`}
          onClick={() => onNavigate(item.href)}
        >
          {hasChildren ? (
            <button
              className="shrink-0 w-4 text-stone-400 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-400 text-xs"
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
              aria-label={open ? '收合' : '展開'}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="shrink-0 w-4" />
          )}
          <span className="flex-1 truncate">{item.label}</span>
        </div>
      </li>
      {hasChildren && open &&
        item.subitems!.map((sub) => (
          <TocRow
            key={sub.id || sub.href}
            item={sub}
            depth={depth + 1}
            currentHref={currentHref}
            onNavigate={onNavigate}
          />
        ))
      }
    </>
  )
}

interface Props {
  toc: TocItem[]
  currentHref: string
  onNavigate: (href: string) => void
}

const ChapterPanel = ({ toc, currentHref, onNavigate }: Props) => {
  const totalChapters = toc.length

  return (
    <div className="w-80 border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-gray-800 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700 shrink-0">
        <h2 className="font-semibold text-stone-700 dark:text-stone-200">章節目錄</h2>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">共 {totalChapters} 章</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {toc.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-500 p-4">此書籍無目錄資料</p>
        ) : (
          <ul>
            {toc.map((item) => (
              <TocRow
                key={item.id || item.href}
                item={item}
                depth={0}
                currentHref={currentHref}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ChapterPanel
