import ePub from 'epubjs';
import type { Book, Rendition } from 'epubjs';
import * as OpenCC from 'opencc-js';
import type { InboundMessage, OutboundMessage } from '../lib/readerMessages';
import { DEFAULT_TYPOGRAPHY, normalizeFontFamily, type TypographySettings } from '../lib/readerSettings';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

let book: Book | null = null;
let rendition: Rendition | null = null;
let darkMode = false;
let typography: TypographySettings = DEFAULT_TYPOGRAPHY;
// 書本本身原始使用的文字（依 epub metadata 的 language 判斷，比照網頁版 Reader.tsx 的
// baseScriptRef）。轉換/還原都要拿這個當基準，不能寫死假設書本原始文字一定是繁體——
// 上一版沒有偵測這個值，導致「書本原本就是簡體」時，切成「繁體」只會呼叫 restoreDoc()
// 還原成書本原本的簡體文字，並不會真的轉換成繁體。
let baseScript: TypographySettings['script'] = 'tc';
const contentDocs = new Set<Document>();

// 比照 renderer/src/components/Reader/scriptConversion.ts：opencc-js 轉換器延遲建立，
// originalTexts 記住轉換前的原始文字，切回原始 script 時可以還原（不必重新解析文件）。
let toSC: ((s: string) => string) | null = null;
let toTC: ((s: string) => string) | null = null;
const getToSC = () => { if (!toSC) toSC = OpenCC.Converter({ from: 'tw', to: 'cn' }); return toSC; };
const getToTC = () => { if (!toTC) toTC = OpenCC.Converter({ from: 'cn', to: 'tw' }); return toTC; };
const originalTexts = new WeakMap<Node, string>();

const convertDoc = (doc: Document, convert: (s: string) => string) => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && !originalTexts.has(node)) {
      originalTexts.set(node, node.nodeValue);
      node.nodeValue = convert(node.nodeValue);
    }
  }
};

const restoreDoc = (doc: Document) => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const original = originalTexts.get(node);
    if (original !== undefined) {
      node.nodeValue = original;
      originalTexts.delete(node);
    }
  }
};

// 只有「顯示腳本」跟「書本原始腳本」不同時才需要轉換；相同就還原成書本原文，
// 比照網頁版 Reader.tsx 的 `if (scriptRef.current !== baseScriptRef.current)` 判斷。
const applyScriptToDoc = (doc: Document) => {
  if (!doc.body) return;
  if (typography.script === baseScript) {
    restoreDoc(doc);
  } else {
    convertDoc(doc, typography.script === 'sc' ? getToSC() : getToTC());
  }
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
  if (!href) { el?.remove(); return; }
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

const applyTypographyToDoc = (doc: Document) => {
  applyFontFamilyOverride(doc, typography.fontFamily);
  applyFontSizeOverride(doc, typography.fontSize);
  applyLineHeightOverride(doc, typography.lineHeight);
  applyLetterSpacingOverride(doc, typography.letterSpacing);
  applyScriptToDoc(doc);
};

// contentDocs 只在 rendition.hooks.content 觸發時新增，epub.js 目前版本的 view manager
// 從不 emit MANAGERS.REMOVED，hooks.unloaded 永遠不會觸發，所以無法用官方的卸載事件清掉
// 舊 iframe 的 document；改成每次套用樣式前順手清掉已經卸載的 iframe（doc.defaultView 會
// 在 iframe 從 DOM 移除後變成 null）。
const pruneStaleContentDocs = () => {
  contentDocs.forEach((doc) => {
    if (!doc.defaultView) contentDocs.delete(doc);
  });
};

const setTypography = (next: TypographySettings) => {
  typography = next;
  pruneStaleContentDocs();
  contentDocs.forEach((doc) => applyTypographyToDoc(doc));
};

// 比照 Electron 版 renderer/src/components/Reader/readerStyles.ts 的 applyDarkOverride：
// CSS 注入蓋不過書本元素的 inline !important style，所以除了注入 <style> 還要逐一覆寫
// 每個元素的 inline style（inline style 優先權比外部注入的 <style> 高）。
const MEDIA_TAGS = new Set(['img', 'svg', 'canvas', 'video', 'picture']);

const injectStyle = (doc: Document, id: string, css: string) => {
  let el = doc.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement('style');
    el.id = id;
    doc.head?.appendChild(el);
  }
  el.textContent = css;
};

