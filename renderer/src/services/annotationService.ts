// Service 層：註記（劃線＋筆記）的本機 CRUD，不 import React。
export interface Annotation {
  id: string
  cfi: string
  text: string
  color: string
  chapter: string
  createdAt: number
  note?: string
}

const annotationsKey = (bookId: string) => `tit-annotations-${bookId}`

const local = {
  load: (bookId: string): Annotation[] => {
    try {
      return JSON.parse(localStorage.getItem(annotationsKey(bookId)) ?? '[]')
    } catch {
      return []
    }
  },
  save: (bookId: string, annotations: Annotation[]): boolean => {
    try {
      localStorage.setItem(annotationsKey(bookId), JSON.stringify(annotations))
      return true
    } catch {
      return false
    }
  },
}

export const annotationService = { local }
