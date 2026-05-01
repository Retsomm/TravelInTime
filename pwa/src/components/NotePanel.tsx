import { useRef, useState, useEffect } from 'react'
import { useAnnotationStore } from '@/store/useAnnotationStore'
import type { Annotation } from '@/store/useAnnotationStore'

const SERIF = '"Source Serif 4", "Noto Serif TC", Georgia, serif'
const MONO  = '"JetBrains Mono", ui-monospace, monospace'

const COLORS = [
  { label: '黃', value: '#eab308' },
  { label: '綠', value: '#22c55e' },
  { label: '藍', value: '#3b82f6' },
  { label: '粉', value: '#f9b9d7' },
  { label: '橘', value: '#f97316' },
]

interface Props {
  onNavigate: (cfi: string) => void
  onChangeColor: (id: string, color: string) => void
  onRemoveAnnotation: (id: string) => void
  darkMode: boolean
  bookTitle: string
  embedded?: boolean
}

const formatDate = (ts: number) =>
  new Date(ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const exportAnnotations = (selected: Annotation[], bookTitle: string) => {
  const sorted = [...selected].sort((a, b) => a.createdAt - b.createdAt)
  const grouped = new Map<string, Annotation[]>()
  sorted.forEach((a) => {
    const ch = a.chapter || '未分類'
    if (!grouped.has(ch)) grouped.set(ch, [])
    grouped.get(ch)!.push(a)
  })
  const lines: string[] = ['我的閱讀註記', `匯出時間：${new Date().toLocaleString('zh-TW')}`, `共 ${selected.length} 筆`, '']
  grouped.forEach((anns, chapter) => {
    lines.push(chapter)
    anns.forEach((a) => { lines.push(`• ${a.text}`); lines.push('') })
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  link.download = `${(bookTitle || '閱讀註記').replace(/[\\/:*?"<>|]/g, '_')}_${dateStr}_${timeStr}.txt`
  link.click()
  URL.revokeObjectURL(url)
}

const NotePanel = ({ onNavigate, onChangeColor, onRemoveAnnotation, darkMode, bookTitle, embedded }: Props) => {
  const { annotations } = useAnnotationStore()
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  const allSelected = annotations.length > 0 && selectedIds.size === annotations.length
  const someSelected = selectedIds.size > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(annotations.map((a) => a.id)))
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const handleExport = () => { const s = annotations.filter((a) => selectedIds.has(a.id)); if (s.length > 0) exportAnnotations(s, bookTitle) }

  const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2  = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
  const ink2Col   = darkMode ? '#b8afa4' : '#5a4e44'
  const ink3Col   = darkMode ? '#7a706a' : '#9a8f80'
  const accentCol = 'oklch(0.62 0.14 40)'

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
          {annotations.map((a) => (
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
                    {COLORS.map((c) => (
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
