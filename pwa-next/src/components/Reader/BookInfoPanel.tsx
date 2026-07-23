import { useEffect, useState, type CSSProperties } from 'react'
import type { BookRecord } from '@/hooks/useLibrary'
import { coverStyleFor, formatDate } from '@/components/Reader/bookCoverStyles'
import { copyTextToClipboard } from '@/components/Reader/annotationUtils'
import styles from './BookInfoPanel.module.css'

const BookInfoPanel = ({
  record, getCoverDataUrl, onClose, progress, embedded,
}: {
  record: BookRecord
  getCoverDataUrl: (id: string) => Promise<string | null>
  onClose?: () => void
  progress?: number | null
  embedded?: boolean
}) => {
  const [cover, setCover] = useState<{ id: string; url: string } | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  useEffect(() => {
    if (!record.hasCover) return
    let active = true
    getCoverDataUrl(record.id)
      .then((url) => { if (active && url) setCover({ id: record.id, url }) })
      .catch(() => {})
    return () => { active = false }
  }, [record.id, record.hasCover, getCoverDataUrl])

  const coverUrl = cover?.id === record.id ? cover.url : null

  const handleCopyTitle = () => {
    copyTextToClipboard(record.title)
      .then(() => setCopyFailed(false))
      .catch(() => setCopyFailed(true))
  }

  const cs = coverStyleFor(record.id)
  const pct = progress != null ? Math.round(progress * 100) : null

  const coverFallbackVars = {
    '--cover-bg': cs.bg,
    '--cover-rule': cs.rule,
    '--cover-ink': cs.ink,
  } as CSSProperties

  const coverEl = coverUrl ? (
    <img src={coverUrl} alt={record.title} className="w-full h-full object-cover block" />
  ) : (
    <div className={styles.coverFallback} style={coverFallbackVars}>
      <div className={styles.coverFallbackOverlay} />
      <div className={styles.coverFallbackTitleWrap}>
        <div className={styles.coverFallbackTitle}>{record.title}</div>
      </div>
      {record.author && (
        <div className={styles.coverFallbackAuthor}>{record.author}</div>
      )}
    </div>
  )

  const metaRows = [
    { label: '匯入時間', value: formatDate(record.addedAt) },
    { label: '最後閱讀', value: record.lastOpenedAt ? formatDate(record.lastOpenedAt) : '尚未記錄' },
    { label: '進度', value: pct !== null ? `${pct}%` : '—' },
  ]

  const body = (
    <div className="flex-1 overflow-y-auto min-h-0">
      {/* 封面 */}
      <div className="pt-4 px-5 pb-3">
        <div className="aspect-2/3 overflow-hidden shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25)] rounded">
          {coverEl}
        </div>
      </div>

      {/* 書名作者 */}
      <div className={styles.titleBlock}>
        <div className={styles.title}>{record.title}</div>
        {record.author && (
          <div className={styles.author}>{record.author}</div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* 進度條 */}
      {pct !== null && (
        <div className="pt-3.5 px-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-ui-mono text-[10px] text-ink-3 tracking-[0.08em] uppercase">閱讀進度</span>
            <span className="font-ui-mono text-[10px] text-accent">{pct}%</span>
          </div>
          <div className="h-0.75 bg-border rounded-sm">
            <div className="h-full bg-accent rounded-sm" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="py-3.5 px-5 flex flex-col gap-2.5">
        {metaRows.filter(r => r.label !== '進度').map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <span className="font-ui-mono text-[10px] text-ink-3 tracking-[0.06em] shrink-0">{label}</span>
            <span className="font-ui-mono text-[11px] text-ink-2 tracking-[0.02em] text-right">{value}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-border" />

      {/* 操作按鈕 */}
      <div className="py-3 px-5 flex flex-col gap-2">
        <button
          onClick={handleCopyTitle}
          className="flex items-center gap-2 w-full py-2.25 px-3.5 rounded-lg bg-paper-2 border border-border text-ink-2 font-ui-serif text-[13px] cursor-pointer transition-colors duration-120 hover:bg-border"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          複製書名
        </button>
        {copyFailed && (
          <div className="font-ui-mono text-[10px] text-accent">複製失敗，請手動複製</div>
        )}
      </div>
    </div>
  )

  if (embedded) return body

  return (
    <div className="w-65 shrink-0 h-full border-l border-border bg-paper flex flex-col overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border shrink-0 flex items-center justify-between">
        <div className="font-ui-serif text-[15px] font-medium text-ink">書籍資訊</div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-6.5 h-6.5 rounded-md flex items-center justify-center text-ink-3 cursor-pointer transition-all duration-120 hover:text-ink hover:bg-paper-2"
            aria-label="關閉"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      {body}
    </div>
  )
}

export default BookInfoPanel
