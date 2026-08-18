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

const MEDIA_TAGS = new Set(['img', 'svg', 'canvas', 'video', 'picture'])

export const applyDarkOverride = (doc: Document, isDark: boolean) => {
  const bg = isDark ? '#1a1816' : '#f9f7f2'
  const color = isDark ? '#e5e7eb' : '#1c1917'
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

// 部分書本（例如某些從網路小說平台爬下來的 EPUB）內建 CSS 會有 @font-face 指向外部 CDN
// 的字型檔（例如 fastly.jsdelivr.net 上的字型），但本 App 已經用 !important 強制覆寫
// font-family（見 applyFontFamilyOverride），書本原本指定的字型從未真的被用來畫字，這些
// @font-face 只會造成瀏覽器嘗試抓取一個用不到、常常也抓不到（404）的外部字型檔，
// 純粹是網路請求雜訊。這裡在內容剛載入時就把指向外部網址的 @font-face 規則移除，
// 減少不必要的失敗請求。
export const stripExternalFontFace = (doc: Document) => {
  Array.from(doc.styleSheets).forEach((sheet) => {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      return // 跨來源樣式表無法讀取 cssRules，略過
    }
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i]
      if (rule instanceof CSSFontFaceRule && /url\((['"]?)https?:\/\//i.test(rule.style.getPropertyValue('src'))) {
        try { sheet.deleteRule(i) } catch { /* ignore */ }
      }
    }
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

const setInlineFontSize = (doc: Document, size: number) => {
  doc.querySelectorAll('body, body *').forEach(el => {
    try {
      const style = (el as HTMLElement).style
      if (style) style.setProperty('font-size', `${size}px`, 'important')
    } catch { /* SVG / MathML 等特殊元素略過 */ }
  })
}

export const applyFontSizeOverride = (doc: Document, size: number) => {
  injectStyle(doc, 'tit-fs', `* { font-size: ${size}px !important; }`)
  setInlineFontSize(doc, size)
  setTimeout(() => setInlineFontSize(doc, size), 150)
}

// iOS Safari（含「加入主畫面」的 standalone PWA）有一個獨立於 font-size 之外的
// text autosizing 演算法：它會依欄寬/裝置寬的比例，在畫面「渲染時」額外把文字放大
// 顯示，這個放大不會反映在 getComputedStyle().fontSize 上，所以上面 applyFontSizeOverride
// 逐一覆寫 inline font-size 也蓋不掉它——這正是本機瀏覽器（無此 autosizing 行為）測試正常，
// 只有實機 iOS PWA 才會看到文字被異常放大、擠壓版面的原因。多欄分頁排版（epub.js 的
// paginated flow 本質上就是窄欄 CSS columns）特別容易觸發這個演算法。
// 標準解法是明確設定 text-size-adjust: 100%，關閉這個自動放大。
export const applyTextSizeAdjustOverride = (doc: Document) => {
  injectStyle(doc, 'tit-tsa', `html, body, * { -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; }`)
}

// 部分書本（尤其某些直式排版的中文電子書）內建 CSS 會在特定元素（不一定是 html/body，
// 可能是內文的 wrapper div）設定 writing-mode: vertical-rl !important，跟本 App 固定的
// 橫向分頁 flow 衝突，疊在一起會變成直排文字塞進橫向分頁容器裡，版面完全跑掉，標點符號
// 也會用直排的字圈位置去排，橫排讀起來就變成標點跑到文字前面。
// `* { ... !important }` 的 universal selector specificity 是 0，蓋不過書本自己用
// element/class selector 寫的 !important 規則，所以要跟 setInlineFontSize 一樣，
// 逐一走訪 body 底下每個元素直接蓋 inline style（inline !important 優先權最高）。
// 注意：翻頁方向（epub.js rendition 的 next()/prev() 呼叫順序）不在這裡處理——那是
// epub.js 內部 Layout/manager 的設定，要透過 rendition.direction()／rendition.layout()
// 在 rendition 層級重建才會連翻頁順序一起修正，見 useReaderEngine.ts 的
// rendition.started.then(...)。
// 但這裡的 CSS `direction` 屬性要覆寫：直排書本原始 CSS 常搭配 direction: rtl（在
// vertical-rl 下這是控制欄位由右到左排列，本來就正常），一旦上面把 writing-mode 強制
// 改成 horizontal-tb，同一個 direction: rtl 會被瀏覽器當成「橫排文字也要右到左」，
// 導致整段文字變成右對齊、且行內文字順序左右相反（標點符號前後顛倒），所以要一併強制
// 覆寫成「目前實際生效的翻頁方向」，這是內容排版層級的事，跟上面翻頁方向的 rendition
// 設定是兩件獨立的事，但兩者的 direction 值必須一致：epub.js 的分頁引擎（contents.js
// columns()）會用 rendition 目前的 direction 設定去計算 CSS 多欄排版的欄位順序（同時
// manager 的 next()/prev() 也是用同一個 direction 決定 scrollLeft 要加還是減），如果這裡
// 寫死 ltr，遇到使用者設定（或書本 OPF）是 rtl 的書，多欄排版順序跟捲動方向就會對不起來，
// 表現成「按下一頁按鈕卻往回翻」。所以一定要傳入跟 rendition.direction() 相同的值，不能
// 寫死。
const setInlineWritingMode = (doc: Document, direction: 'ltr' | 'rtl') => {
  ;[doc.documentElement, doc.body, ...Array.from(doc.querySelectorAll('body *'))].forEach(el => {
    try {
      const style = (el as HTMLElement).style
      if (!style) return
      style.setProperty('writing-mode', 'horizontal-tb', 'important')
      style.setProperty('text-orientation', 'mixed', 'important')
      style.setProperty('direction', direction, 'important')
    } catch { /* SVG / MathML 等特殊元素略過 */ }
  })
}

export const applyWritingModeOverride = (doc: Document, direction: 'ltr' | 'rtl' = 'ltr') => {
  injectStyle(doc, 'tit-wm', `html, body, * { writing-mode: horizontal-tb !important; text-orientation: mixed !important; direction: ${direction} !important; }`)
  setInlineWritingMode(doc, direction)
  setTimeout(() => setInlineWritingMode(doc, direction), 150)
}
