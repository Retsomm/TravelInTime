// Service 層：純函式，本機閱讀進度存取，不 import React。
import { progressKey } from '@/constants/storageKeys'

export interface Progress {
  bookId: string
  cfi: string
}

const local = {
  load: (bookId: string): Progress | null => {
    const cfi = localStorage.getItem(progressKey(bookId))
    return cfi === null ? null : { bookId, cfi }
  },
  save: (bookId: string, cfi: string): Progress => {
    localStorage.setItem(progressKey(bookId), cfi)
    return { bookId, cfi }
  },
}

export const progressService = { local }
