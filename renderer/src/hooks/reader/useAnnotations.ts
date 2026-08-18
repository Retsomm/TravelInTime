import { useCallback, useRef, useState } from 'react'
import { annotationService } from '@/services/annotationService'
import type { Annotation } from '@/services/annotationService'
import { DEBUG_ANNOTATIONS } from '@/constants/debug'

export type { Annotation }

// 取代原本 store/useAnnotationStore.ts（Zustand + 模組級 subscribe 自動持久化）。
// 這裡改成每個 Reader session 自己持有一份、依 bookId 綁定的 React state，持久化直接內建在
// 每個 mutation 函式裡（persist()），不再需要外部用 .subscribe() 側效應去監聽「任何一次 state
// 變動」再回頭存檔——原本那個 subscribe 模式必須小心處理呼叫順序（見舊版 useReaderEngine.ts
// 「先 unsub 再 clearAll，避免 clear 覆蓋 localStorage」的註解），這裡直接消除了整類排序陷阱。
//
// 不需要「bookId 變更時重新載入」的 effect：這個 hook 只在 Reader.tsx 被呼叫，而 App.tsx
// 換書時一定是先整個卸載 <Reader>（回書庫）才重新掛載下一本書的 <Reader>，同一個 hook
// instance 的 bookId 不會在掛載期間變動；真正「换書後套用新書資料」的時機是靠
// useReaderEngine.ts 在自己的開書流程裡明確呼叫 loadForBook()，不是靠這裡被動監聽 bookId。
//
// 每個回傳的函式都要用 useCallback 包起來維持穩定的參照：loadForBook/clearAll 會被
// useReaderEngine.ts 那個大 effect 放進 dependency array，舊版 Zustand store 的 action
// 函式本來就是穩定參照（store 建立時就固定了），這裡如果不手動穩定住，每次 render 都會
// 產生新的函式參照，讓那個 effect 誤判「依賴變了」而不斷 cleanup+重跑，
// 演變成 React 的 "Maximum update depth exceeded" 無限迴圈。
export const useAnnotations = (bookId: string) => {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => annotationService.local.load(bookId))
  // useReaderEngine.ts 的 relocated 事件處理器裡有一段「換頁/換章節後補畫缺漏 SVG 標記」的
  // 邏輯，需要在 setTimeout callback 裡讀到「當下最新」的註記清單，不能靠 React state
  // 的閉包（那個 setTimeout 註冊時捕捉到的 annotations 會是註冊當下那次 render 的值，
  // 使用者若在等待期間又翻頁加了新註記，讀到的會是舊資料）。這裡用 ref 在每次 mutation
  // 當下同步更新（不是靠外部 useEffect 監聽 annotations 變化再回頭同步，那樣會多一個
  // render+effect 週期的延遲，在使用者快速翻頁加註記時可能導致 ref 還沒更新到最新值）。
  const annotationsRef = useRef(annotations)

  const persist = useCallback((next: Annotation[]): boolean => {
    const ok = annotationService.local.save(bookId, next)
    if (DEBUG_ANNOTATIONS) console.log('[Annotation] persist', { bookId, ok, count: next.length, ids: next.map((a) => a.id) })
    if (ok) {
      annotationsRef.current = next
      setAnnotations(next)
    }
    return ok
  }, [bookId])

  // 提供給 useReaderEngine.ts 在開書當下明確載入這本書已存的註記，並直接回傳同一份陣列——
  // 呼叫端需要「設定完立刻同步讀回同一份資料」去初始化 epub.js SVG overlay，
  // React state 的更新是非同步的，不能靠 setState 後立刻讀 state 拿到最新值。
  // 不依賴 annotations，維持穩定參照。
  const loadForBook = useCallback((loaded: Annotation[]) => {
    if (DEBUG_ANNOTATIONS) console.log('[Annotation] loadForBook', { bookId, count: loaded.length, ids: loaded.map((a) => a.id) })
    annotationsRef.current = loaded
    setAnnotations(loaded)
  }, [bookId])

  const addAnnotation = useCallback((a: Omit<Annotation, 'id' | 'createdAt'>): { id: string; ok: boolean } => {
    const id = crypto.randomUUID()
    if (DEBUG_ANNOTATIONS) console.log('[Annotation] addAnnotation 呼叫', { id, cfi: a.cfi, refCount: annotationsRef.current.length })
    const ok = persist([...annotationsRef.current, { ...a, id, createdAt: Date.now() }])
    return { id, ok }
  }, [persist])

  const removeAnnotation = useCallback((id: string): boolean => {
    return persist(annotationsRef.current.filter((a) => a.id !== id))
  }, [persist])

  const updateColor = useCallback((id: string, color: string): boolean => {
    return persist(annotationsRef.current.map((a) => (a.id === id ? { ...a, color } : a)))
  }, [persist])

  const updateNote = useCallback((id: string, note: string): boolean => {
    return persist(annotationsRef.current.map((a) => (a.id === id ? { ...a, note: note.trim() || undefined } : a)))
  }, [persist])

  // 只清記憶體狀態、不觸發持久化，對應舊版 Zustand store 的 clearAll（離開/切換書本時呼叫，
  // 不是「使用者要求刪除全部註記」的操作，不該把空陣列寫回 localStorage）。不依賴
  // annotations，維持穩定參照。
  const clearAll = useCallback(() => {
    annotationsRef.current = []
    setAnnotations([])
  }, [])

  return { annotations, annotationsRef, loadForBook, addAnnotation, removeAnnotation, updateColor, updateNote, clearAll }
}
