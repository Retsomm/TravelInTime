import { useEffect, useState } from 'react'
import type { BookRecord } from '@/hooks/useLibrary'
import { coverStyleFor, MONO, SERIF } from '@/components/Library/coverStyles'

interface CardProps {
  record: BookRecord
  getCoverDataUrl: (id: string) => Promise<string | null>
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

const BookCard = ({ record, getCoverDataUrl, onOpen, onRemove }: CardProps) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const pct = Math.round((record.progress ?? 0) * 100)
  const s = coverStyleFor(record.id)

  useEffect(() => {
    if (!record.hasCover) return
    getCoverDataUrl(record.id).then((url) => { if (url) setCoverUrl(url) })
  }, [record.id, record.hasCover, getCoverDataUrl])

  return (
    <div className="group relative">
      <button
        type="button"
        className="block w-full text-left cursor-pointer"
        onClick={() => onOpen(record.id)}
        aria-label={`開啟《${record.title}》`}
      >
      <div
        style={{ background: s.bg }}
        className="relative aspect-2/3 rounded-[3px] overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),3px_6px_18px_-6px_rgba(0,0,0,0.18),1px_2px_4px_-2px_rgba(0,0,0,0.12)]"
      >
        {coverUrl ? (
          <img src={coverUrl} alt={record.title} className="w-full h-full object-cover" />
        ) : (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-2.5 pointer-events-none z-1 bg-[linear-gradient(90deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.06)_40%,transparent_100%)]" />
            <div style={{ color: s.ink }} className="absolute inset-0 py-[14%] px-[12%] flex flex-col justify-between">
              <div>
                <div style={{ background: s.rule }} className="w-5.5 h-0.5 mb-2.5" />
                <div className="font-ui-serif text-[13px] font-semibold leading-tight tracking-[0.01em]">
                  {record.title}
                </div>
              </div>
              <div>
                <div className="font-ui-mono text-[8px] tracking-[0.16em] uppercase opacity-75">
                  {record.author || '—'}
                </div>
                <div style={{ background: s.rule }} className="w-3.5 h-px mt-1.5 opacity-70" />
              </div>
            </div>
            <div className="absolute inset-0 pointer-events-none mix-blend-overlay bg-[repeating-linear-gradient(30deg,transparent_0_3px,rgba(0,0,0,0.015)_3px_4px),repeating-linear-gradient(-30deg,transparent_0_3px,rgba(255,255,255,0.015)_3px_4px)]" />
          </>
        )}
      </div>

      <div className="mt-3">
        <div className="font-ui-serif text-[13px] font-medium leading-[1.3] tracking-[0.005em] line-clamp-2 text-stone-800 dark:text-stone-100">
          {record.title}
        </div>
        {record.author && (
          <div className="font-ui-mono text-[10px] tracking-[0.04em] mt-0.75 text-stone-400 dark:text-stone-500 truncate">
            {record.author}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 rounded-full overflow-hidden h-1 bg-[#e0d8cc]">
            <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-ui-mono text-[10px] tracking-[0.04em] text-stone-400 dark:text-stone-500 tabular-nums shrink-0">
            {pct === 100 ? '讀畢' : `${pct}%`}
          </span>
        </div>
      </div>
      </button>
      <button
        type="button"
        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/55 text-white text-[11px] z-2"
        onClick={(e) => { e.stopPropagation(); onRemove(record.id) }}
        aria-label="移除書籍"
      >✕</button>
    </div>
  )
}

export default BookCard
