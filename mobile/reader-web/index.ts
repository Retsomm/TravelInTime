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
      if (!l?.start?.cfi || !displayed) return;
      post({
        type: 'relocated',
        cfi: l.start.cfi,
        page: displayed.page,
        total: displayed.total,
        atStart: Boolean(l.atStart),
        atEnd: Boolean(l.atEnd),
      });
    });

    await book.ready;
    await rendition.display(cfi ?? undefined);
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
