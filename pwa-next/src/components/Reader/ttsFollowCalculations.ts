import type { TTSProgressSource } from '@/hooks/useTTS'

export const computeContinuousPage = (absoluteOffset: number, textLength: number, totalPages: number): number =>
  absoluteOffset / textLength * totalPages + 1

export const computePageTurnOffset = (pageStartOffset: number | null, pageEndOffset: number | null, lead: number): number | null =>
  pageEndOffset === null ? null : Math.max(pageStartOffset ?? 0, pageEndOffset - lead)

export const computePageEntryGuard = (pageStartOffset: number | null, pageSpan: number | null, maxGuard: number): number =>
  pageStartOffset !== null ? Math.min(maxGuard, Math.max(12, Math.floor((pageSpan ?? maxGuard) * 0.22))) : 0

export type ShouldAdvanceParams = {
  absoluteOffset: number
  pageStartOffset: number | null
  pageEndOffset: number | null
  pageTurnOffset: number | null
  continuousPage: number
  currentPage: number
  source: TTSProgressSource
  outsidePage: boolean
  pageEntryGuard: number
}

export type ShouldAdvanceResult = {
  shouldAdvance: boolean
  reason: 'page-end-cfi' | 'progress-fallback' | 'none'
  beforeCurrentPageGuard: boolean
  insideNewPageGuard: boolean
}

// 完整搬移自 Reader.tsx 舊版 followTTSRange 的翻頁判斷區塊，邏輯不變。
export const shouldAdvanceTTSPage = (params: ShouldAdvanceParams): ShouldAdvanceResult => {
  const { absoluteOffset, pageStartOffset, pageEndOffset, pageTurnOffset, continuousPage, currentPage, source, outsidePage, pageEntryGuard } = params
  const distanceToPageEnd = pageTurnOffset === null ? null : pageTurnOffset - absoluteOffset
  const beforeCurrentPageGuard = pageStartOffset !== null && absoluteOffset < pageStartOffset - 2
  const insideNewPageGuard =
    pageStartOffset !== null &&
    absoluteOffset >= pageStartOffset &&
    absoluteOffset < pageStartOffset + pageEntryGuard
  const progressShouldAdvance =
    !beforeCurrentPageGuard &&
    !insideNewPageGuard &&
    pageEndOffset === null && (
      outsidePage ||
      (source === 'boundary' && continuousPage >= currentPage + 1.05) ||
      (continuousPage >= currentPage + 1.12)
    )
  const measuredPageEndReached =
    !beforeCurrentPageGuard &&
    pageEndOffset !== null &&
    distanceToPageEnd !== null &&
    distanceToPageEnd <= 0

  if (measuredPageEndReached) return { shouldAdvance: true, reason: 'page-end-cfi', beforeCurrentPageGuard, insideNewPageGuard }
  if (progressShouldAdvance) return { shouldAdvance: true, reason: 'progress-fallback', beforeCurrentPageGuard, insideNewPageGuard }
  return { shouldAdvance: false, reason: 'none', beforeCurrentPageGuard, insideNewPageGuard }
}

export const computeApproxOffsetFromPercentage = (
  percentage: number | undefined,
  currentPageIdx: number,
  totalPages: number,
  textLength: number,
): number =>
  (typeof percentage === 'number' && percentage > 0)
    ? Math.floor(percentage * textLength)
    : Math.floor(currentPageIdx / totalPages * textLength)

// 在全文中搜尋 sample 文字樣本，選擇距離 approx 最近的符合位置；找不到回傳 null。
export const locateApproxOffsetByFuzzyMatch = (fullText: string, approx: number, sample: string): number | null => {
  if (sample.length < 3) return null
  const normalFull = fullText.replace(/\s+/g, '')
  const approxNorm = Math.round(approx / fullText.length * normalFull.length)
  let bestNormIdx = -1
  let bestDist = Infinity
  let pos = 0
  while (true) {
    const idx = normalFull.indexOf(sample, pos)
    if (idx < 0) break
    const dist = Math.abs(idx - approxNorm)
    if (dist < bestDist) { bestDist = dist; bestNormIdx = idx }
    pos = idx + 1
  }
  if (bestNormIdx < 0) return null

  let normCount = 0
  for (let i = 0; i < fullText.length; i++) {
    if (!/\s/.test(fullText[i])) {
      if (normCount === bestNormIdx) return i
      normCount++
    }
  }
  return null
}

export const snapOffsetToWordStart = (fullText: string, approx: number): number => {
  let startOffset = approx
  while (startOffset > 0 && !/[\s\n]/.test(fullText[startOffset - 1])) startOffset--
  return startOffset
}
