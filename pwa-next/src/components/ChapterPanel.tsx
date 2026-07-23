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
  index: number
  activeHref: string | null
  onNavigate: (href: string) => void
}

const findBestMatch = (items: TocItem[], file: string): string | null => {
  for (const item of items) {
    if (item.href.split('#')[0] === file) return item.href
    if (item.subitems?.length) {
      const sub = findBestMatch(item.subitems, file)
      if (sub) return sub
    }
  }
  return null
}

const TocRow = ({ item, depth, index, activeHref, onNavigate }: RowProps) => {
  const [open, setOpen] = useState(true)
  const hasChildren = (item.subitems?.length ?? 0) > 0
  const isActive = item.href === activeHref

  return (
    <>
      <li
        style={{ paddingRight: 16 + depth * 12 }}
        className={`flex items-center w-full transition-colors duration-120 ${
          isActive ? 'bg-paper-2 text-ink' : depth > 0 ? 'text-ink-3 hover:bg-paper-2' : 'text-ink-2 hover:bg-paper-2'
        }`}
      >
        {hasChildren && (
          <button
            type="button"
            className="pt-2.5 pr-1 pb-2.5 pl-5 text-ink-3 text-[10px] leading-none shrink-0 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
            aria-label={open ? '收合' : '展開'}
          >
            {open ? '▾' : '▸'}
          </button>
        )}
        <button
          type="button"
          className={`flex items-center flex-1 min-w-0 py-2.5 text-left bg-transparent text-inherit ${hasChildren ? 'pl-0' : 'pl-5'}`}
          onClick={() => onNavigate(item.href)}
        >
          {isActive ? (
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mr-3" />
          ) : (
            <span className="font-ui-mono text-[10px] text-ink-3 w-4.5 text-right mr-2.5 shrink-0 tracking-[0.04em]">
              {String(index + 1).padStart(2, '0')}
            </span>
          )}
          <span className="flex-1 font-ui-serif text-sm overflow-hidden text-ellipsis whitespace-nowrap">
            {item.label}
          </span>
          {isActive && (
            <span className="font-ui-mono text-[10px] text-ink-3 tracking-[0.06em] shrink-0 ml-2">
              正在閱讀
            </span>
          )}
        </button>
      </li>
      {hasChildren && open &&
        item.subitems!.map((sub, si) => (
          <TocRow
            key={sub.id || sub.href}
            item={sub} depth={depth + 1} index={si}
            activeHref={activeHref} onNavigate={onNavigate}
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
  embedded?: boolean
}

const ChapterPanel = ({ toc, currentHref, onNavigate, embedded }: Props) => {
  const activeHref = findBestMatch(toc, currentHref)

  const listContent = (
    <div className="flex-1 overflow-y-auto min-h-0">
      {toc.length === 0 ? (
        <p className="p-5 text-[13px] text-ink-3 font-ui-serif">此書籍無目錄資料</p>
      ) : (
        <ul className="list-none m-0 py-1.5">
          {toc.map((item, i) => (
            <TocRow
              key={item.id || item.href}
              item={item} depth={0} index={i}
              activeHref={activeHref} onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  )

  if (embedded) return listContent

  return (
    <div className="w-80 shrink-0 h-full border-l border-border bg-paper flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-border shrink-0">
        <div className="font-ui-serif text-[17px] font-medium tracking-[0.01em] text-ink">目錄</div>
        <div className="font-ui-mono text-[10px] text-ink-3 tracking-[0.12em] uppercase mt-1">
          {toc.length} 章節
        </div>
      </div>
      {listContent}
    </div>
  )
}

export default ChapterPanel
