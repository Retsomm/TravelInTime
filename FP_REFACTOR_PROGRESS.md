---
tags:
  - refactor
  - progress
---
# 函數式重構進度追蹤（PWA / RENDERER / RN）

> 依循 [functional-thinking.md.md](functional-thinking.md.md) 的 Grokking Simplicity 原則（action / calculation / data 分層），依序重構 PWA、RENDERER、RN 三個版本。

---

## 整體順序

1. ✅ **PWA**（`pwa/`）— 已完成
2. ⬜ **RENDERER**（`renderer/`）— 待開始
3. ⬜ **RN / mobile**（`mobile/`）— 待開始

每完成一個版本先暫停，等使用者確認沒問題再進行下一個。

---

## 1. PWA（已完成）

目標檔案：`pwa/src/page/Reader.tsx`（原始 2383 行，混雜計算邏輯與副作用）

### 已完成項目

- [x] 新增 4 個純計算檔案（`pwa/src/components/Reader/`），逐字搬移邏輯，零行為改動：
  - `progressCalculations.ts` — 頁碼/總頁數換算
  - `tocLookup.ts` — TOC / spine 章節查找
  - `ttsFollowCalculations.ts` — TTS 翻頁判斷邏輯
  - `bookmarkUtils.ts` — 書籤資料操作
- [x] 抽出 `useBookmarks.ts`（`pwa/src/hooks/reader/`）
- [x] 抽出 `useAnnotationPopups.ts`（`pwa/src/hooks/reader/`）
- [x] 抽出 `useChapterPageScan.ts`（`pwa/src/hooks/reader/`）
- [x] 合併 book 生命週期與 TTS 跟讀邏輯為 `useReaderEngine.ts`（`pwa/src/hooks/reader/`）
  - 原規劃拆成 `useEpubBook` + `useTTSFollow` 兩個獨立檔案，但發現兩者實際雙向耦合（`relocated` 事件直接呼叫 TTS 函數，TTS 又依賴 book 初始化建立的 refs），經與使用者確認後改為合併成單一 hook
- [x] `Reader.tsx` 從 2383 行降至 641 行，現在主要是 refs/hooks 組裝 + JSX render
- [x] 每個階段皆執行 `cd pwa && yarn build` 驗證型別/編譯無誤

### 使用者實測結果（已通過）

- [x] 翻頁（含 RTL 模式）
- [x] 朗讀播放 / 暫停 / 繼續 / 跨章節自動翻頁
- [x] 選字高亮 popup（新增／編輯／刪除標記）
- [x] 書籤新增 / 刪除 / 跳轉
- [x] 簡繁轉換
- [x] 深色模式
- [x] 字體大小 / 字型 / 行距 / 字距設定
- [x] 睡眠計時器
- [x] 手機版 Safari（過去有 iOS 專屬的 selectionchange / 觸控 bug，本次確認正常）

**PWA 重構已通過完整實測，可視為此階段完成。**

---

## 2. RENDERER（待開始）

目標檔案：`renderer/src/page/Reader.tsx`

**注意**：`renderer` 目前程式碼已與 `pwa` 分岔，功能不完全相同（例如少了書籤功能、annotation popup 拆成獨立的 `BookmarkPanel.tsx` / `HighlightPopup.tsx` 元件）。不能直接複製 PWA 版的重構結果，需要重新評估：

- [ ] 比對 `renderer` 與 `pwa` 的 `Reader.tsx` 差異，確認哪些抽出的邏輯可以共用、哪些需要為 renderer 版本量身設計
- [ ] 決定是否要與 PWA 共用同一份純計算檔案（若邏輯完全一致）
- [ ] 依同樣的 ACD 原則拆分 renderer 版 `Reader.tsx`
- [ ] `cd renderer && yarn build` 驗證
- [ ] 列出需使用者實測的項目（Electron 環境特有行為）

---

## 3. RN / mobile（待開始）

目標目錄：`mobile/`（React Native + WebView 架構，與 PWA/RENDERER 完全不同）

- [ ] 先探索 mobile 版對應的 Reader 相關程式碼結構（WebView 架構下的 ACD 分層方式可能與 web 版差異很大）
- [ ] 評估此架構下的動作/計算/資料分層策略
- [ ] 執行重構
- [ ] 驗證方式待定（RN 無法用 `yarn build` 驗證執行期行為，需实機/模擬器測試）

---

## 相關文件

- 重構指導原則：[functional-thinking.md.md](functional-thinking.md.md)
