export const META_KEY = 'tit-library'
export const DB_NAME = 'tit-books'
export const DB_VERSION = 1

export const bookmarksKey = (bookId: string) => `tit-bookmarks-${bookId}`
export const progressKey = (bookId: string) => `tit-progress-${bookId}`
export const settingsKey = (bookId: string) => `tit-settings-${bookId}`
