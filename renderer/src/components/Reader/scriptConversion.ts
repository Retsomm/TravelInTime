import * as OpenCC from 'opencc-js'

let _toSC: ((s: string) => string) | null = null
let _toTC: ((s: string) => string) | null = null
export const getToSC = () => { if (!_toSC) _toSC = OpenCC.Converter({ from: 'tw', to: 'cn' }); return _toSC }
export const getToTC = () => { if (!_toTC) _toTC = OpenCC.Converter({ from: 'cn', to: 'tw' }); return _toTC }
export const originalTexts = new WeakMap<Node, string>()

// 各功能 CSS 注入完全獨立，使用不同的 <style> 標籤，互不干擾
export const convertDoc = (doc: Document, convert: (s: string) => string) => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeValue && !originalTexts.has(node)) {
      originalTexts.set(node, node.nodeValue)
      node.nodeValue = convert(node.nodeValue)
    }
  }
}

export const restoreDoc = (doc: Document) => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const original = originalTexts.get(node)
    if (original !== undefined) {
      node.nodeValue = original
      originalTexts.delete(node) // 刪除 entry，確保下次切換時可以重新轉換
    }
  }
}
