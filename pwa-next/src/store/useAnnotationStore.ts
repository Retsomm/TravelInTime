import { create } from 'zustand'
import { syncAnnotations } from '@/utils/cloudSync'

export interface Annotation {
  id: string
  cfi: string
  text: string
  color: string
  chapter: string
  createdAt: number
  note?: string
}

interface AnnotationStore {
  annotations: Annotation[]
  loadForBook: (annotations: Annotation[]) => void
  addAnnotation: (a: Omit<Annotation, 'id' | 'createdAt'>) => string
  removeAnnotation: (id: string) => void
  updateColor: (id: string, color: string) => void
  updateNote: (id: string, note: string) => void
  clearAll: () => void
}

const annotationsKey = (bookId: string) => `tit-annotations-${bookId}`

export const loadAnnotationsForBook = (bookId: string): Annotation[] => {
  try { return JSON.parse(localStorage.getItem(annotationsKey(bookId)) ?? '[]') }
  catch { return [] }
}

export const saveAnnotationsForBook = (bookId: string, annotations: Annotation[]) => {
  localStorage.setItem(annotationsKey(bookId), JSON.stringify(annotations))
  syncAnnotations(bookId, annotations)
}

export const useAnnotationStore = create<AnnotationStore>((set) => ({
  annotations: [],
  loadForBook: (annotations) => set({ annotations }),
  addAnnotation: (a) => {
    const id = crypto.randomUUID()
    set((state) => ({
      annotations: [
        ...state.annotations,
        { ...a, id, createdAt: Date.now() },
      ],
    }))
    return id
  },
  removeAnnotation: (id) =>
    set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) })),
  updateColor: (id, color) =>
    set((state) => ({
      annotations: state.annotations.map((a) => (a.id === id ? { ...a, color } : a)),
    })),
  updateNote: (id, note) =>
    set((state) => ({
      annotations: state.annotations.map((a) => (a.id === id ? { ...a, note: note.trim() || undefined } : a)),
    })),
  clearAll: () => set({ annotations: [] }),
}))
