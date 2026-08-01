import ePub from 'epubjs';
import type { Book, Rendition } from 'epubjs';
import type { AnnotationMark, InboundMessage, OutboundMessage, TocItem } from '../lib/readerMessages';
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from '../lib/readerSettings';
import { addAnnotationMark, diffAnnotations, reinjectAllAnnotations, removeAnnotationMark, verifyAnnotationsRendered } from './annotationUtils';
import { computeProgress } from './progressCalculations';
import { applyDarkOverride, applyTypographyToDoc, applyWritingModeOverride } from './readerStyles';
import { buildToc, getChapterLabel, resolveNavTarget } from './tocLookup';
import { shouldAutoAdvancePage } from './ttsFollowCalculations';
import {
  clearTTSHighlight,
  createRangeFromTextOffset,
  ensureTTSHighlightStyle,
  getBoundaryOffsetFromRange,
  getTextIndex,
  paintTTSHighlightOverlay,
} from './ttsHighlight';

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
// baseScriptRef）。轉換/還原都要拿這個當基準，不能寫死假設書本原始文字一定是繁體。
let baseScript: TypographySettings['script'] = 'tc';
const contentDocs = new Set<Document>();

// 全書頁碼／精確進度百分比背景掃描狀態，詳見 progressCalculations.ts 開頭的說明。
let chapterPageCounts: Map<number, number> = new Map();
let locationsReady = false;
// 最近一次 relocated 事件的原始 loc 物件，供背景掃描跑完後主動重算一次全書頁碼並補送——若使用者
// 開書後沒有繼續翻頁，光是掃描完成這件事本身不會觸發新的 relocated 事件，若不補送，頁數列會一直
// 卡在「還沒出現」。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastRelocatedLoc: any = null;
// 全書最後一個 linear 章節的 spine index（由 scanAllChapterPages 設定）。postRelocated 的
// stuck-CFI 校正只在這一章才會生效，見 progressCalculations.ts 的說明。
let lastLinearSpineIndex: number | null = null;
// 每次 loadBook 換書時遞增，scanAllChapterPages 完成時比對這個值，避免舊書的背景掃描
// 在使用者已經換到新書之後才跑完，把新書的 chapterPageCounts 覆寫成舊書算出來的頁數。
let loadGeneration = 0;

// 章節目錄快取（目錄面板顯示用）與 spine href 順序，供 tocLookup.ts 的純函數查找章節標題用。
let tocCache: TocItem[] = [];
let spineHrefs: string[] = [];

const pruneStaleContentDocs = () => {
  // contentDocs 只在 rendition.hooks.content 觸發時新增，epub.js 目前版本的 view manager
  // 從不 emit MANAGERS.REMOVED，hooks.unloaded 永遠不會觸發，所以無法用官方的卸載事件清掉
  // 舊 iframe 的 document；改成每次套用樣式前順手清掉已經卸載的 iframe（doc.defaultView 會
  // 在 iframe 從 DOM 移除後變成 null）。
  contentDocs.forEach((doc) => {
    if (!doc.defaultView) contentDocs.delete(doc);
  });
};

