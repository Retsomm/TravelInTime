# PWA TTS 自動跟隨翻頁穩定化紀錄

日期：2026-04-30

## 問題

PWA 閱讀器的 TTS 自動跟隨翻頁，在同步朗讀註解與 epub.js 分頁時出現多種不穩定狀況：

- 使用固定字元緩衝時，會依版面不同而提早或延遲翻頁。
- 使用 `Range.getClientRects()` 的幾何觸發，在 epub.js 欄位分頁下不可靠。
- 自動翻頁與使用者手動翻頁的狀態曾經互相干擾。
- `end.cfi` 有時會對應到比視覺頁尾更後面的文字位置。
- 全域學習翻頁比例會過度校正，造成提早翻頁。

## 最終 PWA 做法

- TTS 的 `absoluteOffset` 是唯一朗讀進度來源。
- 朗讀註解顯示與翻頁判斷分離處理。
- 目前頁面的邊界由 epub.js `currentLocation()` 的 CFI 推算。
- 翻頁點使用目前頁面測得的頁尾邊界，並只保留極小固定提前量：
  - `pageTurnOffset = pageEndOffset - 8`
- 自動翻頁統一走帶序號追蹤的請求流程：
  - `requestTTSAutoNextPage(...)`
  - `ttsAutoFollowPendingRef`
  - `ttsAutoFollowSequenceRef`
- `relocated` 後只解鎖對應序號的自動翻頁。
- 防止連續誤翻的保護：
  - 若 `absoluteOffset < pageStartOffset`，代表朗讀還沒進入目前頁，不自動翻頁。
  - 剛進入新頁時，不立刻再次自動翻頁。
  - 使用者手動翻頁後，仍保留短暫的自動跟隨冷卻時間。

## 經驗

- 在這個 epub.js 架構中，不要把 CSS Highlight 的幾何位置當成翻頁判斷的真相來源。
- 不要把跨頁學到的比例校正套用到其他頁；某一頁的誤差可能不適用於下一頁。
- 自動跟隨狀態必須明確，並且要與手動翻頁狀態分開。
- 幾何 log 只適合用來輔助除錯朗讀註解位置。

## Renderer 後續

在 PWA 完成本地、正式環境與 iOS 測試前，不要移植中間實驗版本。後續移植 renderer 時，只移植最後穩定的狀態機做法。
