import ePub from 'epubjs';
import type { Book, Rendition } from 'epubjs';
import * as OpenCC from 'opencc-js';
import type { InboundMessage, OutboundMessage, TocItem } from '../lib/readerMessages';
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

// 全書頁碼／精確進度百分比：比照網頁版 Reader.tsx 的 scanAllChapterPages/chapterPagesRef，
// 背景用一個隱藏的 hiddenRendition 依序 display() 每個 spine 章節，讀 epub.js 真正算出來的
// displayed.total（該章節在目前字級/行距/字距設定下的實際頁數，不是概算），加總起來就是全書
// 精確頁數，章節內 displayed.page 本身就是使用者「翻一次就走一個真正的頁面」，因此全書頁碼也會
// 精準跟著每次翻頁動作 1:1 增減。
//
// 中間踩過的坑：一開始改用 book.locations.generate(chars) 對整本書做「每 N 字元切一個位置」的
// 概算索引，兩個副作用都不理想：(1) 概算的位置跟使用者實際看到的螢幕頁面不是 1:1（N 字元可能
// 橫跨不只一個螢幕頁，使用者會覺得「翻好幾頁頁碼才跳一次」）；(2) 就算把 generate() 換到獨立的
// book 實例上執行，Locations.generate() 內部逐 section 呼叫 section.load()/section.unload() 仍是
// 吃 CPU 的背景工作，在 Android 模擬器上可能拖慢/干擾使用者正在操作的翻頁。改成這裡的
// hiddenRendition 方案後，用的是 epub.js Rendition 本身既有的分頁結果（不是自己另外算的概算值），
// 且 Rendition 導覽本身不會呼叫 section.unload()（只有 Locations 才會），兩個問題應該一併解決。
let chapterPageCounts: Map<number, number> = new Map();
// 背景章節掃描完成後才會是 true；完成前 relocated 事件送出的全書頁碼（page/total）為 null，
// 畫面上先不顯示頁數，避免顯示還在累加中、之後會跳動的暫時值。
let locationsReady = false;
// 最近一次 relocated 事件的原始 loc 物件，供背景掃描跑完後主動重算一次全書頁碼並補送——若使用者
// 開書後沒有繼續翻頁，光是掃描完成這件事本身不會觸發新的 relocated 事件，若不補送，頁數列會一直
// 卡在「還沒出現」。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastRelocatedLoc: any = null;
// 全書最後一個 linear 章節的 spine index（由 scanAllChapterPages 設定）。postRelocated 的
// stuck-CFI 校正只在這一章才會生效，見該處的說明。
let lastLinearSpineIndex: number | null = null;

// 章節目錄快取（目錄面板顯示用）與 spine href 順序（比照網頁版 Reader.tsx 的
// getChapterTitle／getBookmarkLabel，用來把目前位置換算成章節標題）。
let tocCache: TocItem[] = [];
let spineHrefs: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildToc = (items: any[]): TocItem[] =>
  items.map((item) => ({
    id: (item.href as string) || (item.label as string) || Math.random().toString(36).slice(2),
    href: (item.href as string) ?? '',
    label: (item.label as string)?.trim() ?? '',
    subitems: item.subitems?.length ? buildToc(item.subitems) : undefined,
  }));

const hrefToSpineIndex = (href: string): number => {
  const file = href.split('#')[0];
  return spineHrefs.findIndex(
    (h) => h === file || h === href || (Boolean(file) && (h.endsWith(`/${file}`) || file.endsWith(`/${h}`)))
  );
};

// 同檔案完全相符、深度越深（越靠近葉節點）優先，比照網頁版 getChapterTitle。
const findExactChapterLabel = (curFile: string): string => {
  let bestLabel = '';
  let bestDepth = -1;
  const search = (items: TocItem[], depth: number) => {
    for (const item of items) {
      const itemFile = item.href.split('#')[0];
      if (itemFile === curFile && depth > bestDepth) {
        bestLabel = item.label;
        bestDepth = depth;
      }
      if (item.subitems?.length) search(item.subitems, depth + 1);
    }
  };
  search(tocCache, 0);
  return bestLabel;
};