const setTypography = (next: TypographySettings) => {
  typography = next;
  pruneStaleContentDocs();
  contentDocs.forEach((doc) => applyTypographyToDoc(doc, typography, baseScript));
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

// 暫時性診斷用（比照先前翻頁/目錄跳轉除錯時的做法，見 RN_SETUP_GUIDE.md 第十四／十七輪），
// 確認穩定後應該移除。這份 bundle 沒有區分 dev/production 建置，預設關閉避免觸控座標／
// 選取文字內容經由 RN bridge 外流；需要除錯時手動改成 true 再跑 `yarn build:reader`。
const DEBUG_BRIDGE = false;
const debugLog = (...args: unknown[]) => {
  if (!DEBUG_BRIDGE) return;
  post({ type: 'debug', message: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') });
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
// 見 progressCalculations.ts 內 stuck-CFI 校正的說明。
let lastNavDirection: 'prev' | 'next' | null = null;

// 連續幾次呼叫 next() 但 CFI 完全沒變的次數。progressCalculations.ts 的 stuck-CFI 校正只處理
// 「全書最後一章」的頁碼顯示；但同一種 epub.js 分頁量測誤差（章節結尾有極短/空白內容，
// next() 實際上翻不過去）理論上任何一章都可能發生，不是只有最後一章。朗讀跟讀跨章節時
// （RN 端 useTTSReading.ts 的 advanceToNextChapter）完全依賴 next() 真的能翻過章節邊界，
// 一旦卡在這種「翻不動的最後一頁」，href 永遠不會變、也不是真正的全書結尾（atEnd 不會是
// true），會導致朗讀在這一章結束後直接無聲停住。這裡偵測到連續兩次真的卡住（排除偶發的
// 單次重複 CFI，那多半下一次 next() 就正常前進，見 progressCalculations.ts 的說明），就直接
// 用跟書籤／目錄跳轉相同的 rendition.display() 跳過去下一個 linear 章節，繞過卡住的分頁翻頁。
let consecutiveStuckNext = 0;

const findNextLinearHref = (afterIndex: number): string | null => {
  if (!book) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spineItems = ((book.spine as any)?.items ?? []) as any[];
  const next = spineItems.find((item) => item.index > afterIndex && item.linear !== 'no');
  return next?.href ?? null;
};

const turnPage = (direction: 'prev' | 'next') => {
  if (navBusy || !rendition) return;
  lockNav();
  lastNavDirection = direction;
  const action = direction === 'prev' ? rendition.prev() : rendition.next();
  Promise.resolve(action)
    .then(() => unlockNavSoon())
    .catch(() => unlockNav());
};

// 朗讀跟讀高亮／精確頁面邊界自動翻頁：比照網頁版 Reader.tsx 的 updateTTSHighlight／
// followTTSRange。RN 端只負責把 expo-speech 的 onBoundary charIndex（相對於整章文字的
// 絕對位移）轉送過來，實際的「畫底線標記在朗讀中的句子下方」與「快讀到頁尾就翻頁」都在
// 這裡完成——因為只有這裡才有 epub.js 的 rendition／DOM 可以用。
const getVisibleDoc = (): Document | null => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents = (rendition as any)?.getContents?.() as { document: Document }[] | undefined;
  return contents?.[0]?.document ?? null;
};

let ttsDoc: Document | null = null;
let ttsPageStartOffset: number | null = null;
let ttsPageEndOffset: number | null = null;
let ttsAutoFollowBusy = false;
let ttsAutoFollowLastAt = 0;
let ttsAutoFollowFallbackTimer: ReturnType<typeof setTimeout> | null = null;
const TTS_PAGE_END_LEAD = 8;
const TTS_AUTO_FOLLOW_THROTTLE = 650;

const measurePageEdgeOffset = (doc: Document, edge: 'start' | 'end'): number | null => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loc = (rendition as any)?.currentLocation?.();
  const cfi = loc?.[edge]?.cfi as string | undefined;
  if (!cfi || !rendition) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const range = (rendition as any).getRange?.(cfi) as Range | null | undefined;
    return getBoundaryOffsetFromRange(doc, range, edge);
  } catch {
    return null;
  }
};

const refreshTTSPageBounds = () => {
  if (!ttsDoc) return;
  ttsPageStartOffset = measurePageEdgeOffset(ttsDoc, 'start');
  ttsPageEndOffset = measurePageEdgeOffset(ttsDoc, 'end');
};

// RN 端每次開始朗讀新的一章（或從暫停恢復）都會送一次 ttsStart：以目前可見的 iframe
// document 為朗讀對象，記住它並量出目前頁面的字元邊界，供後續 boundary 事件比對。
const startTTSTracking = () => {
  ttsDoc = getVisibleDoc();
  ttsAutoFollowBusy = false;
  ttsAutoFollowLastAt = 0;
  refreshTTSPageBounds();
};

const stopTTSTracking = () => {
  if (ttsDoc) clearTTSHighlight(ttsDoc);
  ttsDoc = null;
  ttsPageStartOffset = null;
  ttsPageEndOffset = null;
  ttsAutoFollowBusy = false;
  if (ttsAutoFollowFallbackTimer) {
    clearTimeout(ttsAutoFollowFallbackTimer);
    ttsAutoFollowFallbackTimer = null;
  }
};

const handleTTSBoundary = (charIndex: number) => {
  // ttsDoc.defaultView 在 iframe 從 DOM 移除後會變成 null（比照 pruneStaleContentDocs
  // 的判斷）——章節朗讀完後舊 iframe 可能已經被 epub.js 卸載，這裡的殘餘 boundary 事件
  // 直接略過，不強制存取已卸載文件。
  if (!ttsDoc || !ttsDoc.defaultView) return;
  ensureTTSHighlightStyle(ttsDoc);
  const range = createRangeFromTextOffset(ttsDoc, charIndex);
  if (range) paintTTSHighlightOverlay(ttsDoc, range);

  const shouldAdvance = shouldAutoAdvancePage({
    charIndex,
    isVisibleDocMatch: getVisibleDoc() === ttsDoc,
    autoFollowBusy: ttsAutoFollowBusy,
    pageStartOffset: ttsPageStartOffset,
    pageEndOffset: ttsPageEndOffset,
    lead: TTS_PAGE_END_LEAD,
    now: Date.now(),
    lastFollowAt: ttsAutoFollowLastAt,
    throttleMs: TTS_AUTO_FOLLOW_THROTTLE,
  });
  if (!shouldAdvance) return;

  ttsAutoFollowLastAt = Date.now();
  ttsAutoFollowBusy = true;
  turnPage('next');
  // 正常情況下下面 rendition.on('relocated') 的處理會在翻頁完成後立刻解鎖並重新量測頁面
  // 邊界；這裡的逾時只是保險，避免 relocated 因故沒有觸發（例如已經翻到全書最後一頁）
  // 導致自動翻頁永久卡死。
  if (ttsAutoFollowFallbackTimer) clearTimeout(ttsAutoFollowFallbackTimer);
  ttsAutoFollowFallbackTimer = setTimeout(() => {
    ttsAutoFollowBusy = false;
    refreshTTSPageBounds();
  }, 2000);
};

// 目錄／書籤跳轉：直接呼叫 rendition.display(target)。
// 踩過的坑：先前這裡完全沒有經過 navBusy 忙碌鎖，如果使用者剛翻頁、忙碌鎖還沒解開（
// unlockNavSoon 的 250ms 緩衝內）就馬上點目錄章節，會變成 display() 跟前一次 next()/prev()
// 同時操作 epub.js 內部狀態——這正是 navBusy 鎖原本要擋的那種情況，表現出來就是「點章節
// 沒反應／跳轉失敗」。改成用短輪詢等待目前的忙碌鎖解開後才真的執行，而不是直接略過——
// 章節/書籤跳轉是使用者明確的單次意圖，不應該像翻頁那樣「忙碌中就丟棄」。
const gotoTarget = async (rawTarget: string) => {
  if (!rendition) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spineItems = book ? (((book.spine as any)?.items ?? []) as any[]) : [];
  const target = book ? resolveNavTarget(spineItems, rawTarget) : rawTarget;
  let waited = 0;
  while (navBusy && waited < 2000) {
    await new Promise<void>((r) => setTimeout(r, 50));
    waited += 50;
  }
  lockNav();
  Promise.resolve(rendition.display(target))
    .then(() => {
      unlockNavSoon();
      // 書籤／目錄／註記清單點擊觸發的跳轉是這裡唯一的入口。epub.js 的 DefaultViewManager
      // 在「目標章節其實就是目前已經顯示中的那個 view」時（例如跳去同一章節裡的另一個
      // 註記位置），會直接呼叫 scrollTo()/moveTo() 而完全不重建 view，因此不會觸發
      // hooks.render／hooks.content（Annotations 类别就是掛在這兩個 hook 上自動重掛標記
      // 的），rendition 的 'relocated' 事件雖然還是會照常發出，但畫面上原本就該有的標記
      // 如果因為某次「真正」的章節切換而被 detach 過，就再也沒有機會被自動補回來。改成
      // 每次明確跳轉完成後都直接強制 reinject 目前可見章節的所有標記（不是「檢查缺漏才
      // 補」，因為這條路徑無法保證缺漏檢查一定跑得到），確保只要有標記資料，跳轉過去就
      // 一定看得到。
      setTimeout(() => reinjectAllAnnotations(rendition, debugLog, 'goto'), 350);
    })
    .catch(() => unlockNav());
};

// 翻頁手勢：點擊畫面最外層（非 epub.js 內容 iframe）的左三分之一／右三分之一區塊翻頁，
// 中間三分之一保留給文字選取／劃線註記手勢使用（見 setAnnotationMode 的說明）。
const setAnnotationMode = (enabled: boolean) => {
  debugLog('[setAnnotationMode]', enabled);
  ['tap-zone-prev', 'tap-zone-next'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.pointerEvents = enabled ? 'none' : 'auto';
  });
};

