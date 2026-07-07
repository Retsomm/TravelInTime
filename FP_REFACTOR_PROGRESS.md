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
2. ✅ **RENDERER**（`renderer/`）— 已完成
3. 🔶 **RN / mobile**（`mobile/`）— 程式碼搬移完成，待使用者實機測試

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

## 2. RENDERER（已完成）

目標檔案：`renderer/src/page/Reader.tsx`（原始 1850 行，重構後 314 行）

**更正**：舊版本文件寫「renderer 少了書籤功能」已過期——renderer 其實已有完整書籤功能與更早就元件化的 `BookmarkPanel.tsx` / `HighlightPopup.tsx`，只是書籤/annotation/TTS 邏輯尚未抽成純函數 + hooks。

### 已完成項目

- [x] 新增 4 個純計算檔案（`renderer/src/components/Reader/`，與 pwa 共用同一份邏輯，逐字搬移）：
  - `progressCalculations.ts`、`tocLookup.ts`、`bookmarkUtils.ts`、`ttsFollowCalculations.ts`
- [x] 抽出 `useBookmarks.ts`、`useChapterPageScan.ts`、`useAnnotationPopups.ts`、`useReaderEngine.ts`（`renderer/src/hooks/reader/`）
  - `useAnnotationPopups.ts` 依 renderer 現有 `HighlightPopup.tsx` 介面調整為 `{x, y}` 座標（不採用 pwa 版的 `{left, top}` clamp 寫法）
  - `useReaderEngine.ts` 以 renderer 原有邏輯為底重新組織（而非直接搬 pwa 版），刻意保留 renderer 特有行為：
    - TTS 高亮改用 renderer 原有的 CSS Custom Highlight API 直接繪製（不採用 pwa 版新增的 DOM overlay fallback，那是獨立的行為改動，超出本次重構範圍）
    - 不引入 pwa 版新增的行動裝置專屬邏輯（觸控 selectionchange 選字路徑、iOS selectionchange 轉發、`getVisibleContentDocument` 多 iframe 命中測試）——Electron 桌面版不需要
  - 同步修正 `renderer/src/store/useAnnotationStore.ts` 的 `addAnnotation`，改為回傳新建立的 id（比照 pwa 版介面，讓 `useAnnotationPopups.ts` 可直接使用回傳值）
  - 修掉章節掃描 bug：背景掃描改用獨立的 `ePub(buffer.slice(0))` 實例（`useChapterPageScan.ts`），不再複用主 `book` 建立第二個 rendition，避免掃描完成時偶爾清空主渲染器 annotation 的問題
- [x] `Reader.tsx` 從 1850 行降至 314 行
- [x] `cd renderer && yarn build` 驗證型別/編譯無誤

### 使用者實測結果（已通過）

- [x] 翻頁、鍵盤左右鍵翻頁
- [x] 朗讀播放/暫停/繼續/跨章節自動翻頁
- [x] 選字高亮 popup 位置（新增/編輯/刪除標記）
- [x] 書籤新增/刪除/跳轉
- [x] 簡繁轉換、深色模式、字體大小/字型/行距/字距設定
- [x] 睡眠計時器
- [x] 章節掃描：切換字體大小後多次翻頁，頁碼校正正確且高亮標記不會被意外清除

### 實測中發現並修正的問題

- [x] **朗讀跟隨螢光色閃爍、同時出現在目標與非目標句子**：`renderer/src/hooks/useTTS.ts` 仍保留舊版「估算進度計時器」（每 250ms 用預估字速推進高亮位置），與真實 `onboundary` 事件互相搶跑造成閃爍。比照 pwa 版已驗證過的修法，移除估算計時器，高亮改成只跟隨真實 boundary 事件。
- [x] **註記跳轉後不顯示**：在 `useReaderEngine.ts` 的 `relocated` 事件中新增補救邏輯——每次換頁/跳轉後延遲檢查當前章節的既有註記是否有對應 SVG 底線，缺漏則重新呼叫 `addEpubAnnotation` 補畫（epub.js 的 `annotations.inject(view)` 在 contents 尚未完全就緒時偶爾會失敗）。
- [x] **書庫排序按鈕（最近閱讀/書名/進度）點擊無效**：與本次 Reader 重構無關的既有 bug——`Library.tsx` 外層有 `drag-region`（Electron 視窗可拖曳區域），`SortControl.tsx` 的按鈕缺少 `no-drag` class，導致點擊被系統拖曳行為吃掉。已補上 `no-drag`。

**RENDERER 重構已通過完整實測，可視為此階段完成。**

---

## 3. RN / mobile（程式碼搬移完成，待實機測試）

目標目錄：`mobile/`（Expo Router + react-native-webview + epub.js，是兩個獨立的 JS 世界：
RN 端負責畫面與 AsyncStorage，WebView 端獨立打包一份 epub.js reader 邏輯）。

### 已完成項目

**RN 端**（`mobile/app/reader/[id].tsx` 從 788 行降至 383 行）：
- [x] 新增 `mobile/lib/reader/calculations.ts`：書籤/註記陣列運算、睡眠計時循環選項、
  URL scheme 判斷、頁碼百分比格式化，以及從 `lib/tts.ts` 搬過來的 `splitTextByLength`/
  `withFriendlyLabels`/`dedupeByLanguage`（純函數，逐字搬移零行為改動）
- [x] 抽出 `mobile/hooks/reader/useReaderEngine.ts`（WebView 訊息橋接、relocated/toc/選字狀態、
  排版設定載入存檔）、`useBookmarks.ts`、`useAnnotations.ts`、`useTTSReading.ts`（朗讀跨章節跟讀）
- [x] `mobile/lib/library.ts` 不動（書庫列表與 Reader 共用資料層，不在本次重構範圍）

**WebView 端**（`mobile/reader-web/index.ts` 從 1132 行降至 692 行）：
- [x] 新增 `tocLookup.ts`（TOC 查找）、`progressCalculations.ts`（頁碼/百分比換算純函數）、
  `ttsFollowCalculations.ts`（朗讀跟讀「是否該自動翻頁」純判斷）、`scriptConversion.ts`（簡繁轉換）、
  `readerStyles.ts`（排版/深色模式 DOM 樣式注入）、`annotationUtils.ts`（標記差異比對純函數
  `diffAnnotations` + DOM 操作）
- [x] `index.ts` 保留 module 狀態、book/rendition 生命週期、`handleMessage` dispatcher，
  改為呼叫上述新模組

### 驗證進度

- [x] `cd mobile && npx tsc --noEmit` 型別檢查通過
- [x] `yarn build:reader` 成功打包（esbuild 不做型別檢查，只驗證語法/bundle 成功）
- [ ] **使用者實機/模擬器測試（尚未進行，我無法在此環境驗證 RN/WebView 執行期行為）**：
  - [ ] 翻頁（含 RTL、tap-zone 點擊）
  - [ ] 朗讀播放/暫停/繼續/跨章節自動翻頁跟讀
  - [ ] 選字劃線（含劃線模式切換）/ 標記顏色編輯 / 刪除 / 筆記
  - [ ] 書籤新增/刪除/跳轉
  - [ ] 簡繁轉換（含書本原始語言偵測 baseScript）
  - [ ] 深色模式
  - [ ] 字體大小/字型/行距/字距設定
  - [ ] 睡眠計時
  - [ ] 章節背景掃描完成後頁碼校正正確

**在使用者完成上述實機測試並回報無誤前，此階段不可視為完成。**

---

## 相關文件

- 重構指導原則：[functional-thinking.md.md](functional-thinking.md.md)
