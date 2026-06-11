import { FONT_OPTIONS } from '@/store/useReaderStore'

export const injectStyle = (doc: Document, id: string, css: string) => {
  let el = doc.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = doc.createElement('style')
    el.id = id
    doc.head?.appendChild(el)
  }
  el.textContent = css
}

const MEDIA_TAGS = new Set(['img', 'svg', 'canvas', 'video', 'picture'])

export const applyDarkOverride = (doc: Document, isDark: boolean) => {
  const bg = isDark ? '#1a1816' : '#f9f7f2'
  const color = isDark ? '#e8e0d4' : '#2a2420'
  const mediaClear = `img, svg, canvas, video, picture { background-color: transparent !important; }`
  injectStyle(doc, 'tit-dark', [
    `html, body { background-color: ${bg} !important; color: ${color} !important; }`,
    `* { color: ${color} !important; background-color: ${bg} !important; }`,
    mediaClear,
  ].join(' '))
  // 強制覆寫 inline !important styles（CSS 注入無法蓋過書本元素的 inline !important）
  doc.querySelectorAll('body, body *').forEach(el => {
    try {
      const style = (el as HTMLElement).style
      if (!style) return
      if (!MEDIA_TAGS.has((el as HTMLElement).tagName?.toLowerCase())) {
        style.setProperty('background-color', bg, 'important')
      }
      style.setProperty('color', color, 'important')
    } catch { /* SVG / MathML 等特殊元素略過 */ }
  })
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

export const injectWebFontLink = (doc: Document, href: string | null) => {
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
  injectStyle(doc, 'tit-lh', `:root * { line-height: ${lh} !important; }`)
}

export const applyLetterSpacingOverride = (doc: Document, ls: number) => {
  injectStyle(doc, 'tit-ls', `:root * { letter-spacing: ${ls}em !important; }`)
}

const setInlineFontSize = (doc: Document, size: number) => {
  doc.querySelectorAll('body, body *').forEach(el => {
    try {
      const style = (el as HTMLElement).style
      if (style) style.setProperty('font-size', `${size}px`, 'important')
    } catch { /* SVG / MathML 等特殊元素略過 */ }
  })
}

export const applyFontSizeOverride = (doc: Document, size: number) => {
  injectStyle(doc, 'tit-fs', `:root * { font-size: ${size}px !important; }`)
  setInlineFontSize(doc, size)
  setTimeout(() => setInlineFontSize(doc, size), 150)
}


