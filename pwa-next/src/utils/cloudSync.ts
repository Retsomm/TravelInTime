// 本機優先，登入後背景同步：所有寫入都已經先落地到 localStorage/IndexedDB（真正的資料來源），
// 這裡只是盡力而為地把同一份資料背景推去雲端資料庫。離線、伺服器錯誤都靜默略過，
// 不重試、不拋錯、不阻塞呼叫端——雲端同步失敗不該影響本機閱讀/畫記的正常使用。
//
// 未登入時完全不會發出這些請求（見 setSyncEnabled），不是「發出去再讓伺服器用 401 擋掉」。
// saveProgress/saveBookmarks/saveAnnotationsForBook 這些呼叫點都在一般模組裡，不是 React
// component，拿不到 Clerk 的 useUser()，所以由 App.tsx（唯一持續掛載、能拿到登入狀態的地方）
// 用這個模組層級的開關同步登入狀態。
//
// 每個函式都回傳 Promise<boolean>（settle 就好，網路錯誤一樣吞掉變成 false），大部分呼叫端
// 不需要 await、當成 fire-and-forget 用；但 App.tsx 的登入補推邏輯需要先 await syncBook 完成
// 且確認成功，才能接著推該書的進度/書籤/註記——不然兩個請求幾乎同時送出，進度/書籤/註記
// 可能在雲端資料庫還沒有這本書的列之前就先抵達，會撞外鍵違反錯誤（跟先前那個「匯入書本
// 先於接上同步」的 bug 是同一個根因，只是這次是請求送出順序的競速，不是程式碼邏輯漏掉呼叫）。

let syncEnabled = false

export const setSyncEnabled = (enabled: boolean) => {
  syncEnabled = enabled
}

// 回傳這次請求是否成功（HTTP ok），呼叫端可以據此決定要不要繼續依賴這筆寫入的後續操作
// （例如 Book 沒寫成功就不該接著送外鍵依賴它的 progress/bookmarks/annotations）。
// 失敗仍然不重試、不拋錯——只是把「成功與否」誠實回報給呼叫端自行判斷，語意跟原本一致。
const push = (url: string, method: 'PUT' | 'DELETE', body?: unknown): Promise<boolean> => {
  if (!syncEnabled) return Promise.resolve(false)
  return fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
    .then((res) => res.ok)
    .catch(() => false)
}

// bookmarks/annotations 是「整份清單覆蓋」的寫入，同一本書快速連續異動（例如連續刪除多筆）
// 會送出多個 PUT，若同時在飛可能因回應順序顛倒讓舊快照蓋掉新快照。這裡依 bookId+resource
// 建一條隊列，確保同一把 key 的請求嚴格照呼叫順序、一個接一個送出，回應順序就不會顛倒。
const queues = new Map<string, Promise<boolean>>()

const enqueue = (key: string, task: () => Promise<boolean>): Promise<boolean> => {
  const next = (queues.get(key) ?? Promise.resolve(true)).then(task)
  queues.set(key, next)
  return next
}

export const syncBook = (id: string, title: string, author: string, filename: string): Promise<boolean> =>
  push(`/api/books/${id}`, 'PUT', { title, author, filename })

export const syncRemoveBook = (id: string): Promise<boolean> => push(`/api/books/${id}`, 'DELETE')

export const syncProgress = (bookId: string, cfi: string): Promise<boolean> =>
  enqueue(`${bookId}:progress`, () => push(`/api/books/${bookId}/progress`, 'PUT', { cfi }))

export const syncBookmarks = (
  bookId: string,
  bookmarks: Array<{ id: string; cfi: string; label: string; addedAt: number }>,
): Promise<boolean> =>
  enqueue(`${bookId}:bookmarks`, () => push(`/api/books/${bookId}/bookmarks`, 'PUT', { bookmarks }))

export const syncAnnotations = (
  bookId: string,
  annotations: Array<{ id: string; cfi: string; text: string; note?: string; color: string; chapter: string; createdAt: number }>,
): Promise<boolean> =>
  enqueue(`${bookId}:annotations`, () => push(`/api/books/${bookId}/annotations`, 'PUT', { annotations }))