// 找不到精確相符時，退而求其次找 spine 索引最接近（但不超過）目前章節的目錄項目，
// 比照網頁版 getBookmarkLabel 的 fallback 邏輯。
const findNearestChapterLabel = (curSpineIdx: number): string => {
  let bestLabel = '';
  let bestIdx = -1;
  const search = (items: TocItem[]) => {
    for (const item of items) {
      const si = hrefToSpineIndex(item.href);
      if (si !== -1 && si <= curSpineIdx && si > bestIdx) {
        bestLabel = item.label;
        bestIdx = si;
      }
      if (item.subitems?.length) search(item.subitems);
    }
  };
  search(tocCache);
  return bestLabel;
};

const getChapterLabel = (href: string, spineIdx: number): string => {
  const curFile = (href ?? '').split('#')[0];
  return findExactChapterLabel(curFile) || findNearestChapterLabel(spineIdx) || '書籤';
};

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

// 記錄剛剛呼叫的是 prev 還是 next，供 postRelocated 判斷「呼叫了 next() 但 CFI 完全沒變」這種
// epub.js 量測出來的 displayed.total 比實際能翻到的頁面多 1（常發生在全書最後一章結尾）的情況——
// 見 postRelocated 內 confirmedBookEnd 的說明。
let lastNavDirection: 'prev' | 'next' | null = null;

const turnPage = (direction: 'prev' | 'next') => {
  if (navBusy || !rendition) return;
  lockNav();
  lastNavDirection = direction;
  const action = direction === 'prev' ? rendition.prev() : rendition.next();
  Promise.resolve(action)
    .then(() => unlockNavSoon())
    .catch(() => unlockNav());
};

// 章節目錄的 href 格式常常跟 spine item 的 href 對不上：epub.js 的 Navigation 解析器完全不會
// 正規化 nav/ncx 檔案裡寫的 href（見 node_modules/epubjs/src/navigation.js，沒有傳入 resolver），
// 而 nav.xhtml／toc.ncx 常常跟內容檔案放在不同資料夾，導致目錄裡的 href 是相對於 nav 檔案自己的
// 路徑（例如 `../Text/Section0055.xhtml`），跟 spine.get() 用來比對的 spine item href（相對於
// OPF 解析出來的路徑，例如 `Text/Section0055.xhtml`）對不起來，`rendition.display()` 因此拋出
// `No Section Found`，實測就是「點目錄章節沒反應」的真正根因。網頁版 Reader.tsx 的
// handleNavigateToChapter 已經解過這題：改用檔名比對 spine.items 找出對應項目，拿它「自己的」
// href 去 display()，這裡照抄同一招。CFI（書籤用）本身就是 spine 索引編碼過的字串，不需要這段
// 正規化，用 epubcfi( 開頭這個簡單特徵判斷就好。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolveNavTarget = (target: string): string => {
  if (/^epubcfi\(/i.test(target) || !book) return target;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spineItems = ((book.spine as any)?.items ?? []) as any[];
  const cleanHref = target.split('#')[0];
  const filename = cleanHref.split('/').pop() ?? '';
  const spineItem = spineItems.find((item) =>
    item.href === target ||
    item.href === cleanHref ||
    item.idref === cleanHref ||
    item.idref === filename ||
    (filename && item.href?.endsWith('/' + filename)) ||
    (filename && item.href === filename)
  );
  return spineItem?.href ?? target;
};