const applyDarkOverride = (doc: Document, isDark: boolean) => {
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

const applyDarkModeToOuterPage = (isDark: boolean) => {
  const bg = isDark ? '#1a1816' : '#f9f7f2';
  document.documentElement.style.backgroundColor = bg;
  document.body.style.backgroundColor = bg;
};

const setDarkMode = (isDark: boolean) => {
  darkMode = isDark;
  applyDarkModeToOuterPage(isDark);
  pruneStaleContentDocs();
  contentDocs.forEach((doc) => applyDarkOverride(doc, darkMode));
};

const post = (msg: OutboundMessage) => {
  window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
};

// 暫時的診斷用 log（會顯示在 Metro terminal 的 console.log），排查穩定後應移除。
const debugLog = (message: string) => post({ type: 'debug', message });

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

// epub.js 在上一次 prev()/next() 還沒 relocate 完成前又收到下一次翻頁請求時，
// 內部的 CFI/位置計算會錯亂，出現連續來回翻頁的情形。用一個簡單的忙碌鎖擋掉重疊呼叫，
// 並在 relocated 之後留一小段緩衝時間讓版面穩定，而不是 relocate 一觸發就馬上解鎖。
let navBusy = false;
let navUnlockTimer: ReturnType<typeof setTimeout> | null = null;

const lockNav = () => {
  navBusy = true;
  if (navUnlockTimer) clearTimeout(navUnlockTimer);
  // relocated 事件理論上會呼叫 unlockNavSoon()，這裡是防止 relocated 沒觸發時卡死的保險
  navUnlockTimer = setTimeout(unlockNav, 1500);
};

const unlockNav = () => {
  navBusy = false;
  if (navUnlockTimer) {
    clearTimeout(navUnlockTimer);
    navUnlockTimer = null;
  }
};

const unlockNavSoon = () => {
  if (navUnlockTimer) clearTimeout(navUnlockTimer);
  navUnlockTimer = setTimeout(unlockNav, 250);
};

const turnPage = (direction: 'prev' | 'next') => {
  if (navBusy || !rendition) return;
  lockNav();
  const action = direction === 'prev' ? rendition.prev() : rendition.next();
  Promise.resolve(action)
    .then(() => unlockNavSoon())
    .catch(() => unlockNav());
};

// 翻頁手勢：點擊畫面最外層（非 epub.js 內容 iframe）的左三分之一／右三分之一區塊翻頁，
// 中間三分之一保留給文字選取／未來註記手勢使用。
//
// 原本用滑動手勢翻頁，但滑動跟未來要加的劃詞註記手勢會衝突（使用者想選字時容易誤觸翻頁）。
// 而更早之前用過的「畫面左右 30% 點擊翻頁」在 epub.js 內容 iframe 上失敗，是因為 iOS WKWebView
// 裡該 iframe 的 window.innerWidth／touch clientX 回報的不是單頁可視寬度，而是整個（可能橫跨
// 多章節、經過捲動位移的）內容畫布寬度與座標（實測數值高達數千 px），拿這組座標去算「左 30%／
// 右 30%」完全不可靠。這次改把點擊區塊做成蓋在 #viewer 最上層、屬於最外層文件的透明 div
// （見 build-reader-html.js 的 #tap-zone-prev / #tap-zone-next），點擊事件直接發生在最外層文件，
// 不會經過 iframe 內部那套失準的座標系，兩平台都可靠。
// 右→左（RTL）閱讀方向下，畫面左側該觸發下一頁、右側觸發上一頁，跟 LTR 相反
// （比照網頁版 Reader.tsx 的翻頁箭頭在 rtl 時互換 prevPage/nextPage 的邏輯）。
const registerTapZone = (id: string, baseDirection: 'prev' | 'next') => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
    const direction = typography.readingDirection === 'rtl'
      ? (baseDirection === 'prev' ? 'next' : 'prev')
      : baseDirection;
    debugLog(`[tap-zone] ${direction}`);
    turnPage(direction);
  });
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// 書名/作者/封面擷取：跟閱讀渲染共用同一份 epub.js bundle，但不呼叫 renderTo()，
// 純粹讀 book.package.metadata 與 book.coverUrl()，不需要 #viewer 實際顯示內容，
// 因此可以直接借用 reader 頁面既有的 WebView（RN 端隱藏顯示）跑，不用另外打包一份 HTML。
const extractMeta = async (base64: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metaBook = ePub(base64ToArrayBuffer(base64)) as any;
  try {
    await metaBook.ready;
    const pkg = metaBook.package?.metadata;
    const title = (pkg?.title as string | undefined)?.trim() || '';
    const author = (pkg?.creator as string | undefined)?.trim() || '';

    let coverBase64: string | null = null;
    let coverMediaType: string | null = null;
    try {
      const coverUrl: string | null = await metaBook.coverUrl();
      if (coverUrl) {
        const blob: Blob = await fetch(coverUrl).then((r) => r.blob());
        coverMediaType = blob.type || null;
        coverBase64 = await blobToBase64(blob);
        URL.revokeObjectURL(coverUrl);
      }
    } catch {
      /* 無封面，忽略 */
    }

    post({ type: 'metaExtracted', title, author, coverBase64, coverMediaType });
  } catch (err) {
    post({ type: 'metaError', message: err instanceof Error ? err.message : String(err) });
  } finally {
    metaBook.destroy();
  }
};