const registerTapZone = (id: string, baseDirection: 'prev' | 'next') => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
    debugLog('[tap-zone]', id, '被點擊，觸發翻頁（提醒：這塊區域會整個擋掉底下的文字選取手勢）');
    const direction = typography.readingDirection === 'rtl'
      ? (baseDirection === 'prev' ? 'next' : 'prev')
      : baseDirection;
    turnPage(direction);
  });
};

// 劃線註記：WebView 端只負責「畫出目前這份清單長什麼樣子」，annotations 陣列本身以 RN 端／
// AsyncStorage 為唯一資料來源；每次新增/改色/刪除都整批送一次目前完整清單，讓這裡的
// applyAnnotations() 用 diffAnnotations() 比對差異決定要新增/移除哪些標記。
// rendition.annotations 內部會在 hooks.render 自動把已加入的標記重新套用到每個新渲染的
// 章節/頁面 iframe，不需要在換頁時手動重掛。
let renderedAnnotations = new Map<string, AnnotationMark>();

const applyAnnotations = (list: AnnotationMark[]) => {
  debugLog('[applyAnnotations] 收到清單，共', list.length, '筆，目前畫面上有', renderedAnnotations.size, '筆');
  if (!rendition) {
    debugLog('[applyAnnotations] 略過：rendition 尚未就緒');
    return;
  }
  const { toRemove, toAdd } = diffAnnotations(renderedAnnotations, list);
  toRemove.forEach((ann) => removeAnnotationMark(rendition, debugLog, ann));
  // 只有 addAnnotationMark 回報成功（underline() 沒有拋例外）的標記才記進
  // renderedAnnotations；underline() 失敗時若仍記成「已渲染」，下次 applyAnnotations 收到
  // 同一份未變更的標記會誤判成「已存在且沒變」而完全跳過重試，永遠補不回來。
  const failedIds = new Set<string>();
  toAdd.forEach((ann) => {
    if (!addAnnotationMark(rendition, post, debugLog, ann)) failedIds.add(ann.id);
  });
  renderedAnnotations = new Map(list.filter((a) => !failedIds.has(a.id)).map((a) => [a.id, a]));
};

