import { FONT_OPTIONS } from '@/store/useReaderStore'

// 各功能 CSS 注入完全獨立，使用不同的 <style> 標籤，互不干擾
export const injectStyle = (doc: Document, id: string, css: string) => {
  let el = doc.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = doc.createElement('style')
    el.id = id
    doc.head?.appendChild(el)
  }
  el.textContent = css
}

export const applyDarkOverride = (doc: Document, isDark: boolean) => {
  const bg = isDark ? '#1a1816' : '#f9f7f2'
  const color = isDark ? '#e5e7eb' : '#1c1917'
  const colorRule = isDark ? `* { color: ${color} !important; }` : ''
  injectStyle(doc, 'tit-dark', `html, body { background-color: ${bg} !important; } ${colorRule}`)
}

const WEB_FONT_URLS: Record<string, string> = {
  Huninn: 'https://fonts.googleapis.com/css2?family=Huninn&display=swap',
  'Noto Serif TC': 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC&display=swap',
  'Noto Sans TC': 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC&display=swap',
  'LXGW WenKai TC': 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&display=swap',
}

const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0].value

export const normalizeFontFamily = (family: string | null | undefined): string =>
  family && FONT_OPTIONS.some(option => option.value === family) ? family : DEFAULT_FONT_FAMILY

const injectWebFontLink = (doc: Document, href: string | null) => {
  const id = 'tit-webfont-link'
  let el = doc.getElementById(id) as HTMLLinkElement | null
  if (!href) { el?.remove(); return }
  if (!el) {
    el = doc.createElement('link')
    el.id = id
    el.rel = 'stylesheet'
    doc.head?.appendChild(el)
  }
  el.href = href
}

export const applyFontFamilyOverride = (doc: Document, family: string) => {
  const normalizedFamily = normalizeFontFamily(family)
  injectStyle(doc, 'tit-font', `:root * { font-family: ${normalizedFamily} !important; }`)
  const fontKey = Object.keys(WEB_FONT_URLS).find(k => normalizedFamily.includes(k))
  injectWebFontLink(doc, fontKey ? WEB_FONT_URLS[fontKey] : null)
}

export const applyLineHeightOverride = (doc: Document, lh: number) => {
  injectStyle(doc, 'tit-lh', `* { line-height: ${lh} !important; }`)
}

export const applyLetterSpacingOverride = (doc: Document, ls: number) => {
  injectStyle(doc, 'tit-ls', `* { letter-spacing: ${ls}em !important; }`)
}
