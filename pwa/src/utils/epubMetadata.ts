import ePub from 'epubjs'

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

    book.destroy()
    return { title, author, coverDataUrl }
  }

  const timeout = new Promise<typeof fallback>((resolve) =>
    setTimeout(() => resolve(fallback), 10_000),
  )

  return Promise.race([work().catch(() => fallback), timeout])
}
