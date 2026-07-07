export const computeChapterAverage = (known: Map<number, number>): number => {
  const knownValues = [...known.values()]
  return knownValues.reduce((a, b) => a + b, 0) / knownValues.length
}

export const computeAccurateTotal = (spineTotal: number, known: Map<number, number>, avg: number): number => {
  let totalPages = 0
  for (let i = 0; i < spineTotal; i++) totalPages += known.get(i) ?? avg
  return Math.round(totalPages)
}

export const computeGlobalPage = (spineIdx: number, chapterPage: number, known: Map<number, number>, avg: number): number => {
  let prevPages = 0
  for (let i = 0; i < spineIdx; i++) prevPages += known.get(i) ?? avg
  return Math.max(Math.round(prevPages + chapterPage), 1)
}

export const resolveInitialPageInfo = (params: {
  storedProgress: number | null | undefined
  estimatedTotal: number
  knownSize: number
  spineTotal: number
  page: number
}): { page: number; total: number } => {
  const { storedProgress, estimatedTotal, knownSize, spineTotal, page } = params
  if (storedProgress != null && storedProgress > 0 && knownSize < spineTotal) {
    const storedPage = Math.max(Math.round(storedProgress * estimatedTotal), 1)
    return { page: storedPage, total: estimatedTotal }
  }
  return { page, total: estimatedTotal }
}

export const clampProgressRatio = (rawRatio: number, ttsActive: boolean): number =>
  ttsActive ? Math.min(rawRatio, 0.99) : rawRatio