const loadBook = async (base64: string, cfi: string | null) => {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  try {
    book = ePub(base64ToArrayBuffer(base64));
    rendition = book.renderTo(viewer, {
      width: viewer.clientWidth,
      height: viewer.clientHeight,
      spread: 'none',
      flow: 'paginated',
      // epub.js 預設把內容 iframe 的 sandbox 設為只有 allow-same-origin（沒有 allow-scripts）。
      // 在 iOS 的 WKWebView 上，這會連帶擋掉從外層掛在該 iframe document 上的事件監聽器
      // （touchstart/touchend、pointerdown/pointerup）被呼叫，導致滑動翻頁完全沒反應
      // （Safari Web Inspector 主控台會看到 "Blocked script execution in 'about:srcdoc'..."）。
      // Android 的 WebView（Chromium）沒有這個限制。
      allowScriptedContent: true,
    });

    // 每次章節內容渲染（換頁/換章節都會重新渲染 iframe 內容）時套用目前的深色模式狀態，
    // 並記錄這份 document 供 setDarkMode 之後即時切換時重新套用（不必等下次換頁）。
    rendition.hooks.content.register((contents: unknown) => {
      const doc = (contents as { document: Document }).document;
      if (!doc) return;
      contentDocs.add(doc);
      applyDarkOverride(doc, darkMode);
      applyTypographyToDoc(doc);
    });

    rendition.on('relocated', (loc: unknown) => {
      unlockNavSoon();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const l = loc as any;
      const displayed = l?.start?.displayed as { page: number; total: number } | undefined;
      if (!l?.start?.cfi || !displayed || !book) return;

      // l.start.displayed 的 page/total 只是「目前這個章節（spine item）」內部的頁碼，
      // 不是全書頁碼——書快翻到某一章結尾時 page 就會等於 total，導致每章結尾都會被
      // RN 端誤判成「整本書讀完」而顯示 100%／讀畢。epub.js 要拿到準確的全書百分比，
      // 需要先跑過 book.locations.generate()（見下方 loadBook 內呼叫），跑完之前
      // l.start.percentage 會是 undefined，這裡用「章節索引 + 章內頁碼比例」概算一個
      // 過渡值，locations 產生完成後之後的 relocated 事件就會換成精確值。
      // epubjs 的 Spine 型別定義沒有列出 length（實際上 unpack() 時有設定這個欄位），只能用 any 存取。
      const spineLength = (book.spine as any).length as number;
      const total = typeof l.start.percentage === 'number'
        ? l.start.percentage
        : (l.start.index + (displayed.page - 1) / Math.max(displayed.total, 1)) / Math.max(spineLength, 1);

      post({
        type: 'relocated',
        cfi: l.start.cfi,
        page: displayed.page,
        total: displayed.total,
        percentage: Math.max(0, Math.min(1, total)),
        atStart: Boolean(l.atStart),
        atEnd: Boolean(l.atEnd),
      });
    });

    await book.ready;
    // 簡體判斷比照網頁版 Reader.tsx：zh-CN / zh-Hans / zh-SG，或單獨的 "zh"（不帶 region code）。
    // 一定要在 rendition.display() 之前判斷完成，因為 display() 會觸發 content hook 套用 script。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lang = ((book as any).package?.metadata?.language as string | undefined) ?? '';
    baseScript = /^zh$|zh[-_]?(cn|hans|sg)/i.test(lang) ? 'sc' : 'tc';
    post({ type: 'bookLanguageDetected', baseScript });
    await rendition.display(cfi ?? undefined);
    // 全書頁面定位索引，跑完後 relocated 事件的 l.start.percentage 才會是精確的全書百分比
    // （不是章節內比例）。放在 display() 之後、不 await，避免拖慢開書速度；期間的
    // relocated 事件會先用上面的章節索引概算值頂著。
    book.locations.generate(1024).catch(() => {
      /* 定位索引產生失敗不影響閱讀本身，忽略即可，頂多進度概算比較粗略 */
    });
  } catch (err) {
    unlockNav();
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

// TTS 朗讀文字來源：目前顯示中章節的 iframe document.body 全文（paginated 模式下，
// 一個章節的完整內容是渲染在同一份 document 裡用 CSS 分欄呈現，body.textContent 涵蓋整章，
// 不只是目前可見的那一頁）。這是簡化版實作，不像網頁版那樣從目前頁面的精確字元位移開始，
// 一律從章節開頭朗讀；也還沒有 CFI/高亮同步，僅供 mobile 第一版朗讀功能使用。
const getChapterText = (): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents = (rendition as any)?.getContents?.() as { document: Document }[] | undefined;
  const doc = contents?.[0]?.document;
  if (!doc?.body) return '';
  const clone = doc.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style').forEach((el) => el.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const handleMessage = (event: MessageEvent<string>) => {
  let msg: InboundMessage;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }
  if (msg.type === 'load') loadBook(msg.base64, msg.cfi);
  if (msg.type === 'prev') turnPage('prev');
  if (msg.type === 'next') turnPage('next');
  if (msg.type === 'extractMeta') extractMeta(msg.base64);
  if (msg.type === 'setDarkMode') setDarkMode(msg.darkMode);
  if (msg.type === 'setTypography') {
    const { type: _type, ...settings } = msg;
    setTypography(settings);
  }
  if (msg.type === 'getChapterText') post({ type: 'chapterText', text: getChapterText() });
};

// RN WebView 在 Android 觸發 document 的 message 事件，iOS 觸發 window 的，兩者都要監聽
document.addEventListener('message', handleMessage as EventListener);
window.addEventListener('message', handleMessage as EventListener);

let resizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const viewer = document.getElementById('viewer');
    if (!rendition || !viewer) return;
    const { clientWidth, clientHeight } = viewer;
    if (clientWidth <= 0 || clientHeight <= 0) return;
    try {
      rendition.resize(clientWidth, clientHeight);
    } catch {
      /* epub.js 尚未就緒，忽略 */
    }
  }, 150);
});

registerTapZone('tap-zone-prev', 'prev');
registerTapZone('tap-zone-next', 'next');

post({ type: 'ready' });
