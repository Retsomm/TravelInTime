// 除錯用開關集中放這裡，避免散落各檔案造成循環 import。
// 追蹤「新增註記後 SVG 劃線標記沒有正確顯示」的問題，暫時開啟，
// 之後確認問題解決後記得關掉（改回 false），避免正式使用時洗版 console。
export const DEBUG_ANNOTATIONS = true

// 追蹤「離開書本再重新打開後，閱讀進度跳回開頭或很早的位置」的問題，暫時開啟，
// 之後確認問題解決後記得關掉（改回 false）。
export const DEBUG_PROGRESS = true
