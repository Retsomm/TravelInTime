import type { Annotation } from '@/hooks/reader/useAnnotations'

export const exportAnnotations = (selected: Annotation[], bookTitle: string) => {
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
    anns.forEach((a) => {
      lines.push(`• ${a.text}`)
      if (a.note) lines.push(`  筆記：${a.note}`)
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
  link.download = `${(bookTitle || '閱讀註記').replace(/[\\/:*?"<>|]/g, '_')}_${dateStr}_${timeStr}.txt`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