// 目錄／書籤跳轉：直接呼叫 rendition.display(target)。
// 踩過的坑：先前這裡完全沒有經過 navBusy 忙碌鎖，如果使用者剛翻頁、忙碌鎖還沒解開（
// unlockNavSoon 的 250ms 緩衝內）就馬上點目錄章節，會變成 display() 跟前一次 next()/prev()
// 同時操作 epub.js 內部狀態——這正是 navBusy 鎖原本要擋的那種情況（見 turnPage 上方的說明），
// 表現出來就是「點章節沒反應／跳轉失敗」。改成用短輪詢等待目前的忙碌鎖解開後才真的執行，
// 而不是直接略過——章節/書籤跳轉是使用者明確的單次意圖，不應該像翻頁那樣「忙碌中就丟棄」。
const gotoTarget = async (rawTarget: string) => {
  if (!rendition) return;
  const target = resolveNavTarget(rawTarget);
  let waited = 0;
  while (navBusy && waited < 2000) {
    await new Promise<void>((r) => setTimeout(r, 50));
    waited += 50;
  }
  lockNav();
  Promise.resolve(rendition.display(target))
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

// 背景逐章渲染取得精確全書頁數（比照網頁版 Reader.tsx 的 scanAllChapterPages）：用一個隱藏、
// 不會顯示在畫面上的 hiddenRendition（跟主 rendition 共用同一個 book 實例——Rendition 導覽不會
// 呼叫 section.unload()，只有 Locations.generate() 才會，所以共用 book 不會干擾主 rendition，
// 這跟之前踩過的 Locations 那顆坑不是同一回事），依序 display() 每個 spine 章節，讀 epub.js 算出
// 來的 displayed.total（該章節在目前排版設定下的真實頁數）加總，取代原本用字元數概算的作法。
//
// 只掃描 item.linear === 'yes' 的章節：epub.js 的 rendition.next()/prev() 實際上只會在
// linear 章節之間移動（見 epubjs/src/spine.js 的 item.next()/prev()，non-linear 章節會被完全
// 跳過，使用者靠翻頁永遠到不了）。epub 常見會把版權頁/附錄等標成 linear="no"，先前沒有排除
// 這些章節，導致全書總頁數把使用者翻頁永遠碰不到的頁面也算進去，翻到真正的最後一頁時「第 X
// 頁」永遠比「共 Y 頁」少（Y 多算了那些 non-linear 章節的頁數）。
const scanAllChapterPages = async () => {
  if (!book) return;
  const viewer = document.getElementById('viewer');
  if (!viewer) return;
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spineItems = ((book.spine as any)?.items ?? []) as any[];
  const linearItems = spineItems.filter((item) => item.linear === 'yes');
  if (!linearItems.length || width <= 0 || height <= 0) return;

  const hiddenEl = document.createElement('div');
  Object.assign(hiddenEl.style, {
    position: 'fixed', top: '-9999px', left: '-9999px',
    width: `${width}px`, height: `${height}px`,
    overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none',
  });
  document.body.appendChild(hiddenEl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hiddenRendition = (book as any).renderTo(hiddenEl, {
    width, height, spread: 'none', flow: 'paginated', allowScriptedContent: true,
  });
  hiddenRendition.hooks.content.register((contents: unknown) => {
    const doc = (contents as { document: Document }).document;
    if (doc) applyTypographyToDoc(doc);
  });

  const counts = new Map<number, number>();
  const lastLinearItem = linearItems[linearItems.length - 1];
  lastLinearSpineIndex = lastLinearItem.index as number;
  try {
    for (const item of linearItems) {
      const href = item.href as string | undefined;
      const idx = item.index as number | undefined;
      if (!href || idx === undefined) continue;
      try {
        await hiddenRendition.display(href);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loc = (hiddenRendition as any).currentLocation?.();
        const d = loc?.start?.displayed as { page: number; total: number } | undefined;
        // 曾經在這裡加過「對最後一章逐頁模擬 next() 驗證真實可翻到的頁數」的邏輯，想解決
        // epub.js 量測出的 displayed.total 有時比實際可翻到的頁數多 1 的問題。拿掉的原因：
        // 這段驗證需要等待 hiddenRendition 的 relocated 事件，Android 上曾經因為事件遲遲不來
        // （逾時或時序問題）讓驗證迴圈在還沒真的翻完就提早中止，反而把這一章的頁數嚴重低估
        // （曾經整章只算出 1 頁），比原本「多算 1 頁」的問題更嚴重。改成完全信任 epub.js
        // 量出來的 displayed.total，多算的那 1 頁改交給 postRelocated 的 stuck-CFI 校正
        // （使用者翻到書尾、next() 真的卡住時才觸發，見該處說明）在使用者實際翻到那裡時修正，
        // 不在背景用模擬導覽的方式先驗證——代價是使用者翻到書尾要多按一次「下一頁」數字才會
        // 校正一致，但不會有把整章頁數算到只剩 1 頁這種更嚴重的錯誤。
        if (d) counts.set(idx, d.total);
      } catch {
        /* 這一章渲染失敗就略過，最後用已知章節的平均值當缺值的替代 */
      }
      // 讓出一個 tick，避免連續同步渲染整本書時完全佔滿主執行緒導致觸控/翻頁卡頓。
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { (hiddenRendition as any).destroy(); } catch { /* ignore */ }
    hiddenEl.remove();
  }

  if (counts.size === 0) return;
  // 極少數章節渲染失敗時，用已知章節的平均頁數當替代值，避免整本書頁數整段留白
  // （只補 linear 章節缺的值，non-linear 章節本來就不應該出現在 counts 裡）。
  if (counts.size < linearItems.length) {
    const avg = Math.round([...counts.values()].reduce((a, b) => a + b, 0) / counts.size);
    for (const item of linearItems) {
      const idx = item.index as number;
      if (!counts.has(idx)) counts.set(idx, avg);
    }
  }
  chapterPageCounts = counts;
  locationsReady = true;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postRelocated = (l: any, previousCfi: string | null) => {
      const displayed = l?.start?.displayed as { page: number; total: number } | undefined;
      if (!l?.start?.cfi || !displayed || !book) return;

      // l.start.displayed 的 page/total 只是「目前這個章節（spine item）」內部的頁碼，
      // 不是全書頁碼——書快翻到某一章結尾時 page 就會等於 total，導致每章結尾都會被
      // RN 端誤判成「整本書讀完」而顯示 100%／讀畢。過渡值（chapterPageCounts 還沒掃完前）用
      // 「章節索引 + 章內頁碼比例」概算，掃完後之後的 relocated 事件就會換成精確值。
      // epubjs 的 Spine 型別定義沒有列出 length（實際上 unpack() 時有設定這個欄位），只能用 any 存取。
      const spineLength = (book.spine as any).length as number;
      const fallbackPercentage = (l.start.index + (displayed.page - 1) / Math.max(displayed.total, 1)) / Math.max(spineLength, 1);

      // 全書頁碼／精確進度百分比：累加「目前章節之前」每一章已知的真實頁數（來自背景
      // scanAllChapterPages() 的 chapterPageCounts），加上目前章節內的 displayed.page——
      // 跟網頁版 Reader.tsx 的 accuratePage 計算方式一致，數值上會跟使用者實際翻頁動作 1:1。
      let page: number | null = null;
      let pageTotal: number | null = null;
      if (locationsReady) {
        // chapterPageCounts 現在只收錄 linear 章節（見 scanAllChapterPages 的說明），
        // non-linear 章節的 index 在這裡直接 ?? 0，不會計入頁碼／總頁數。
        let priorPages = 0;
        for (let i = 0; i < l.start.index; i++) priorPages += chapterPageCounts.get(i) ?? 0;
        page = priorPages + displayed.page;
        let totalPages = 0;
        for (let i = 0; i < spineLength; i++) totalPages += chapterPageCounts.get(i) ?? 0;
        pageTotal = Math.max(totalPages, page);
        // 保險 1：epub.js 自己判斷「已經到書尾」的 atEnd 旗標，真的到書尾時強制讓頁碼等於總頁數。
        if (l.atEnd) page = pageTotal;
        // 保險 2（實測抓到的真正情況）：epub.js 對同一章節，hiddenRendition 背景掃描量出來的
        // displayed.total 有時會比「使用者實際呼叫 next() 能翻到的最後位置」多 1 頁——這一章結尾
        // 可能有一段極短/空白內容，epub.js 的分頁量測演算法認為那還算一頁，但 next() 實際上翻不
        // 過去（CFI 完全沒變），此時 atEnd 也不會是 true（因為 epub.js 認為 displayed.page 還沒
        // 追上它自己量出的 displayed.total），使用者會卡在「第 315 頁／共 316 頁」翻不動也翻不完。
        // 偵測方式：剛剛呼叫的是 next()，但這次 relocated 的 cfi 跟呼叫前完全一樣，代表沒有真的
        // 翻動——這種情況下 page 已經是使用者能到達的最大值，把 pageTotal 降到跟 page 一致（而不是
        // 硬把 page 往上推，因為使用者手上的畫面內容就是停在這裡，沒有更多可以顯示的頁面了）。
        //
        // 只在「全書最後一個 linear 章節」才套用這個校正：實測發現 Android 上翻頁跨章節時，
        // 偶爾會有 relocated 事件回報跟前一次一樣的 CFI（不是真的卡住，馬上再翻一次就正常前進），
        // 如果不限制章節，這個校正會在書中間被誤觸發，把 pageTotal 錯誤地永久鎖死在當下頁碼，
        // 造成「畫面明明翻得動，但頁碼/總頁數卡住不動」的錯誤顯示（跟真正翻不到書尾是不同問題，
        // 這裡只處理真正的書尾情境）。
        if (
          lastNavDirection === 'next' &&
          previousCfi !== null &&
          l.start.cfi === previousCfi &&
          l.start.index === lastLinearSpineIndex
        ) {
          pageTotal = page;
        }
      }
      const percentage = page !== null && pageTotal !== null ? (page - 1) / Math.max(pageTotal - 1, 1) : fallbackPercentage;

      post({
        type: 'relocated',
        cfi: l.start.cfi,
        href: l.start.href ?? '',
        page,
        total: pageTotal,
        percentage: Math.max(0, Math.min(1, percentage)),
        atStart: Boolean(l.atStart),
        atEnd: Boolean(l.atEnd),
        chapterTitle: getChapterLabel(l.start.href ?? '', l.start.index),
      });
    };

    rendition.on('relocated', (loc: unknown) => {
      unlockNavSoon();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const previousCfi = (lastRelocatedLoc as any)?.start?.cfi ?? null;
      lastRelocatedLoc = loc;
      postRelocated(loc, previousCfi);
    });

    await book.ready;
    // 簡體判斷比照網頁版 Reader.tsx：zh-CN / zh-Hans / zh-SG，或單獨的 "zh"（不帶 region code）。
    // 一定要在 rendition.display() 之前判斷完成，因為 display() 會觸發 content hook 套用 script。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lang = ((book as any).package?.metadata?.language as string | undefined) ?? '';
    baseScript = /^zh$|zh[-_]?(cn|hans|sg)/i.test(lang) ? 'sc' : 'tc';
    post({ type: 'bookLanguageDetected', baseScript });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const navToc: any[] = (book.navigation as any)?.toc ?? [];
    tocCache = buildToc(navToc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spineHrefs = ((book.spine as any)?.items ?? []).map((item: any) => item.href as string);
    post({ type: 'tocLoaded', toc: tocCache });

    await rendition.display(cfi ?? undefined);
    // 全書精確頁數／進度百分比：背景跑 scanAllChapterPages()（見上方定義）。延後幾秒才開始，
    // 避開使用者開書後最常見的「馬上連續翻頁測試」這段時間，減少背景渲染跟使用者操作互搶
    // 主執行緒的機會；不 await，維持「不拖慢開書速度」的行為，期間的 relocated 事件會先用
    // postRelocated 裡的章節索引概算值頂著。
    (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        await scanAllChapterPages();
        // 主動用最近一次的位置重算並補送一次 relocated，避免使用者開書後沒有繼續翻頁
        // 就看不到頁數列（見上方 lastRelocatedLoc 宣告處的說明）。
        if (lastRelocatedLoc) postRelocated(lastRelocatedLoc, null);
      } catch {
        /* 背景掃描失敗不影響閱讀本身，忽略即可，頂多進度概算比較粗略，全書頁碼也會持續顯示為空 */
      }
    })();
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
  if (msg.type === 'goto') gotoTarget(msg.target);
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
