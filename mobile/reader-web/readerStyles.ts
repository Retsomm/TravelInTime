import { normalizeFontFamily, type Script, type TypographySettings } from '../lib/readerSettings';
import { applyScriptToDoc } from './scriptConversion';

export const injectStyle = (doc: Document, id: string, css: string) => {
  let el = doc.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement('style');
    el.id = id;
    doc.head?.appendChild(el);
  }
  el.textContent = css;
};

// 比照 renderer/src/components/Reader/readerStyles.ts 的字體/行距/字距覆寫邏輯，
// 這幾個功能各自用獨立的 <style> id，互不干擾，也都要额外覆寫 inline style 才蓋得過書本內容。
const WEB_FONT_URLS: Record<string, string> = {
  Huninn: 'https://fonts.googleapis.com/css2?family=Huninn&display=swap',
  'Noto Serif TC': 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC&display=swap',
  'Noto Sans TC': 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC&display=swap',
  'LXGW WenKai TC': 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&display=swap',
};

const injectWebFontLink = (doc: Document, href: string | null) => {
  const id = 'tit-webfont-link';
  let el = doc.getElementById(id) as HTMLLinkElement | null;
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = doc.createElement('link');
    el.id = id;
    el.rel = 'stylesheet';
    doc.head?.appendChild(el);
  }
  el.href = href;
};

const applyFontFamilyOverride = (doc: Document, family: string) => {
  const normalized = normalizeFontFamily(family);
  injectStyle(doc, 'tit-font', `:root * { font-family: ${normalized} !important; }`);
  const fontKey = Object.keys(WEB_FONT_URLS).find((k) => normalized.includes(k));
  injectWebFontLink(doc, fontKey ? WEB_FONT_URLS[fontKey] : null);
};

const applyLineHeightOverride = (doc: Document, lh: number) => {
  injectStyle(doc, 'tit-lh', `:root * { line-height: ${lh} !important; }`);
};

const applyLetterSpacingOverride = (doc: Document, ls: number) => {
  injectStyle(doc, 'tit-ls', `:root * { letter-spacing: ${ls}em !important; }`);
};

const setInlineFontSize = (doc: Document, size: number) => {
  doc.querySelectorAll('body, body *').forEach((el) => {
    try {
      const style = (el as HTMLElement).style;
      if (style) style.setProperty('font-size', `${size}px`, 'important');
    } catch {
      /* SVG / MathML 等特殊元素略過 */
    }
  });
};

const applyFontSizeOverride = (doc: Document, size: number) => {
  injectStyle(doc, 'tit-fs', `:root * { font-size: ${size}px !important; }`);
  setInlineFontSize(doc, size);
  setTimeout(() => setInlineFontSize(doc, size), 150);
};

export const applyTypographyToDoc = (doc: Document, typography: TypographySettings, baseScript: Script) => {
  applyFontFamilyOverride(doc, typography.fontFamily);
  applyFontSizeOverride(doc, typography.fontSize);
  applyLineHeightOverride(doc, typography.lineHeight);
  applyLetterSpacingOverride(doc, typography.letterSpacing);
  applyScriptToDoc(doc, typography.script, baseScript);
};

// 比照 Electron 版 renderer/src/components/Reader/readerStyles.ts 的 applyDarkOverride：
// CSS 注入蓋不過書本元素的 inline !important style，所以除了注入 <style> 還要逐一覆寫
// 每個元素的 inline style（inline style 優先權比外部注入的 <style> 高）。
const MEDIA_TAGS = new Set(['img', 'svg', 'canvas', 'video', 'picture']);

export const applyDarkOverride = (doc: Document, isDark: boolean) => {
  const bg = isDark ? '#1a1816' : '#f9f7f2';
  const color = isDark ? '#e8e0d4' : '#2a2420';
  injectStyle(
    doc,
    'tit-dark',
    [
      `html, body { background-color: ${bg} !important; color: ${color} !important; }`,
      `* { color: ${color} !important; background-color: ${bg} !important; }`,
      `img, svg, canvas, video, picture { background-color: transparent !important; }`,
    ].join(' ')
  );
  doc.querySelectorAll('body, body *').forEach((el) => {
    try {
      const style = (el as HTMLElement).style;
      if (!style) return;
      if (!MEDIA_TAGS.has((el as HTMLElement).tagName?.toLowerCase())) {
        style.setProperty('background-color', bg, 'important');
      }
      style.setProperty('color', color, 'important');
    } catch {
      /* SVG / MathML 等特殊元素略過 */
    }
  });
};

// 部分書本（尤其某些直式排版的中文電子書）內建 CSS 會在特定元素（不一定是 html/body，
// 可能是內文的 wrapper div）設定 writing-mode: vertical-rl !important，跟本 App 固定的
// 橫向分頁 flow 衝突，疊在一起會變成直排文字塞進橫向分頁容器裡，版面完全跑掉，標點符號
// 也會用直排的字圈位置去排，橫排讀起來就變成標點跑到文字前面。
// `* { ... !important }` 的 universal selector specificity 是 0，蓋不過書本自己用
// element/class selector 寫的 !important 規則，所以要跟 setInlineFontSize 一樣，
// 逐一走訪 body 底下每個元素直接蓋 inline style（inline !important 優先權最高）。
// 注意：翻頁方向（direction: ltr/rtl）不在這裡處理——那是 epub.js 內部 Layout/manager
// 的設定，要透過 rendition.direction()／rendition.layout() 在 rendition 層級重建才會連
// 翻頁順序一起修正，見 index.ts 的 rendition.started.then(...)。
const setInlineWritingMode = (doc: Document) => {
  [doc.documentElement, doc.body, ...Array.from(doc.querySelectorAll('body *'))].forEach((el) => {
    try {
      const style = (el as HTMLElement).style;
      if (!style) return;
      style.setProperty('writing-mode', 'horizontal-tb', 'important');
      style.setProperty('text-orientation', 'mixed', 'important');
    } catch {
      /* SVG / MathML 等特殊元素略過 */
    }
  });
};

export const applyWritingModeOverride = (doc: Document) => {
  injectStyle(doc, 'tit-wm', `html, body, * { writing-mode: horizontal-tb !important; text-orientation: mixed !important; }`);
  setInlineWritingMode(doc);
  setTimeout(() => setInlineWritingMode(doc), 150);
};
