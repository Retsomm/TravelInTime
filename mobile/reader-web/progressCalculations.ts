// 全書頁碼／精確進度百分比：比照網頁版 Reader.tsx 的 scanAllChapterPages/chapterPagesRef，
// 背景用一個隱藏的 hiddenRendition 依序 display() 每個 spine 章節，讀 epub.js 真正算出來的
// displayed.total（該章節在目前字級/行距/字距設定下的實際頁數，不是概算），加總起來就是全書
// 精確頁數，章節內 displayed.page 本身就是使用者「翻一次就走一個真正的頁面」，因此全書頁碼也會
// 精準跟著每次翻頁動作 1:1 增減。純計算部分抽出自 index.ts 原本的 postRelocated。
export interface ComputeProgressParams {
  startIndex: number;
  startCfi: string;
  displayedPage: number;
  displayedTotal: number;
  atEnd: boolean;
  spineLength: number;
  chapterPageCounts: Map<number, number>;
  locationsReady: boolean;
  lastNavDirection: 'prev' | 'next' | null;
  previousCfi: string | null;
  lastLinearSpineIndex: number | null;
}

export interface ComputedProgress {
  page: number | null;
  pageTotal: number | null;
  percentage: number;
}

export const computeProgress = ({
  startIndex,
  startCfi,
  displayedPage,
  displayedTotal,
  atEnd,
  spineLength,
  chapterPageCounts,
  locationsReady,
  lastNavDirection,
  previousCfi,
  lastLinearSpineIndex,
}: ComputeProgressParams): ComputedProgress => {
  // l.start.displayed 的 page/total 只是「目前這個章節（spine item）」內部的頁碼，
  // 不是全書頁碼——書快翻到某一章結尾時 page 就會等於 total，導致每章結尾都會被
  // RN 端誤判成「整本書讀完」而顯示 100%／讀畢。過渡值（chapterPageCounts 還沒掃完前）用
  // 「章節索引 + 章內頁碼比例」概算，掃完後之後的 relocated 事件就會換成精確值。
  const fallbackPercentage = (startIndex + (displayedPage - 1) / Math.max(displayedTotal, 1)) / Math.max(spineLength, 1);

  let page: number | null = null;
  let pageTotal: number | null = null;
  if (locationsReady) {
    // chapterPageCounts 現在只收錄 linear 章節，non-linear 章節的 index 在這裡直接
    // ?? 0，不會計入頁碼／總頁數。
    let priorPages = 0;
    for (let i = 0; i < startIndex; i++) priorPages += chapterPageCounts.get(i) ?? 0;
    page = priorPages + displayedPage;
    let totalPages = 0;
    for (let i = 0; i < spineLength; i++) totalPages += chapterPageCounts.get(i) ?? 0;
    pageTotal = Math.max(totalPages, page);
    // 保險 1：epub.js 自己判斷「已經到書尾」的 atEnd 旗標，真的到書尾時強制讓頁碼等於總頁數。
    if (atEnd) page = pageTotal;
    // 保險 2（實測抓到的真正情況）：epub.js 對同一章節，hiddenRendition 背景掃描量出來的
    // displayed.total 有時會比「使用者實際呼叫 next() 能翻到的最後位置」多 1 頁——這一章結尾
    // 可能有一段極短/空白內容，epub.js 的分頁量測演算法認為那還算一頁，但 next() 實際上翻不
    // 過去（CFI 完全沒變），此時 atEnd 也不會是 true，使用者會卡在「第 315 頁／共 316 頁」
    // 翻不動也翻不完。偵測方式：剛剛呼叫的是 next()，但這次 relocated 的 cfi 跟呼叫前完全
    // 一樣，代表沒有真的翻動——這種情況下 page 已經是使用者能到達的最大值，把 pageTotal
    // 降到跟 page 一致。只在「全書最後一個 linear 章節」才套用這個校正，避免書中間翻頁跨
    // 章節時偶發的重複 CFI 誤觸發這個校正，把 pageTotal 錯誤地永久鎖死在當下頁碼。
    if (lastNavDirection === 'next' && previousCfi !== null && startCfi === previousCfi && startIndex === lastLinearSpineIndex) {
      pageTotal = page;
    }
  }
  const percentage = page !== null && pageTotal !== null ? (page - 1) / Math.max(pageTotal - 1, 1) : fallbackPercentage;

  return { page, pageTotal, percentage: Math.max(0, Math.min(1, percentage)) };
};
