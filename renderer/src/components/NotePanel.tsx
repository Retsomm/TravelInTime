import { useRef, useState } from 'react'
import { useAnnotationStore } from '../store/useAnnotationStore'
import type { Annotation } from '../store/useAnnotationStore'

const COLORS = [
  { label: '黃', value: '#eab308' },
  { label: '綠', value: '#22c55e' },
  { label: '藍', value: '#3b82f6' },
  { label: '粉', value: '#ec4899' },
  { label: '橘', value: '#f97316' },
]

interface Props {
  onNavigate: (cfi: string) => void
  onChangeColor: (id: string, color: string) => void
  onRemoveAnnotation: (id: string) => void
  darkMode: boolean
  bookTitle: string
}

const formatDate = (ts: number) =>
  new Date(ts).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const exportAnnotations = (selected: Annotation[], bookTitle: string) => {
  const grouped = new Map<string, Annotation[]>()
  selected.forEach((a) => {
    const ch = a.chapter || '未分類'
    if (!grouped.has(ch)) grouped.set(ch, [])
    grouped.get(ch)!.push(a)
  })

  const lines: string[] = [
    '我的閱讀註記',
    `匯出時間：${new Date().toLocaleString('zh-TW')}`,
    `共 ${selected.length} 筆`,
    '',
  ]

  grouped.forEach((anns, chapter) => {
    lines.push('─'.repeat(28))
    lines.push(chapter)
    lines.push('─'.repeat(28))
    anns.forEach((a) => {
      lines.push(`• ${a.text}`)
      lines.push(`  ${formatDate(a.createdAt)}`)
      lines.push('')
    })
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const safeName = bookTitle.replace(/[\\/:*?"<>|]/g, '_') || '閱讀註記'
  link.download = `${safeName}_${dateStr}_${timeStr}.txt`
  link.click()
  URL.revokeObjectURL(url)
}

const NotePanel = ({ onNavigate, onChangeColor, onRemoveAnnotation, bookTitle }: Props) => {
  const { annotations } = useAnnotationStore()
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  const allSelected = annotations.length > 0 && selectedIds.size === annotations.length
  const someSelected = selectedIds.size > 0 && !allSelected

  // 更新全選 checkbox 的 indeterminate 狀態
  if (selectAllRef.current) {
    selectAllRef.current.indeterminate = someSelected
  }

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(annotations.map((a) => a.id)))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleExport = () => {
    const selected = annotations.filter((a) => selectedIds.has(a.id))
    if (selected.length === 0) return
    exportAnnotations(selected, bookTitle)
  }

  return (
    <div className="w-80 border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-gray-800 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-stone-700 dark:text-stone-200">我的註記</h2>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">共 {annotations.length} 筆</p>
          </div>
          {annotations.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 cursor-pointer select-none">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="accent-indigo-500 cursor-pointer"
                />
                全選
              </label>
              <button
                className={`px-2 py-1 rounded text-xs transition ${
                  selectedIds.size > 0
                    ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                    : 'bg-stone-100 dark:bg-stone-700 text-stone-400 dark:text-stone-500 cursor-not-allowed'
                }`}
                onClick={handleExport}
                disabled={selectedIds.size === 0}
              >
                匯出{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {annotations.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-500 p-4">
            選取文字後點擊顏色即可新增註記。
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-700">
            {annotations.map((a) => (
              <li key={a.id} className="group">
                <div
                  className="flex items-start gap-2 px-4 pt-3 pb-1 cursor-pointer hover:bg-stone-50 dark:hover:bg-gray-700/50 transition"
                  onClick={() => {
                    setPickerOpenId(null)
                    onNavigate(a.cfi)
                  }}
                >
                  {/* 勾選框 */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 shrink-0 accent-indigo-500 cursor-pointer"
                  />

                  {/* 顏色點 */}
                  <button
                    className="mt-1 shrink-0 w-3.5 h-3.5 rounded-full border border-black/10 hover:scale-125 transition-transform"
                    style={{ backgroundColor: a.color }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPickerOpenId(pickerOpenId === a.id ? null : a.id)
                    }}
                    aria-label="更換顏色"
                    title="點擊更換顏色"
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-700 dark:text-stone-200 leading-relaxed break-words line-clamp-3">
                      {a.text}
                    </p>
                    {a.chapter ? (
                      <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 truncate">
                        {a.chapter}
                      </p>
                    ) : null}
                  </div>

                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition text-stone-300 hover:text-red-400 dark:text-stone-600 dark:hover:text-red-400 text-xs ml-1 mt-0.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveAnnotation(a.id)
                      setSelectedIds((prev) => {
                        const next = new Set(prev)
                        next.delete(a.id)
                        return next
                      })
                      if (pickerOpenId === a.id) setPickerOpenId(null)
                    }}
                    aria-label="刪除此註記"
                  >
                    ✕
                  </button>
                </div>

                {/* 換色面板 */}
                {pickerOpenId === a.id && (
                  <div className="flex gap-1.5 px-4 pb-2" onClick={(e) => e.stopPropagation()}>
                    {COLORS.map((c) => (
                      <button
                        key={c.label}
                        className="w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform"
                        style={{
                          backgroundColor: c.value,
                          borderColor: a.color === c.value ? '#6366f1' : 'transparent',
                        }}
                        onClick={() => {
                          onChangeColor(a.id, c.value)
                          setPickerOpenId(null)
                        }}
                        aria-label={`${c.label}色`}
                        title={c.label}
                      />
                    ))}
                  </div>
                )}

                <p className="px-4 pb-2 text-xs text-stone-300 dark:text-stone-600">
                  {formatDate(a.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default NotePanel
