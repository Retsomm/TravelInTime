import type { Bookmark } from '@/hooks/useLibrary'
import { MONO, SERIF } from '@/components/Reader/bookCoverStyles'

interface Props {
  bookmarks: Bookmark[]
  darkMode: boolean
  pendingDeleteId: string | null
  onClose: () => void
  onNavigate: (bookmark: Bookmark) => void
  onDeleteRequest: (id: string | null) => void
  onDelete: (id: string) => void
}

const BookmarkPanel = ({ bookmarks, darkMode, pendingDeleteId, onClose, onNavigate, onDeleteRequest, onDelete }: Props) => {
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const paperBg = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2 = darkMode ? '#231f1c' : '#f1ede4'
  const inkCol = darkMode ? '#e8e0d4' : '#2a2420'
  const ink3Col = darkMode ? '#7a706a' : '#9a8f80'

  return (
    <div style={{ width: 260, flexShrink: 0, height: '100%', borderLeft: `1px solid ${borderCol}`, background: paperBg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${borderCol}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: inkCol }}>書籤清單</div>
        <button className="no-drag" onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink3Col, cursor: 'pointer', transition: 'all .12s' }} onMouseEnter={(e) => { e.currentTarget.style.color = inkCol; e.currentTarget.style.background = paperBg2 }} onMouseLeave={(e) => { e.currentTarget.style.color = ink3Col; e.currentTarget.style.background = 'transparent' }} aria-label="關閉">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {bookmarks.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 12, color: ink3Col, letterSpacing: '0.04em' }}>尚無書籤</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[...bookmarks].sort((a, b) => a.addedAt - b.addedAt).map((bm) => (
              <div key={bm.id} className="no-drag" style={{ borderBottom: `1px solid ${borderCol}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', transition: 'background .12s' }} onClick={() => onNavigate(bm)} onMouseEnter={(e) => (e.currentTarget.style.background = darkMode ? '#231f1c' : '#f1ede4')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ fontFamily: SERIF, fontSize: 13, color: inkCol, lineHeight: 1.5, wordBreak: 'break-all' }}>{bm.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.04em' }}>
                    {new Date(bm.addedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                  </span>
                  <button className="no-drag" onClick={(e) => { e.stopPropagation(); onDeleteRequest(pendingDeleteId === bm.id ? null : bm.id) }} style={{ fontFamily: MONO, fontSize: 10, color: pendingDeleteId === bm.id ? '#ef4444' : ink3Col, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'all .12s', background: pendingDeleteId === bm.id ? (darkMode ? '#3a1a1a' : '#fff0f0') : 'transparent' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = darkMode ? '#3a1a1a' : '#fff0f0' }} onMouseLeave={(e) => { e.currentTarget.style.color = pendingDeleteId === bm.id ? '#ef4444' : ink3Col; e.currentTarget.style.background = pendingDeleteId === bm.id ? (darkMode ? '#3a1a1a' : '#fff0f0') : 'transparent' }} aria-label="移除書籤">
                    移除
                  </button>
                </div>
                {pendingDeleteId === bm.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: '#ef4444', letterSpacing: '0.02em', flexShrink: 0 }}>確定移除？</span>
                    <button className="no-drag" style={{ height: 22, padding: '0 8px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: ink3Col, background: darkMode ? '#2a2520' : '#ede8e0', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onDeleteRequest(null) }}>取消</button>
                    <button className="no-drag" style={{ height: 22, padding: '0 8px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: '#fff', background: '#ef4444', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onDelete(bm.id); onDeleteRequest(null) }}>移除</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default BookmarkPanel
