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
    <div className="group cursor-pointer" onClick={() => onOpen(record.id)}>
      <div style={{
        position: 'relative', aspectRatio: '2/3', borderRadius: 3, overflow: 'hidden',
        background: s.bg,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08), 3px 6px 18px -6px rgba(0,0,0,0.18), 1px 2px 4px -2px rgba(0,0,0,0.12)',
      }}>
        {coverUrl ? (
          <img src={coverUrl} alt={record.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 10,
              background: 'linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 40%, transparent 100%)',
              pointerEvents: 'none', zIndex: 1,
            }} />
            <div style={{
              position: 'absolute', inset: 0, padding: '14% 12%',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              color: s.ink,
            }}>
              <div>
                <div style={{ width: 22, height: 2, background: s.rule, marginBottom: 10 }} />
                <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 600, lineHeight: 1.25, letterSpacing: '0.01em' }}>
                  {record.title}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75 }}>
                  {record.author || '—'}
                </div>
                <div style={{ width: 14, height: 1, background: s.rule, marginTop: 6, opacity: 0.7 }} />
              </div>
            </div>
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'repeating-linear-gradient(30deg, transparent 0 3px, rgba(0,0,0,0.015) 3px 4px), repeating-linear-gradient(-30deg, transparent 0 3px, rgba(255,255,255,0.015) 3px 4px)',
              mixBlendMode: 'overlay',
            }} />
          </>
        )}
        <button
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 11, zIndex: 2 }}
          onClick={(e) => { e.stopPropagation(); onRemove(record.id) }}
          aria-label="移除書籍"
        >✕</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{
          fontFamily: SERIF, fontSize: 13, fontWeight: 500,
          lineHeight: 1.3, letterSpacing: '0.005em',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }} className="text-stone-800 dark:text-stone-100">
          {record.title}
        </div>
        {record.author && (
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em', marginTop: 3 }} className="text-stone-400 dark:text-stone-500 truncate">
            {record.author}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: '#e0d8cc' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'oklch(0.62 0.14 40)', borderRadius: 999 }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em' }} className="text-stone-400 dark:text-stone-500 tabular-nums shrink-0">
            {pct === 100 ? '讀畢' : `${pct}%`}
          </span>
        </div>
      </div>
    </div>
  )
}

export default BookCard
