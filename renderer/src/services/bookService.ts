// Service 層：書本 metadata 的本機（localStorage/IndexedDB）CRUD。
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
  saveMeta: (records: BookRecord[]): boolean => {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(records))
      return true
    } catch {
      return false
    }
  },
  getFile: (id: string) => idbGet<ArrayBuffer>('files', id),
  putFile: (id: string, buffer: ArrayBuffer) => idbPut('files', id, buffer),
  deleteFile: (id: string) => idbDelete('files', id),
  getCover: (id: string) => idbGet<string>('covers', id),
  putCover: (id: string, dataUrl: string) => idbPut('covers', id, dataUrl),
  deleteCover: (id: string) => idbDelete('covers', id),
}

export const bookService = { local }
