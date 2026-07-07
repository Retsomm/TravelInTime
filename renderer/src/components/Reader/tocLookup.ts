// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TocItem = { href?: string; label?: string; subitems?: any[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpineItem = { href?: string; idref?: string }

export const findChapterTitleByHref = (tocItems: TocItem[], curFile: string): string => {
  let bestLabel = ''
  let bestDepth = -1

  const search = (items: TocItem[], depth: number) => {
    for (const item of items) {
      const itemFile = (item.href ?? '').split('#')[0]
      if (itemFile === curFile && depth > bestDepth) {
        bestLabel = item.label?.trim() ?? ''
        bestDepth = depth
      }
      if (item.subitems?.length) search(item.subitems, depth + 1)
    }
  }
  search(tocItems, 0)
  return bestLabel
}

export const hrefToSpineIndex = (spineItems: SpineItem[], href: string): number => {
  const file = href.split('#')[0]
  return spineItems.findIndex((s) =>
    s.href === file || s.href === href ||
    (file && (s.href?.endsWith('/' + file) || file?.endsWith('/' + (s.href ?? ''))))
  )
}

export const findNearestChapterLabel = (tocItems: TocItem[], spineItems: SpineItem[], curSpineIdx: number): string => {
  let bestLabel = ''
  let bestIdx = -1

  const search = (items: TocItem[]) => {
    for (const item of items) {
      const si = hrefToSpineIndex(spineItems, item.href ?? '')
      if (si !== -1 && si <= curSpineIdx && si > bestIdx) {
        bestLabel = item.label?.trim() ?? ''
        bestIdx = si
      }
      if (item.subitems?.length) search(item.subitems)
    }
  }
  search(tocItems)
  return bestLabel
}

export const resolveSpineTarget = (spineItems: SpineItem[], href: string): string => {
  const cleanHref = href.split('#')[0]
  const filename = cleanHref.split('/').pop() ?? ''
  const spineItem = spineItems.find((item) =>
    item.href === href ||
    item.href === cleanHref ||
    item.idref === cleanHref ||
    item.idref === filename ||
    (filename && item.href?.endsWith('/' + filename)) ||
    (filename && item.href === filename)
  )
  return spineItem?.href ?? href
}
