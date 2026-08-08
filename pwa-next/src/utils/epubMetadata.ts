import ePub from 'epubjs'
import { patchBookPrototype } from '@/components/Reader/epubPatches'

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

export const extractMeta = (
  buffer: ArrayBuffer,
  filename: string,
): Promise<{ title: string; author: string; coverDataUrl: string | null }> => {
  const fallback = { title: filename.replace(/\.epub$/i, ''), author: '', coverDataUrl: null }

  const work = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const book = ePub(buffer.slice(0)) as any
    // epub.js bug 修補（見 components/Reader/epubPatches.ts）：book.destroy() 後
    // this.resources 會變成 undefined，若這之後背景的 replacements()/replaceCss()
    // 非同步鏈仍在跑就會噴未接住的 TypeError。這裡下面的 finally 會在 book.ready 一
    // resolve 就立刻呼叫 book.destroy()，那條背景鏈通常還沒跑完，所以這個獨立的
    // book 實例一樣需要這個修補（不能依賴主閱讀器那邊碰巧先套用過，使用者可能
    // 這個 session 裡還沒開過任何一本書來讀）。patchBookPrototype 是掛在 prototype
    // 上、有做過的 guard，重複呼叫是安全的。
    patchBookPrototype(Object.getPrototypeOf(book))
    try {
      await book.ready
      const pkg = book.package?.metadata
      const title = (pkg?.title as string | undefined)?.trim() || fallback.title
      const author = (pkg?.creator as string | undefined)?.trim() || ''

      let coverDataUrl: string | null = null
      try {
        const coverUrl: string | null = await book.coverUrl()
        if (coverUrl) {
          const blob = await fetch(coverUrl).then((r) => r.blob())
          coverDataUrl = await blobToDataUrl(blob)
          URL.revokeObjectURL(coverUrl)
        }
      } catch { /* 無封面 */ }

      return { title, author, coverDataUrl }
    } finally {
      book.destroy()
    }
  }

  const timeout = new Promise<typeof fallback>((resolve) =>
    setTimeout(() => resolve(fallback), 10_000),
  )

  return Promise.race([work().catch(() => fallback), timeout])
}