// 使用者點空白處/開始劃下一段選取時，清掉目前顯示中章節 iframe 的原生選取範圍，
// 讓畫面上的藍色選取反白消失（劃線動作完成後改由 addAnnotationMark 畫出的底線標記接手）。
const clearNativeSelection = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents = (rendition as any)?.getContents?.() as { window: Window }[] | undefined;
  contents?.forEach((c) => c.window?.getSelection()?.removeAllRanges());
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
// 呼叫 section.unload()，只有 Locations.generate() 才會，所以共用 book 不會干擾主 rendition），
// 依序 display() 每個 spine 章節，讀 epub.js 算出來的 displayed.total（該章節在目前排版設定下
// 的真實頁數）加總，取代原本用字元數概算的作法。
//
// 只掃描 item.linear === 'yes' 的章節：epub.js 的 rendition.next()/prev() 實際上只會在
// linear 章節之間移動，non-linear 章節（例如版權頁/附錄）會被完全跳過，使用者靠翻頁永遠
// 到不了，若不排除會讓全書總頁數把使用者翻頁永遠碰不到的頁面也算進去。
const scanAllChapterPages = async (generation: number, targetBook: Book) => {
  if (!book || book !== targetBook) return;
  const viewer = document.getElementById('viewer');
  if (!viewer) return;
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spineItems = ((book.spine as any)?.items ?? []) as any[];
  const linearItems = spineItems.filter((item) => item.linear === 'yes');
  if (!linearItems.length || width <= 0 || height <= 0) return;

  const lastLinearItem = linearItems[linearItems.length - 1];
  lastLinearSpineIndex = lastLinearItem.index as number;

  // 隱藏掃描用的 rendition 只是背景讀取分頁結果，使用者看不到也不會互動，預設不需要
  // 執行書本內容裡的腳本。極少數 EPUB 版面完全靠腳本才能正確分頁、關閉腳本會讓每一章
  // 都掃不出頁數，這種情況才退回開著腳本重掃一次。
  const runScan = async (allowScriptedContent: boolean) => {
    const hiddenEl = document.createElement('div');
    Object.assign(hiddenEl.style, {
      position: 'fixed', top: '-9999px', left: '-9999px',
      width: `${width}px`, height: `${height}px`,
      overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none',
    });
    document.body.appendChild(hiddenEl);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hiddenRendition = (book as any).renderTo(hiddenEl, {
      width, height, spread: 'none', flow: 'paginated', allowScriptedContent,
    });
    hiddenRendition.hooks.content.register((contents: unknown) => {
      const doc = (contents as { document: Document }).document;
      if (doc) applyTypographyToDoc(doc, typography, baseScript);
    });

    const scanCounts = new Map<number, number>();
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
          if (d) scanCounts.set(idx, d.total);
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
    return scanCounts;
  };

  let counts = await runScan(false);
  if (counts.size === 0) counts = await runScan(true);
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
  // 掃描期間使用者可能已經換了下一本書，此時 generation 已經不吻合，不能再把這批
  // 舊書算出來的頁數寫進全域狀態（否則會覆蓋新書自己的 chapterPageCounts）。
  if (generation !== loadGeneration || book !== targetBook) return;
  chapterPageCounts = counts;
  locationsReady = true;
};

