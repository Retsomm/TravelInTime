'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLibrary } from '@/hooks/useLibrary'
import { loadAnnotationsForBook, saveAnnotationsForBook } from '@/store/useAnnotationStore'
import type { Annotation } from '@/store/useAnnotationStore'
import { IconArrowLeft, IconMoon, IconSun } from '@/components/Library/icons'
import { MONO, SERIF } from '@/components/Library/coverStyles'
import { formatDate } from '@/utils/dateFormat'

interface NoteRow extends Annotation {
  bookId: string
  bookTitle: string
}

// 獨立的「我的筆記」列表：不用打開 Reader，直接把所有書的劃線原文 + 筆記列出來看。
// 讀本機資料（跟其他頁面一樣本機優先），書本 id 是這裡唯一需要拿到的 join key。
const Notes = () => {
  const { records } = useLibrary()
  const [darkMode, setDarkMode] = useState(true)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const [notes, setNotes] = useState<NoteRow[]>(() =>
    records
      .flatMap((book) =>
        loadAnnotationsForBook(book.id).map((a) => ({ ...a, bookId: book.id, bookTitle: book.title })),
      )
      .sort((a, b) => b.createdAt - a.createdAt),
  )

  const handleDelete = (bookId: string, id: string) => {
    const remaining = loadAnnotationsForBook(bookId).filter((a) => a.id !== id)
    saveAnnotationsForBook(bookId, remaining)
    setNotes((prev) => prev.filter((n) => n.id !== id))
    setPendingDeleteId(null)
  }

  const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2  = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
  const ink2Col   = darkMode ? '#c9bfae' : '#5a5044'
  const ink3Col   = darkMode ? '#8a7f74' : '#9a8f80'

  const grouped = useMemo(() => {
    const byBook = new Map<string, NoteRow[]>()
    for (const n of notes) {
      const list = byBook.get(n.bookId) ?? []
      list.push(n)
      byBook.set(n.bookId, list)
    }
    return byBook
  }, [notes])

  return (
    <div className="flex flex-col h-full" style={{ background: paperBg, color: inkCol }}>
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: `1px solid ${borderCol}`, paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <Link href="/" className="p-2 -ml-2 rounded-full transition" style={{ color: ink3Col }} aria-label="返回書庫">
          <IconArrowLeft />
        </Link>
        <div className="flex-1">
          <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400 }}>我的筆記</span>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', marginLeft: 8, color: ink3Col }}>
            {String(notes.length).padStart(2, '0')} NOTES
          </span>
        </div>
        <button className="p-2 rounded-full transition" style={{ color: ink3Col }} onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? <IconSun /> : <IconMoon />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ color: ink3Col }}>
            <p style={{ fontFamily: SERIF, fontSize: 16 }}>尚無註記</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>在書裡劃線並留下筆記，會出現在這裡</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([bookId, rows]) => (
            <div key={bookId} className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: ink2Col }}>{rows[0].bookTitle}</span>
                <Link
                  href={`/?open=${rows[0].bookId}`}
                  style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em', color: ink3Col }}
                >
                  開啟這本書 →
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {rows.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg p-3"
                    style={{ background: paperBg2, borderLeft: `3px solid ${n.color || borderCol}` }}
                  >
                    <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.65, color: inkCol }}>
                      {n.text}
                    </p>
                    {n.note && (
                      <p className="mt-2" style={{ fontFamily: SERIF, fontSize: 12.5, color: ink2Col }}>
                        {n.note}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.04em' }}>
                        {n.chapter ? `${n.chapter} · ` : ''}{formatDate(n.createdAt)}
                      </span>
                      {pendingDeleteId === n.id ? (
                        <span className="flex items-center gap-1.5">
                          <span style={{ fontFamily: MONO, fontSize: 10, color: '#ef4444' }}>確定刪除？</span>
                          <button
                            style={{ fontFamily: MONO, fontSize: 10, color: '#ef4444', padding: '2px 6px' }}
                            onClick={() => handleDelete(n.bookId, n.id)}
                          >
                            刪除
                          </button>
                          <button
                            style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, padding: '2px 6px' }}
                            onClick={() => setPendingDeleteId(null)}
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <button
                          style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.04em' }}
                          onClick={() => setPendingDeleteId(n.id)}
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Notes
