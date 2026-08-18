'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { useLibrary } from '@/hooks/useLibrary'
import { bookService } from '@/services/bookService'
import { annotationService } from '@/services/annotationService'
import type { Annotation } from '@/services/annotationService'
import { IconArrowLeft, IconMoon, IconSun } from '@/components/Library/icons'
import { formatDate } from '@/utils/dateFormat'

interface NoteRow extends Annotation {
  bookId: string
  bookTitle: string
}

// 獨立的「我的筆記」列表：不用打開 Reader，直接把所有書的劃線原文 + 筆記列出來看。
// 讀本機資料（跟其他頁面一樣本機優先），書本 id 是這裡唯一需要拿到的 join key。
const Notes = () => {
  const { records, replaceRecords } = useLibrary()
  const { isSignedIn } = useUser()
  const [darkMode, setDarkMode] = useState(true)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // 把 dark class 同步到 <html>，讓 body 的 background-color 能跟著切換
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const [notes, setNotes] = useState<NoteRow[]>(() =>
    records
      .flatMap((book) =>
        annotationService.local.load(book.id).map((a) => ({ ...a, bookId: book.id, bookTitle: book.title })),
      )
      .sort((a, b) => b.createdAt - a.createdAt),
  )

  // 這個頁面是獨立路由，跟 App.tsx（書庫／閱讀器）是完全不同的元件樹、不共用 React state，
  // 使用者可能直接連到 /notes（沒有先經過首頁），所以不能依賴 App.tsx 那個「登入時觸發、
  // 一個分頁只跑一次」的整書庫還原——那個只在首頁掛載時才會跑。這裡背景自己重新拉一次
  // 書庫清單（可能有其他裝置新增、這台裝置還沒看過的書）跟每本書的註記，merge 完成後才
  // 更新畫面；離線或未登入時直接維持本機資料，不影響離線閱讀本機筆記的既有行為。
  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    void (async () => {
      const remoteBooks = await bookService.remote.fetchAll()
      if (cancelled || remoteBooks === null) return
      const mergedRecords = bookService.merge(bookService.local.listMeta(), remoteBooks)
      replaceRecords(mergedRecords)
      const lists = await Promise.all(
        mergedRecords.map((book) =>
          annotationService.restoreForBook(book.id).then((list) =>
            list.map((a) => ({ ...a, bookId: book.id, bookTitle: book.title })),
          ),
        ),
      )
      if (!cancelled) setNotes(lists.flat().sort((a, b) => b.createdAt - a.createdAt))
    })()
    return () => { cancelled = true }
  }, [isSignedIn, replaceRecords])

  const handleDelete = (bookId: string, id: string) => {
    const remaining = annotationService.local.load(bookId).filter((a) => a.id !== id)
    annotationService.local.save(bookId, remaining)
    annotationService.local.recordDeleted(bookId, id)
    annotationService.pushNow(bookId)
    setNotes((prev) => prev.filter((n) => n.id !== id))
    setPendingDeleteId(null)
  }

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
    <div className={`flex flex-col h-full bg-paper text-ink ${darkMode ? 'dark' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border pt-[max(env(safe-area-inset-top),12px)]">
        <Link href="/" className={`p-2 -ml-2 rounded-full transition text-ink-3`} aria-label="返回書庫">
          <IconArrowLeft />
        </Link>
        <div className="flex-1">
          <span className="font-ui-serif text-xl font-normal">我的筆記</span>
          <span className={`font-ui-mono text-[11px] tracking-[0.08em] ml-2 text-ink-3`}>
            {String(notes.length).padStart(2, '0')} NOTES
          </span>
        </div>
        <button className={`p-2 rounded-full transition text-ink-3`} onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? <IconSun /> : <IconMoon />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {notes.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full text-center text-ink-3`}>
            <p className="font-ui-serif text-base">尚無註記</p>
            <p className="text-[13px] mt-1.5">在書裡劃線並留下筆記，會出現在這裡</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([bookId, rows]) => (
            <div key={bookId} className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className={`font-ui-serif text-sm font-semibold text-ink-2`}>{rows[0].bookTitle}</span>
                <Link
                  href={`/?open=${rows[0].bookId}`}
                  className={`font-ui-mono text-[10px] tracking-[0.04em] text-ink-3`}
                >
                  開啟這本書 →
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {rows.map((n) => (
                  <div
                    key={n.id}
                    style={{ borderLeft: `3px solid ${n.color || 'var(--color-border)'}` }}
                    className="rounded-lg p-3 bg-paper-2"
                  >
                    <p className="font-ui-serif text-sm leading-[1.65] text-ink">
                      {n.text}
                    </p>
                    {n.note && (
                      <p className={`mt-2 font-ui-serif text-[12.5px] text-ink-2`}>
                        {n.note}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className={`font-ui-mono text-[10px] tracking-[0.04em] text-ink-3`}>
                        {n.chapter ? `${n.chapter} · ` : ''}{formatDate(n.createdAt)}
                      </span>
                      <span className="flex items-center gap-2.5">
                        <Link
                          href={`/?open=${n.bookId}&cfi=${encodeURIComponent(n.cfi)}`}
                          className="font-ui-mono text-[10px] tracking-[0.04em] text-ink-3"
                        >
                          跳至此處 →
                        </Link>
                        {pendingDeleteId === n.id ? (
                          <span className="flex items-center gap-1.5">
                            <span className="font-ui-mono text-[10px] text-red-500">確定刪除？</span>
                            <button
                              className="font-ui-mono text-[10px] text-red-500 py-0.5 px-1.5"
                              onClick={() => handleDelete(n.bookId, n.id)}
                            >
                              刪除
                            </button>
                            <button
                              className={`font-ui-mono text-[10px] py-0.5 px-1.5 text-ink-3`}
                              onClick={() => setPendingDeleteId(null)}
                            >
                              取消
                            </button>
                          </span>
                        ) : (
                          <button
                            className={`font-ui-mono text-[10px] tracking-[0.04em] text-ink-3`}
                            onClick={() => setPendingDeleteId(n.id)}
                          >
                            刪除
                          </button>
                        )}
                      </span>
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
