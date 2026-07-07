import type { Bookmark } from '@/hooks/useLibrary'

export const sortBookmarksByAddedAt = (bookmarks: Bookmark[]): Bookmark[] =>
  [...bookmarks].sort((a, b) => a.addedAt - b.addedAt)

export const removeBookmarkById = (bookmarks: Bookmark[], id: string): Bookmark[] =>
  bookmarks.filter((b) => b.id !== id)

export const toggleBookmark = (bookmarks: Bookmark[], cfi: string, label: string): Bookmark[] => {
  if (bookmarks.some((b) => b.cfi === cfi)) {
    return bookmarks.filter((b) => b.cfi !== cfi)
  }
  return [...bookmarks, { id: crypto.randomUUID(), cfi, label, addedAt: Date.now() }]
}

export const formatBookmarkDate = (addedAt: number): string =>
  new Date(addedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
