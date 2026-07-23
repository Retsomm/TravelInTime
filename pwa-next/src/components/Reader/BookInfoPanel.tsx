import { useEffect, useState, type CSSProperties } from 'react'
import type { BookRecord } from '@/hooks/useLibrary'
import { coverStyleFor, formatDate, MONO, SERIF } from '@/components/Reader/bookCoverStyles'
import { copyTextToClipboard } from '@/components/Reader/annotationUtils'
import styles from './BookInfoPanel.module.css'

const BookInfoPanel = ({
  record, getCoverDataUrl, darkMode, onClose, progress, embedded,
}: {
  record: BookRecord
  getCoverDataUrl: (id: string) => Promise<string | null>
  darkMode: boolean
  onClose?: () => void
  progress?: number | null
  embedded?: boolean
}) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  useEffect(() => {
    setCoverUrl(null)
    if (!record.hasCover) return
    let active = true
    getCoverDataUrl(record.id)
      .then((url) => { if (active && url) setCoverUrl(url) })
      .catch(() => {})
    return () => { active = false }
  }, [record.id, record.hasCover, getCoverDataUrl])

  const handleCopyTitle = () => {
    copyTextToClipboard(record.title)
      .then(() => setCopyFailed(false))
      .catch(() => setCopyFailed(true))
  }

  const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2  = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
  const ink2Col   = darkMode ? '#b8afa4' : '#5a4e44'
  const ink3Col   = darkMode ? '#7a706a' : '#9a8f80'
  const accentCol = 'oklch(0.62 0.14 40)'

  const cs = coverStyleFor(record.id)
  const pct = progress != null ? Math.round(progress * 100) : null

  const coverFallbackVars = {
    '--cover-bg': cs.bg,
    '--cover-rule': cs.rule,
    '--cover-ink': cs.ink,
  } as CSSProperties

  const coverEl = coverUrl ? (
    <img src={coverUrl} alt={record.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {/* 封面 */}
      <div style={{ padding: '16px 20px 12px' }}>
        <div style={{ aspectRatio: '2/3', overflow: 'hidden', boxShadow: '0 4px 16px -4px rgba(0,0,0,0.25)', borderRadius: 4 }}>
          {coverEl}
        </div>
      </div>

      {/* 書名作者 */}
      <div className={styles.titleBlock} style={{ '--ink-col': inkCol, '--ink3-col': ink3Col } as CSSProperties}>
        <div className={styles.title}>{record.title}</div>
        {record.author && (
          <div className={styles.author}>{record.author}</div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${borderCol}` }} />

      {/* 進度條 */}
      {pct !== null && (
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.08em', textTransform: 'uppercase' }}>閱讀進度</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: accentCol }}>{pct}%</span>
          </div>
          <div style={{ height: 3, background: borderCol, borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: accentCol, borderRadius: 2 }} />
          </div>
        </div>
      )}

      {/* Metadata */}
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {metaRows.filter(r => r.label !== '進度').map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.06em', flexShrink: 0 }}>{label}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: ink2Col, letterSpacing: '0.02em', textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${borderCol}` }} />

      {/* 操作按鈕 */}
      <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={handleCopyTitle}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '9px 14px', borderRadius: 8, background: paperBg2,
            border: `1px solid ${borderCol}`, color: ink2Col,
            fontFamily: SERIF, fontSize: 13, cursor: 'pointer', transition: 'background .12s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = borderCol)}
          onMouseLeave={(e) => (e.currentTarget.style.background = paperBg2)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          複製書名
        </button>
        {copyFailed && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: accentCol }}>複製失敗，請手動複製</div>
        )}
      </div>
    </div>
  )

  if (embedded) return body

  return (
    <div style={{
      width: 260, flexShrink: 0, height: '100%',
      borderLeft: `1px solid ${borderCol}`,
      background: paperBg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${borderCol}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: inkCol }}>書籍資訊</div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink3Col, cursor: 'pointer', transition: 'all .12s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = inkCol; e.currentTarget.style.background = paperBg2 }}
            onMouseLeave={(e) => { e.currentTarget.style.color = ink3Col; e.currentTarget.style.background = 'transparent' }}
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
