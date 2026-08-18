// Service 層：書籤的本機 CRUD，不 import React。
import { bookmarksKey } from '@/constants/storageKeys'

export interface Bookmark {
  id: string
  cfi: string
  label: string
  addedAt: number
}

const local = {
  load: (bookId: string): Bookmark[] => {
    try {
      const raw = localStorage.getItem(bookmarksKey(bookId))
      return raw ? (JSON.parse(raw) as Bookmark[]) : []
    } catch {
      return []
    }
  },
  save: (bookId: string, bookmarks: Bookmark[]): boolean => {
    try {
      localStorage.setItem(bookmarksKey(bookId), JSON.stringify(bookmarks))
      return true
    } catch {
      return false
    }
  },
}

export const bookmarkService = { local }
