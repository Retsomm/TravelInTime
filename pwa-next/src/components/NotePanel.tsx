import { useRef, useState, useEffect } from 'react'
import { useAnnotationStore } from '@/store/useAnnotationStore'
import type { Annotation } from '@/store/useAnnotationStore'
import { SERIF, MONO } from '@/constants/fonts'
import { HIGHLIGHT_PALETTE } from '@/constants/highlightColors'
import { exportAnnotations } from '@/utils/annotationExport'
import { formatDate } from '@/utils/dateFormat'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  onNavigate: (cfi: string) => void
  onChangeColor: (id: string, color: string) => void
  onRemoveAnnotation: (id: string) => void
  darkMode: boolean
  bookTitle: string
  embedded?: boolean
}

const NotePanel = ({ onNavigate, onChangeColor, onRemoveAnnotation, darkMode, bookTitle, embedded }: Props) => {
  const { annotations, updateNote } = useAnnotationStore()
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)

  const { paperBg, paperBg2, borderCol, inkCol, ink2Col, ink3Col, accentCol } = useThemeColors(darkMode)

  const startEditNote = (a: Annotation) => {
    setPickerOpenId(null)
    setPendingDeleteId(null)
    setEditingNoteId(a.id)
    setEditingNoteText(a.note ?? '')
    setTimeout(() => noteTextareaRef.current?.focus(), 50)
  }

  const saveNote = (id: string) => {
    updateNote(id, editingNoteText)
    setEditingNoteId(null)
  }

  const cancelNote = () => setEditingNoteId(null)

  const deleteNote = (id: string) => {
    updateNote(id, '')
    setEditingNoteId(null)
  }

  const allSelected = annotations.length > 0 && selectedIds.size === annotations.length
  const someSelected = selectedIds.size > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(annotations.map((a) => a.id)))
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const handleExport = () => { const s = annotations.filter((a) => selectedIds.has(a.id)); if (s.length > 0) exportAnnotations(s, bookTitle) }

  const header = (
    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}`, flexShrink: 0, background: paperBg }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, letterSpacing: '0.01em', color: inkCol }}>我的註記</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>
            {annotations.length} 筆
          </div>
        </div>
        {annotations.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: ink3Col, cursor: 'pointer' }}>
              <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                style={{ accentColor: accentCol, cursor: 'pointer' }} />
              全選
            </label>
            <button
              disabled={selectedIds.size === 0}
              onClick={handleExport}
              style={{
                height: 26, padding: '0 10px', borderRadius: 6, fontSize: 12,
                background: selectedIds.size > 0 ? accentCol : 'transparent',
                color: selectedIds.size > 0 ? '#fff' : ink3Col,
                opacity: selectedIds.size > 0 ? 1 : 0.5,
                cursor: selectedIds.size > 0 ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              匯出{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const content = (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: paperBg }}>
      {annotations.length === 0 ? (
        <div style={{ padding: '28px 20px' }}>
          <div style={{ fontFamily: SERIF, fontSize: 15, color: ink2Col, marginBottom: 8 }}>尚無註記</div>
          <div style={{ fontSize: 13, color: ink3Col, lineHeight: 1.65 }}>選取文字後，便可劃線、加註，讓片段留下痕跡。</div>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {annotations.map((a: Annotation) => (
            <li key={a.id} style={{ borderBottom: `1px solid ${borderCol}` }}>
              <div
                style={{ padding: '14px 20px', cursor: 'pointer', transition: 'background .12s' }}
                onClick={() => { setPickerOpenId(null); onNavigate(a.cfi) }}
                onMouseEnter={(e) => (e.currentTarget.style.background = paperBg2)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: 3, flexShrink: 0, accentColor: accentCol, cursor: 'pointer' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: SERIF, fontSize: 14, lineHeight: 1.65, color: inkCol,
                      borderLeft: `3px solid ${a.color}`, paddingLeft: 10, marginBottom: 8,
                    }}>
                      {a.text}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.04em' }}>
                      <span>{a.chapter || ''}</span>
                      <span>{formatDate(a.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 2 }}>
                    <button
                      style={{ width: 14, height: 14, borderRadius: '50%', background: a.color, border: '1.5px solid rgba(0,0,0,0.12)', flexShrink: 0, cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setPickerOpenId(pickerOpenId === a.id ? null : a.id) }}
                      aria-label="更換顏色"
                    />
                    <button
                      style={{ width: 22, height: 22, borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pendingDeleteId === a.id ? '#ef4444' : ink3Col, background: pendingDeleteId === a.id ? 'rgba(239,68,68,0.08)' : 'transparent', cursor: 'pointer', transition: 'all .12s' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPickerOpenId(null)
                        setPendingDeleteId(pendingDeleteId === a.id ? null : a.id)
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = pendingDeleteId === a.id ? '#ef4444' : ink3Col; e.currentTarget.style.background = pendingDeleteId === a.id ? 'rgba(239,68,68,0.08)' : 'transparent' }}
                      aria-label="刪除此註記"
                    >✕</button>
                  </div>
                </div>
                {pickerOpenId === a.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingLeft: 24 }} onClick={(e) => e.stopPropagation()}>
                    {HIGHLIGHT_PALETTE.map((c) => (
                      <button
                        key={c.label}
                        style={{ width: 22, height: 22, borderRadius: '50%', background: c.value, border: `2px solid ${a.color === c.value ? inkCol : 'transparent'}`, cursor: 'pointer', transition: 'transform .1s' }}
                        onClick={() => { onChangeColor(a.id, c.value); setPickerOpenId(null) }}
                        aria-label={`${c.label}色`}
                      />
                    ))}
                  </div>
                )}
                {pendingDeleteId === a.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingLeft: 24 }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: '#ef4444', letterSpacing: '0.02em', flexShrink: 0 }}>確定刪除？</span>
                    <button
                      style={{ height: 22, padding: '0 8px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: ink3Col, background: darkMode ? '#2a2520' : '#ede8e0', cursor: 'pointer', transition: 'all .12s' }}
                      onClick={() => setPendingDeleteId(null)}
                    >取消</button>
                    <button
                      style={{ height: 22, padding: '0 8px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: '#fff', background: '#ef4444', cursor: 'pointer', transition: 'all .12s' }}
                      onClick={() => {
                        onRemoveAnnotation(a.id)
                        setSelectedIds((prev) => { const n = new Set(prev); n.delete(a.id); return n })
                        setPendingDeleteId(null)
                        setPickerOpenId(null)
                      }}
                    >刪除</button>
                  </div>
                )}
                {/* 感想筆記區塊 */}
                <div style={{ paddingLeft: 24, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  {editingNoteId === a.id ? (
                    <div>
                      <textarea
                        ref={noteTextareaRef}
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        placeholder="寫下你的感想…"
                        rows={3}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '7px 10px', borderRadius: 7,
                          border: `1px solid ${accentCol}`,
                          background: darkMode ? '#231f1b' : '#f4f0e8',
                          color: inkCol, fontFamily: SERIF, fontSize: 13,
                          lineHeight: 1.65, resize: 'vertical',
                          outline: 'none',
                        }}
                        onKeyDown={(e) => { if (e.key === 'Escape') cancelNote() }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                        <button
                          style={{ height: 24, padding: '0 10px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: '#fff', background: accentCol, cursor: 'pointer' }}
                          onClick={() => saveNote(a.id)}
                        >儲存</button>
                        <button
                          style={{ height: 24, padding: '0 10px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: ink3Col, background: darkMode ? '#2a2520' : '#ede8e0', cursor: 'pointer' }}
                          onClick={cancelNote}
                        >取消</button>
                        {a.note && (
                          <button
                            style={{ height: 24, padding: '0 10px', borderRadius: 5, fontFamily: MONO, fontSize: 11, color: '#ef4444', background: 'transparent', cursor: 'pointer' }}
                            onClick={() => deleteNote(a.id)}
                          >刪除筆記</button>
                        )}
                      </div>
                    </div>
                  ) : a.note ? (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{
                        flex: 1, fontFamily: SERIF, fontSize: 12.5, color: ink2Col,
                        lineHeight: 1.65, background: darkMode ? '#231f1b' : '#f4f0e8',
                        borderRadius: 7, padding: '6px 10px',
                        borderLeft: `3px solid ${darkMode ? '#5a5248' : '#c8bfad'}`,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {a.note}
                      </div>
                      <button
                        style={{ flexShrink: 0, marginTop: 4, width: 22, height: 22, borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink3Col, background: 'transparent', cursor: 'pointer' }}
                        onClick={() => startEditNote(a)}
                        aria-label="編輯筆記"
                      >✏︎</button>
                    </div>
                  ) : (
                    <button
                      style={{ fontFamily: MONO, fontSize: 11, color: ink3Col, background: 'transparent', cursor: 'pointer', letterSpacing: '0.04em', padding: '2px 0' }}
                      onClick={() => startEditNote(a)}
                    >＋ 新增感想</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  if (embedded) {
    return (
      <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: paperBg }}>
        {header}
        {content}
      </div>
    )
  }

  return (
    <div style={{
      width: 320, flexShrink: 0, height: '100%',
      borderLeft: `1px solid ${borderCol}`,
      background: paperBg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {header}
      {content}
    </div>
  )
}

export default NotePanel
