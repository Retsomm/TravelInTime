// 本機優先，登入後背景同步：所有寫入都已經先落地到 localStorage/IndexedDB（真正的資料來源），
// 這裡只是盡力而為地把同一份資料背景推去雲端資料庫。離線、伺服器錯誤都靜默略過，
// 不重試、不拋錯、不阻塞呼叫端——雲端同步失敗不該影響本機閱讀/畫記的正常使用。
//
// 未登入時完全不會發出這些請求（見 setSyncEnabled），不是「發出去再讓伺服器用 401 擋掉」。
// saveProgress/saveBookmarks/saveAnnotationsForBook 這些呼叫點都在一般模組裡，不是 React
// component，拿不到 Clerk 的 useUser()，所以由 App.tsx（唯一持續掛載、能拿到登入狀態的地方）
// 用這個模組層級的開關同步登入狀態。
//
// 每個函式都回傳 Promise<void>（settle 就好，成功/失敗都吞掉），大部分呼叫端不需要 await、
// 當成 fire-and-forget 用；但 App.tsx 的登入補推邏輯需要先 await syncBook 完成，才能接著推
// 該書的進度/書籤/註記——不然兩個請求幾乎同時送出，進度/書籤/註記可能在雲端資料庫還沒有
// 這本書的列之前就先抵達，會撞外鍵違反錯誤（跟先前那個「匯入書本先於接上同步」的 bug 是
// 同一個根因，只是這次是請求送出順序的競速，不是程式碼邏輯漏掉呼叫）。

let syncEnabled = false

export const setSyncEnabled = (enabled: boolean) => {
  syncEnabled = enabled
}

const push = (url: string, method: 'PUT' | 'DELETE', body?: unknown): Promise<void> => {
  if (!syncEnabled) return Promise.resolve()
  return fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
    .then(() => undefined)
    .catch(() => undefined)
}

export const syncBook = (id: string, title: string, author: string, filename: string): Promise<void> =>
  push(`/api/books/${id}`, 'PUT', { title, author, filename })

export const syncRemoveBook = (id: string): Promise<void> => push(`/api/books/${id}`, 'DELETE')

export const syncProgress = (bookId: string, cfi: string): Promise<void> =>
  push(`/api/books/${bookId}/progress`, 'PUT', { cfi })

export const syncBookmarks = (
  bookId: string,
  bookmarks: Array<{ id: string; cfi: string; label: string; addedAt: number }>,
): Promise<void> => push(`/api/books/${bookId}/bookmarks`, 'PUT', { bookmarks })

export const syncAnnotations = (
  bookId: string,
  annotations: Array<{ id: string; cfi: string; text: string; note?: string; color: string; chapter: string; createdAt: number }>,
): Promise<void> => push(`/api/books/${bookId}/annotations`, 'PUT', { annotations })
