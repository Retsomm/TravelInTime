// 同一個 key（例如某本書的 bookId）底下的所有推送依序執行，確保「book 本身的寫入」
// 一定先於「這本書的 progress/bookmarks/annotations 的寫入」送達，避免撞外鍵違反，
// 也避免後到的請求先送達導致舊快照蓋掉新快照。從 utils/cloudSync.ts 搬過來，語意不變。
const queues = new Map<string, Promise<boolean>>()

export const enqueue = (key: string, task: () => Promise<boolean>): Promise<boolean> => {
  const next = (queues.get(key) ?? Promise.resolve(true)).then(task)
  queues.set(key, next)
  return next
}
