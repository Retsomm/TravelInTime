import { useRef, useState, useEffect } from 'react'
import { useAnnotationStore } from '@/store/useAnnotationStore'
import type { Annotation } from '@/store/useAnnotationStore'
import { HIGHLIGHT_PALETTE } from '@/constants/highlightColors'
import { exportAnnotations } from '@/utils/annotationExport'
import { formatDate } from '@/utils/dateFormat'

interface Props {
  onNavigate: (cfi: string) => void
  onChangeColor: (id: string, color: string) => void
  onRemoveAnnotation: (id: string) => void
  bookTitle: string
  embedded?: boolean
}

const NotePanel = ({ onNavigate, onChangeColor, onRemoveAnnotation, bookTitle, embedded }: Props) => {
  const { annotations, updateNote } = useAnnotationStore()
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)

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
    <div className="px-5 py-4 border-b border-border shrink-0 bg-paper">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-ui-serif text-[17px] font-medium tracking-[0.01em] text-ink">我的註記</div>
          <div className="font-ui-mono text-[10px] text-ink-3 tracking-[0.12em] uppercase mt-1">
            {annotations.length} 筆
          </div>
        </div>
        {annotations.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="flex items-center gap-1.25 text-xs text-ink-3 cursor-pointer">
              <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                className="accent-accent cursor-pointer" />
              全選
            </label>
            <button
              disabled={selectedIds.size === 0}
              onClick={handleExport}
              className={`h-6.5 px-2.5 rounded-md text-xs font-[inherit] ${
                selectedIds.size > 0 ? 'bg-accent text-white cursor-pointer opacity-100' : 'bg-transparent text-ink-3 cursor-default opacity-50'
              }`}
            >
              匯出{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const content = (
    <div className="flex-1 overflow-y-auto min-h-0 bg-paper">
      {annotations.length === 0 ? (
        <div className="py-7 px-5">
          <div className="font-ui-serif text-[15px] text-ink-2 mb-2">尚無註記</div>
          <div className="text-[13px] text-ink-3 leading-[1.65]">選取文字後，便可劃線、加註，讓片段留下痕跡。</div>
        </div>
      ) : (
        <ul className="list-none m-0 p-0">
          {annotations.map((a: Annotation) => (
            <li key={a.id} className="border-b border-border">
              <div
                className="py-3.5 px-5 cursor-pointer transition-colors duration-120 hover:bg-paper-2"
                onClick={() => { setPickerOpenId(null); onNavigate(a.cfi) }}
              >
                <div className="flex items-start gap-2.5">
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.75 shrink-0 accent-accent cursor-pointer" />
                  <div className="flex-1 min-w-0">
                    <div
                      style={{ borderLeft: `3px solid ${a.color}` }}
                      className="font-ui-serif text-sm leading-[1.65] text-ink pl-2.5 mb-2"
                    >
                      {a.text}
                    </div>
                    <div className="flex items-center justify-between font-ui-mono text-[10px] text-ink-3 tracking-[0.04em]">
                      <span>{a.chapter || ''}</span>
                      <span>{formatDate(a.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button
                      style={{ background: a.color }}
                      className="w-3.5 h-3.5 rounded-full border-[1.5px] border-black/12 shrink-0 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setPickerOpenId(pickerOpenId === a.id ? null : a.id) }}
                      aria-label="更換顏色"
                    />
                    <button
                      className={`w-5.5 h-5.5 rounded-md text-[11px] flex items-center justify-center cursor-pointer transition-all duration-120 hover:text-red-500 hover:bg-red-500/8 ${
                        pendingDeleteId === a.id ? 'text-red-500 bg-red-500/8' : 'text-ink-3 bg-transparent'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPickerOpenId(null)
                        setPendingDeleteId(pendingDeleteId === a.id ? null : a.id)
                      }}
                      aria-label="刪除此註記"
                    >✕</button>
                  </div>
                </div>
                {pickerOpenId === a.id && (
                  <div className="flex gap-2 mt-2.5 pl-6" onClick={(e) => e.stopPropagation()}>
                    {HIGHLIGHT_PALETTE.map((c) => (
                      <button
                        key={c.label}
                        style={{ background: c.value }}
                        className={`w-5.5 h-5.5 rounded-full border-2 cursor-pointer transition-transform duration-100 ${a.color === c.value ? 'border-ink' : 'border-transparent'}`}
                        onClick={() => { onChangeColor(a.id, c.value); setPickerOpenId(null) }}
                        aria-label={`${c.label}色`}
                      />
                    ))}
                  </div>
                )}
                {pendingDeleteId === a.id && (
                  <div className="flex items-center gap-2 mt-2.5 pl-6" onClick={(e) => e.stopPropagation()}>
                    <span className="font-ui-mono text-[11px] text-red-500 tracking-[0.02em] shrink-0">確定刪除？</span>
                    <button
                      className="h-5.5 px-2 rounded-[5px] font-ui-mono text-[11px] text-ink-3 bg-[#ede8e0] dark:bg-[#2a2520] cursor-pointer transition-all duration-120"
                      onClick={() => setPendingDeleteId(null)}
                    >取消</button>
                    <button
                      className="h-5.5 px-2 rounded-[5px] font-ui-mono text-[11px] text-white bg-red-500 cursor-pointer transition-all duration-120"
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
                <div className="pl-6 mt-2" onClick={(e) => e.stopPropagation()}>
                  {editingNoteId === a.id ? (
                    <div>
                      <textarea
                        ref={noteTextareaRef}
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        placeholder="寫下你的感想…"
                        rows={3}
                        className="w-full box-border py-1.75 px-2.5 rounded-[7px] border border-accent bg-[#f4f0e8] dark:bg-[#231f1b] text-ink font-ui-serif text-[13px] leading-[1.65] resize-y outline-none"
                        onKeyDown={(e) => { if (e.key === 'Escape') cancelNote() }}
                      />
                      <div className="flex gap-1.5 mt-1.25">
                        <button
                          className="h-6 px-2.5 rounded-[5px] font-ui-mono text-[11px] text-white bg-accent cursor-pointer"
                          onClick={() => saveNote(a.id)}
                        >儲存</button>
                        <button
                          className="h-6 px-2.5 rounded-[5px] font-ui-mono text-[11px] text-ink-3 bg-[#ede8e0] dark:bg-[#2a2520] cursor-pointer"
                          onClick={cancelNote}
                        >取消</button>
                        {a.note && (
                          <button
                            className="h-6 px-2.5 rounded-[5px] font-ui-mono text-[11px] text-red-500 bg-transparent cursor-pointer"
                            onClick={() => deleteNote(a.id)}
                          >刪除筆記</button>
                        )}
                      </div>
                    </div>
                  ) : a.note ? (
                    <div className="flex items-start gap-1.5">
                      <div className="flex-1 font-ui-serif text-[12.5px] text-ink-2 leading-[1.65] bg-[#f4f0e8] dark:bg-[#231f1b] rounded-[7px] py-1.5 px-2.5 border-l-[3px] border-l-[#c8bfad] dark:border-l-[#5a5248] whitespace-pre-wrap wrap-break-word">
                        {a.note}
                      </div>
                      <button
                        className="shrink-0 mt-1 w-5.5 h-5.5 rounded-md text-[11px] flex items-center justify-center text-ink-3 bg-transparent cursor-pointer"
                        onClick={() => startEditNote(a)}
                        aria-label="編輯筆記"
                      >✏︎</button>
                    </div>
                  ) : (
                    <button
                      className="font-ui-mono text-[11px] text-ink-3 bg-transparent cursor-pointer tracking-[0.04em] py-0.5"
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
      <div className="h-full min-h-0 flex flex-col bg-paper">
        {header}
        {content}
      </div>
    )
  }

  return (
    <div className="w-80 shrink-0 h-full border-l border-border bg-paper flex flex-col overflow-hidden">
      {header}
      {content}
    </div>
  )
}

export default NotePanel
