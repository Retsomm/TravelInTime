import ePub from 'epubjs';
import type { Book, Rendition } from 'epubjs';
import type { InboundMessage, OutboundMessage } from '../lib/readerMessages';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

let book: Book | null = null;
let rendition: Rendition | null = null;

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
const registerTapZone = (id: string, direction: 'prev' | 'next') => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
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