const loadBook = async (base64: string, cfi: string | null, initialAnnotations: AnnotationMark[]) => {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  const generation = ++loadGeneration;
  chapterPageCounts = new Map();
  locationsReady = false;
  lastRelocatedLoc = null;
  lastLinearSpineIndex = null;
  renderedAnnotations = new Map();
  stopTTSTracking();

  try {
    book = ePub(base64ToArrayBuffer(base64));
    const currentBook = book;
    rendition = book.renderTo(viewer, {
      width: viewer.clientWidth,
      height: viewer.clientHeight,
      spread: 'none',
      flow: 'paginated',
      // epub.js 預設把內容 iframe 的 sandbox 設為只有 allow-same-origin（沒有 allow-scripts）。
      // 在 iOS 的 WKWebView 上，這會連帶擋掉從外層掛在該 iframe document 上的事件監聽器
      // （touchstart/touchend、pointerdown/pointerup）被呼叫，導致滑動翻頁完全沒反應。
      // Android 的 WebView（Chromium）沒有這個限制。
      allowScriptedContent: true,
    });
    const currentRendition = rendition;

    // 部分書本（尤其直式排版的中文書）OPF spine 帶 page-progression-direction="rtl"，
    // epub.js 在 rendition 啟動時會據此自動把整個 rendition 設成「從右到左」翻頁——
    // 不只是文字方向，連 manager 的 next()/prev() 捲動方向、分頁欄位的填色順序都會反過來。
    // 這裡永遠強制成 ltr，不跟著使用者設定面板的「翻頁方向」偏好走：epub.js 的分頁引擎
    // （contents.js columns()）跟 manager 的 next()/prev() 是用同一個 direction 值決定 CSS
    // 多欄排版順序跟捲動方向要不要反過來，這個 direction 一旦設成 rtl，內文的 CSS 排版
    // （欄位順序、text-align/bidi）也會跟著整個鏡射變成靠右、行內文字順序顛倒——但「翻頁
    // 方向」這個設定在使用者的認知裡只是「往哪滑算是下一頁」的操作偏好，不應該連動影響內文
    // 排版本身要不要鏡射。所以兩者要拆開：epub.js 內部的 direction 永遠固定 ltr（讓內文
    // 排版跟分頁邏輯保持正常、一致），使用者的翻頁方向偏好只透過 RN 端滑動手勢呼叫
    // next/prev 時的方向對應去實現，不會碰到這裡。
    // 這段必須在第一次 rendition.display() 之前完成（見下方 await forceReadingDirection）：
    // epub.js 的 rendition.direction() 內部若偵測到 manager 已經 render 過
    // （this.manager.isRendered() && this.location 皆為真），會自動觸發
    // this.manager.clear() + this.display(this.location.start.cfi) 重新導頁一次。原本這裡
    // 沒有 await，跟下面的 rendition.display(cfi) 各自非同步進行，執行順序取決於 promise
    // microtask 排程而非程式碼順序，一旦 display() 先跑完，接著才跑到這裡的
    // direction()/layout() 就會在使用者剛打開書時觸發一次「強制翻頁」的重新導頁（表現成
    // 「一開始就強制往左翻頁，然後翻到看似章節末頁又跳回第一頁」）。
    const forceReadingDirection = currentRendition.started.then(() => {
      if (generation !== loadGeneration) return;
      try {
        const direction = 'ltr' as const;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const globalLayoutProperties = (currentRendition.settings as any).globalLayoutProperties;
        const props = { ...globalLayoutProperties, direction };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (currentRendition.settings as any).globalLayoutProperties = props;
        currentRendition.direction(direction);
        currentRendition.layout(props);
      } catch (err) {
        // 方向修正失敗不該卡住開書：寧可維持這本書可能沒被修正的原始翻頁方向，
        // 也要讓下面等待這個 promise 的 display() 繼續執行。
        debugLog('[forceReadingDirection] 方向修正失敗，略過', err);
      }
    }).catch((err) => {
      debugLog('[forceReadingDirection] rendition.started 失敗，略過方向修正', err);
    });

    // 每次章節內容渲染（換頁/換章節都會重新渲染 iframe 內容）時套用目前的深色模式狀態，
    // 並記錄這份 document 供 setDarkMode 之後即時切換時重新套用（不必等下次換頁）。
    rendition.hooks.content.register((contents: unknown) => {
      const doc = (contents as { document: Document }).document;
      if (!doc) return;
      contentDocs.add(doc);
      applyDarkOverride(doc, darkMode);
      applyTypographyToDoc(doc, typography, baseScript);
      // 內文排版方向永遠固定 ltr，理由同上面 forceReadingDirection 的說明——不跟隨
      // 使用者的翻頁方向偏好，那個偏好只影響滑動手勢要呼叫 next 還是 prev
      applyWritingModeOverride(doc, 'ltr');
      // epub.js 的 Contents 類別本身只在「選取範圍非空」時才會 emit 'selected'，使用者點掉
      // 選取／選取範圍收合完全沒有對應事件可以監聽，因此另外自己掛一個 selectionchange，
      // 只在偵測到「收合」時回報給 RN 端關閉選取操作列，不跟 epub.js 內建的 250ms debounce
      // 邏輯衝突（各自關注不同的狀態轉換）。
      doc.addEventListener('selectionchange', () => {
        const sel = doc.defaultView?.getSelection();
        debugLog('[selectionchange]', 'collapsed=', sel?.isCollapsed ?? 'no-selection', 'text=', sel?.toString().slice(0, 20) ?? '');
        if (!sel || sel.isCollapsed) post({ type: 'selectionCleared' });
      });
      doc.addEventListener('touchstart', (e: TouchEvent) => {
        const t = e.touches[0];
        debugLog('[content touchstart]', 'x=', Math.round(t?.clientX ?? -1), 'y=', Math.round(t?.clientY ?? -1));
      });
      // 每次新章節/頁面內容渲染完，順便確認這一頁該顯示的標記是不是真的有畫出來——
      // epub.js 的 Annotations 類別本身也是掛在 hooks.render 自動重掛標記，可能有「render
      // 觸發時 contents 還沒完全就緒」的競態，這裡用同一套 verify+reinject 補一次保險。
      setTimeout(() => verifyAnnotationsRendered(rendition, debugLog, renderedAnnotations, 'content-rendered'), 300);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postRelocated = (l: any, previousCfi: string | null) => {
      const displayed = l?.start?.displayed as { page: number; total: number } | undefined;
      if (!l?.start?.cfi || !displayed || !book) return;
      // epubjs 的 Spine 型別定義沒有列出 length（實際上 unpack() 時有設定這個欄位），只能用 any 存取。
      const spineLength = (book.spine as any).length as number;

      const { page, pageTotal, percentage } = computeProgress({
        startIndex: l.start.index,
        startCfi: l.start.cfi,
        displayedPage: displayed.page,
        displayedTotal: displayed.total,
        atEnd: Boolean(l.atEnd),
        spineLength,
        chapterPageCounts,
        locationsReady,
        lastNavDirection,
        previousCfi,
        lastLinearSpineIndex,
      });

      post({
        type: 'relocated',
        cfi: l.start.cfi,
        href: l.start.href ?? '',
        page,
        total: pageTotal,
        percentage,
        atStart: Boolean(l.atStart),
        atEnd: Boolean(l.atEnd),
        chapterTitle: getChapterLabel(tocCache, spineHrefs, l.start.href ?? '', l.start.index),
      });
    };

    rendition.on('relocated', (loc: unknown) => {
      unlockNavSoon();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const previousCfi = (lastRelocatedLoc as any)?.start?.cfi ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const locAny = loc as any;
      const stuckOnNext = lastNavDirection === 'next' && previousCfi !== null && locAny?.start?.cfi === previousCfi;
      lastRelocatedLoc = loc;
      postRelocated(loc, previousCfi);
      if (stuckOnNext) {
        consecutiveStuckNext += 1;
        if (consecutiveStuckNext >= 2 && !locAny?.atEnd) {
          consecutiveStuckNext = 0;
          const nextHref = findNextLinearHref(locAny?.start?.index ?? -1);
          if (nextHref) {
            debugLog('[relocated] next() 連續卡住同一個 CFI，直接跳到下一章', nextHref);
            gotoTarget(nextHref);
          }
        }
      } else {
        consecutiveStuckNext = 0;
      }
      // 從書籤／目錄／註記清單等其他畫面跳轉（gotoTarget → rendition.display(cfi)）時，
      // 若目標落在目前已經渲染過、epub.js 判斷不需要重建 iframe 內容的章節（例如相鄰的
      // 預先渲染 view），hooks.content 就不會再觸發，上面掛在 hooks.content 裡的
      // verify+reinject 保險完全不會執行到，導致跳轉過去卻看不到既有的劃線標記（比照
      // Electron 版 renderer/src/hooks/reader/useReaderEngine.ts 踩過的同一顆坑，這裡補上
      // 同樣綁在 relocated 事件的補救檢查——不論這次換位置有沒有重新渲染 iframe，只要
      // 「目前所在章節」變了就再檢查一次）。
      setTimeout(() => verifyAnnotationsRendered(rendition, debugLog, renderedAnnotations, 'relocated'), 300);
      // 朗讀中的章節如果還是目前可見章節，翻頁完成後重新量測新頁面的字元邊界，並解除
      // 自動翻頁的忙碌鎖（不論這次翻頁是自動跟讀觸發還是使用者手動翻頁都要重新量測，
      // 因為兩種情況下「目前頁面」都變了）；如果朗讀中的章節已經不是目前可見章節
      // （使用者手動跳走），只清掉底線標記，不再嘗試量測。
      if (ttsDoc) {
        if (getVisibleDoc() === ttsDoc) {
          refreshTTSPageBounds();
          ttsAutoFollowBusy = false;
          if (ttsAutoFollowFallbackTimer) {
            clearTimeout(ttsAutoFollowFallbackTimer);
            ttsAutoFollowFallbackTimer = null;
          }
        } else {
          clearTTSHighlight(ttsDoc);
        }
      }
    });

    // 文字選取 → 劃線註記的第一步：epub.js 已經幫忙把選取範圍換算成 CFI 字串，
    // 不需要自己手動用 range.getBoundingClientRect() 去換算螢幕座標——選取彈出操作列
    // 改用畫面底部固定列（見 RN 端 SelectionBar），完全不需要精確定位在選取文字旁邊。
    rendition.on('selected', (cfiRange: string, contents: unknown) => {
      debugLog('[rendition selected]', 'cfiRange=', cfiRange.slice(0, 40));
      const c = contents as { window: Window };
      const selection = c.window?.getSelection();
      if (!selection || selection.isCollapsed) {
        debugLog('[rendition selected] 略過：selection 為空或已收合');
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        debugLog('[rendition selected] 略過：selection.toString() 是空字串');
        return;
      }
      debugLog('[rendition selected] 送出 textSelected，text=', text.slice(0, 20));
      post({ type: 'textSelected', cfi: cfiRange, text });
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

    // 等待上面的翻頁方向修正完成，確保第一次 display() 不會跟 direction()/layout()
    // 內部可能觸發的重新導頁互相搶跑
    await forceReadingDirection;
    // 等待期間使用者可能已經觸發下一次 loadBook（換書），generation 已經不吻合時
    // 不能再對這個已經過時的 rendition 呼叫 display／套用 annotations。
    if (generation !== loadGeneration) return;
    await rendition.display(cfi ?? undefined);
    applyAnnotations(initialAnnotations);
    // 全書精確頁數／進度百分比：背景跑 scanAllChapterPages()（見上方定義）。延後幾秒才開始，
    // 避開使用者開書後最常見的「馬上連續翻頁測試」這段時間，減少背景渲染跟使用者操作互搶
    // 主執行緒的機會；不 await，維持「不拖慢開書速度」的行為，期間的 relocated 事件會先用
    // postRelocated 裡的章節索引概算值頂著。
    (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        await scanAllChapterPages(generation, currentBook);
        if (generation !== loadGeneration) return;
        // 主動用最近一次的位置重算並補送一次 relocated，避免使用者開書後沒有繼續翻頁
        // 就看不到頁數列。
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
// 不只是目前可見的那一頁）。用 getTextIndex() 而不是 cloneNode+regex 正規化空白，是因為朗讀
// 跟讀高亮需要拿 expo-speech 回報的 charIndex（相對於這段文字的絕對位移）反查回真正的 DOM
// 文字節點畫底線——如果先把文字正規化，字元位移就會跟 getTextIndex() 量出來的原始 DOM 位移
// 對不上，畫底線的位置也會跟著錯位。
//
// startOffset：目前可見那一頁在整章文字裡的起始字元位移，讓朗讀從使用者正在看的這一頁開始
// 念，而不是永遠從章節第 0 個字開始；量不出來就退回 0。回傳的 text 已經是切過的「從當前頁
// 開始」文字，RN 端呼叫 tts.speak() 時 expo-speech 回報的 charIndex 是相對於這段切過的文字，
// 所以要送回 startOffset 讓呼叫端把 charIndex 加回去，才能對應到這裡量出、相對於整章文字的
// 絕對位移（handleTTSBoundary 用的就是這個絕對值）。
const getChapterText = (): { text: string; startOffset: number } => {
  const doc = getVisibleDoc();
  if (!doc?.body) return { text: '', startOffset: 0 };
  const fullText = getTextIndex(doc)?.text ?? '';
  const startOffset = measurePageEdgeOffset(doc, 'start') ?? 0;
  return { text: fullText.slice(startOffset), startOffset };
};

const handleMessage = (event: MessageEvent<string>) => {
  let msg: InboundMessage;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }
  if (msg.type === 'load') loadBook(msg.base64, msg.cfi, msg.annotations);
  if (msg.type === 'prev') turnPage('prev');
  if (msg.type === 'next') turnPage('next');
  if (msg.type === 'goto') gotoTarget(msg.target);
  if (msg.type === 'extractMeta') extractMeta(msg.base64);
  if (msg.type === 'setDarkMode') setDarkMode(msg.darkMode);
  if (msg.type === 'setTypography') {
    const { type: _type, ...settings } = msg;
    setTypography(settings);
  }
  if (msg.type === 'getChapterText') {
    const { text, startOffset } = getChapterText();
    post({ type: 'chapterText', text, startOffset });
  }
  if (msg.type === 'setAnnotations') applyAnnotations(msg.annotations);
  if (msg.type === 'clearSelection') {
    debugLog('[clearSelection] 收到訊息');
    clearNativeSelection();
  }
  if (msg.type === 'setAnnotationMode') setAnnotationMode(msg.enabled);
  if (msg.type === 'ttsStart') startTTSTracking();
  if (msg.type === 'ttsBoundary') handleTTSBoundary(msg.charIndex);
  if (msg.type === 'ttsStop') stopTTSTracking();
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
