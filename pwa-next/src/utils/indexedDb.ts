import { DB_NAME, DB_VERSION } from '@/constants/storageKeys'

let _dbPromise: Promise<IDBDatabase> | null = null

export const openDB = (): Promise<IDBDatabase> => {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('files')
      req.result.createObjectStore('covers')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      _dbPromise = null
      reject(req.error)
    }
  })
  return _dbPromise
}

export const idbGet = <T>(store: string, key: string): Promise<T | null> =>
  openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key)
        req.onsuccess = () => resolve((req.result as T) ?? null)
        req.onerror = () => reject(req.error)
      }),
  )

export const idbPut = (store: string, key: string, value: unknown): Promise<void> =>
  openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )

export const idbDelete = (store: string, key: string): Promise<void> =>
  openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )
