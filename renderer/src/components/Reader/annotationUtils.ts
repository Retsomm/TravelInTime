// 使用者拖曳選字時，如果選取範圍剛好停在「下一個段落開頭第 0 個字元」（常見於選到整句話最後
// 一路拖過了段落結尾），epub.js 用這個 Selection 算出的 CFI，事後被還原成 Range 畫底線時，
// marks-pane 算出來的線段會塌縮成寬度 0 的一個點（起訖 x 座標相同），底線因此完全看不到，
// 但註記本身仍正確存在（清單顯示正常、DOM 裡的 <line> 元素也查得到，只是沒有實際寬度）。
// 這裡在產生 CFI 之前，偵測到這種「end 剛好卡在下個節點開頭」的情形時，把選取範圍的終點
// 往回收斂到「前一個有內容的文字節點結尾（去掉尾端空白）」，避免產生這種塌縮 CFI。
// 找不到可收斂的位置、或收斂後範圍反而變成 0 寬度時，回傳 null，呼叫端應該回退用原本的
// range/CFI（等於維持原行為，不冒風險）。
export const trimSelectionEndSpillover = (range: Range): Range | null => {
  if (range.collapsed || range.endOffset !== 0) return null

  const doc = range.endContainer.ownerDocument
  if (!doc?.body) return null

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  walker.currentNode = range.endContainer

  let prev = walker.previousNode() as Text | null
  while (prev && (prev.nodeValue ?? '').trim().length === 0) {
    prev = walker.previousNode() as Text | null
  }
  if (!prev) return null

  const value = prev.nodeValue ?? ''
  const trimmedEndOffset = value.search(/\s*$/)
  if (trimmedEndOffset <= 0) return null

  const trimmed = range.cloneRange()
  try {
    trimmed.setEnd(prev, trimmedEndOffset)
  } catch {
    return null
  }
  if (trimmed.collapsed) return null

  const rect = trimmed.getBoundingClientRect()
  if (rect.width <= 0 && rect.height <= 0) return null

  return trimmed
}

export const HIGHLIGHT_COLORS = [
  { label: '黃', value: '#eab308' },
  { label: '綠', value: '#22c55e' },
  { label: '藍', value: '#3b82f6' },
  { label: '粉', value: '#f9b9d7' },
  { label: '橘', value: '#f97316' },
]

export const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

