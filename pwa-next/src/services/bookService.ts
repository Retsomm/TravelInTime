// Service 層：書本 metadata 的本機（localStorage/IndexedDB）/ 遠端 CRUD + merge。
// hooks/useLibrary.ts 的 addBook 三分支邏輯（新書／重複匯入／檔案遺失復原）刻意沒有搬過來——
// 那段邏輯累積了不少隱含的呼叫順序依賴，這裡只抽換它呼叫的最底層 storage/network 函式，
// 不重寫控制流程本身，降低這輪重構的風險。
import { META_KEY } from '@/constants/storageKeys'
import { idbGet, idbPut, idbDelete } from '@/utils/indexedDb'
import { apiClient } from '@/clients/apiClient'
import { enqueue } from './syncQueue'
import { getSyncEnabled } from './syncGate'

export interface BookRecord {
  id: string
  title: string
  author: string
  filename: string
  addedAt: number
  lastOpenedAt: number
  hasCover: boolean
  progress?: number
}

const local = {
  listMeta: (): BookRecord[] => {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) ?? '[]')
    } catch {
      return []
    }
  },
  saveMeta: (records: BookRecord[]) => localStorage.setItem(META_KEY, JSON.stringify(records)),
  getFile: (id: string) => idbGet<ArrayBuffer>('files', id),
  putFile: (id: string, buffer: ArrayBuffer) => idbPut('files', id, buffer),
  deleteFile: (id: string) => idbDelete('files', id),
  getCover: (id: string) => idbGet<string>('covers', id),
  putCover: (id: string, dataUrl: string) => idbPut('covers', id, dataUrl),
  deleteCover: (id: string) => idbDelete('covers', id),
  // 用檔案內容算 SHA-256，確保同一本書不管在哪裝置、匯入幾次都算出同一個 id，
  // 這樣重新匯入後才能跟雲端資料庫裡的舊進度/書籤/註記接回去。
  hashFileContent: async (buffer: ArrayBuffer): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  },
}

interface RemoteBook {
  id: string
  title: string
  author: string
  filename: string
  addedAt: string
  updatedAt: string
}

const remote = {
  fetchAll: (): Promise<RemoteBook[] | null> =>
    apiClient
      .get<{ books: RemoteBook[] }>('/api/books')
      .then((res) => res.books)
      .catch(() => null),

  syncBook: (id: string, title: string, author: string, filename: string): Promise<boolean> => {
    if (!getSyncEnabled()) return Promise.resolve(false)
    return enqueue(id, () =>
      apiClient.put(`/api/books/${id}`, { title, author, filename }).then(() => true).catch(() => false),
    )
  },

  syncRemoveBook: (id: string): Promise<boolean> => {
    if (!getSyncEnabled()) return Promise.resolve(false)
    return enqueue(id, () => apiClient.delete(`/api/books/${id}`).then(() => true).catch(() => false))
  },
}

// 本機是 source of truth，遠端只用來補上「這台裝置從來沒看過」的書（在另一台裝置匯入過）。
// 兩邊都有的書一律保留本機那份 metadata 不覆蓋——本機沒有可靠的「metadata 上次修改時間」
// 可以拿來跟雲端的 updatedAt 比較，且書名/作者匯入後幾乎不會再變動，沒有必要為了這麼低風險
// 的欄位去猜測孰新孰舊。遠端獨有的書併入本機清單時檔案本體是空的（epub 二進位從不上雲端），
// 會呈現「缺檔」狀態，沿用既有的 MissingBookModal 重新匯入流程讓使用者補齊檔案。
const merge = (localRecords: BookRecord[], remoteBooks: RemoteBook[]): BookRecord[] => {
  const knownIds = new Set(localRecords.map((r) => r.id))
  const remoteOnly: BookRecord[] = remoteBooks
    .filter((b) => !knownIds.has(b.id))
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      filename: b.filename,
      addedAt: new Date(b.addedAt).getTime(),
      lastOpenedAt: 0,
      hasCover: false,
    }))
  return [...localRecords, ...remoteOnly]
}

export const bookService = { local, remote, merge }
