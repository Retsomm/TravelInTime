import { create } from 'zustand'

export interface Annotation {
  id: string
  cfi: string
  text: string
  color: string
  chapter: string
  createdAt: number
}

interface AnnotationStore {
  annotations: Annotation[]
  loadForBook: (annotations: Annotation[]) => void
  addAnnotation: (a: Omit<Annotation, 'id' | 'createdAt'>) => void
  removeAnnotation: (id: string) => void
  updateColor: (id: string, color: string) => void
  clearAll: () => void
}

const annotationsKey = (bookId: string) => `tit-annotations-${bookId}`

export const loadAnnotationsForBook = (bookId: string): Annotation[] => {
  try { return JSON.parse(localStorage.getItem(annotationsKey(bookId)) ?? '[]') }
  catch { return [] }
}

export const saveAnnotationsForBook = (bookId: string, annotations: Annotation[]) =>
  localStorage.setItem(annotationsKey(bookId), JSON.stringify(annotations))

export const useAnnotationStore = create<AnnotationStore>((set) => ({
  annotations: [],
  loadForBook: (annotations) => set({ annotations }),
  addAnnotation: (a) =>
    set((state) => ({
      annotations: [
        ...state.annotations,
        { ...a, id: crypto.randomUUID(), createdAt: Date.now() },
      ],
    })),
  removeAnnotation: (id) =>
    set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) })),
  updateColor: (id, color) =>
    set((state) => ({
      annotations: state.annotations.map((a) => (a.id === id ? { ...a, color } : a)),
    })),
  clearAll: () => set({ annotations: [] }),
}))
