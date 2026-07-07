// 朗讀跟隨螢光色閃爍問題比照網頁版修法：純粹依「目前朗讀到的字元位移是否已接近頁尾」判斷
// 是否該自動翻頁，抽出自 index.ts 原本的 handleTTSBoundary，供其在畫底線與呼叫 turnPage
// 之前先做這個純判斷。
export interface ShouldAutoAdvancePageParams {
  charIndex: number;
  isVisibleDocMatch: boolean;
  autoFollowBusy: boolean;
  pageStartOffset: number | null;
  pageEndOffset: number | null;
  lead: number;
  now: number;
  lastFollowAt: number;
  throttleMs: number;
}

export const shouldAutoAdvancePage = ({
  charIndex,
  isVisibleDocMatch,
  autoFollowBusy,
  pageStartOffset,
  pageEndOffset,
  lead,
  now,
  lastFollowAt,
  throttleMs,
}: ShouldAutoAdvancePageParams): boolean => {
  // 使用者若在朗讀中手動跳去別的章節，目前可見的 document 已經不是朗讀中的 ttsDoc，
  // 不應該再自動翻頁去追朗讀進度（那樣會把使用者剛跳去的畫面搶走）。
  if (!isVisibleDocMatch) return false;
  if (autoFollowBusy) return false;
  if (pageEndOffset === null) return false;
  // 觸發翻頁的位移量比頁尾實際字元位移提前一點點，讓翻頁動作跟朗讀到頁尾幾乎同時完成，
  // 而不是朗讀完頁尾最後一個字才觸發（會感覺翻頁慢半拍）。
  const turnAt = Math.max(pageStartOffset ?? 0, pageEndOffset - lead);
  if (charIndex < turnAt) return false;
  if (now - lastFollowAt < throttleMs) return false;
  return true;
};
