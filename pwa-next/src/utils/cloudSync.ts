// 本機優先，登入後背景同步：所有寫入都已經先落地到 localStorage/IndexedDB（真正的資料來源），
// 這裡只是盡力而為地把同一份資料背景推去雲端資料庫。未登入（401）、離線、伺服器錯誤都靜默略過，
// 不重試、不拋錯、不阻塞呼叫端——雲端同步失敗不該影響本機閱讀/畫記的正常使用。

const push = (url: string, method: 'PUT' | 'DELETE', body?: unknown) => {
  fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {})
}

export const syncBook = (id: string, title: string, author: string, filename: string) => {
  push(`/api/books/${id}`, 'PUT', { title, author, filename })
}

export const syncRemoveBook = (id: string) => {
  push(`/api/books/${id}`, 'DELETE')
}

export const syncProgress = (bookId: string, cfi: string) => {
  push(`/api/books/${bookId}/progress`, 'PUT', { cfi })
}

export const syncBookmarks = (
  bookId: string,
  bookmarks: Array<{ id: string; cfi: string; label: string; addedAt: number }>,
) => {
  push(`/api/books/${bookId}/bookmarks`, 'PUT', { bookmarks })
}

export const syncAnnotations = (
  bookId: string,
  annotations: Array<{ id: string; cfi: string; text: string; note?: string; color: string; chapter: string; createdAt: number }>,
) => {
  push(`/api/books/${bookId}/annotations`, 'PUT', { annotations })
}
