// Service 層：註記（劃線＋筆記）的本機 CRUD，不 import React。
export interface Annotation {
  id: string
  cfi: string
  text: string
  color: string
  chapter: string
  createdAt: number
  updatedAt: number
  note?: string
}

const annotationsKey = (bookId: string) => `tit-annotations-${bookId}`

const isValidAnnotation = (value: unknown): value is Annotation => {
  if (!value || typeof value !== 'object') return false
  const a = value as Record<string, unknown>
  return typeof a.id === 'string' && typeof a.cfi === 'string' && typeof a.text === 'string'
    && typeof a.color === 'string' && typeof a.chapter === 'string'
    && typeof a.createdAt === 'number' && typeof a.updatedAt === 'number'
}

const local = {
  load: (bookId: string): Annotation[] => {
    try {
      const raw = localStorage.getItem(annotationsKey(bookId))
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) && parsed.every(isValidAnnotation) ? parsed : []
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
