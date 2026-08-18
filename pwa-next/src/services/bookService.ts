// Service 層：書本 metadata 的本機（localStorage/IndexedDB）CRUD。
// hooks/useLibrary.ts 的 addBook 三分支邏輯（新書／重複匯入／檔案遺失復原）刻意沒有搬過來——
// 那段邏輯累積了不少隱含的呼叫順序依賴，這裡只抽換它呼叫的最底層 storage 函式，
// 不重寫控制流程本身，降低這輪重構的風險。
import { META_KEY } from '@/constants/storageKeys'
import { idbGet, idbPut, idbDelete } from '@/utils/indexedDb'

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
  // 用檔案內容算 SHA-256，確保同一本書不管匯入幾次都算出同一個 id，
  // 讓重新匯入後能跟本機既有的舊進度/書籤/註記接回去。
  hashFileContent: async (buffer: ArrayBuffer): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  },
}

export const bookService = { local }
