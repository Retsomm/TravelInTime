---
tags:
  - refactor
  - progress
  - client-service-hook
  - cloud-sync
---
# Client / Service / Hook 分層架構重構進度追蹤

> 本文件目的：這是跨多次對話的大工程，單一對話的 context 不會保留，所以把決策與計畫寫在這裡，
> 之後任何一次對話（不論是不是同一個 Claude session）都能從這裡接續，不用重新討論一次。
> 格式沿用 [CLOUD_SYNC_PROGRESS.md](CLOUD_SYNC_PROGRESS.md) / [FP_REFACTOR_PROGRESS.md](FP_REFACTOR_PROGRESS.md) 的既有慣例。

**現況（2026-08-08）：pwa-next 的 Phase 0（進度同步）、Phase 1（Book/Bookmarks/Annotations
全量遷移＋逐筆 upsert＋軟刪除）都已寫碼完成並推上 `dev` 分支。過程中修過好幾輪使用者實測回報的
bug（見下方討論紀錄），但**跨裝置同步目前仍有一個尚未解出根因的失敗案例，使用者已要求先擱置**，
不要在還沒有新線索的情況下繼續盲改。renderer／mobile 完全還沒開始動工（Phase 2–6）。**

---

## 跟 CLOUD_SYNC_PROGRESS.md 的關係

`CLOUD_SYNC_PROGRESS.md` 記錄的是「從零打造雲端同步」這個更早的工程（Next.js 骨架、Clerk、
Prisma schema、API route、`pwa/` → `pwa-next/` 的 UI 搬遷），**該文件記載的同步機制
（`utils/cloudSync.ts` 手刻 fire-and-forget、書籤/註記「整包覆蓋」PUT）已經在這次重構裡
被整個取代**，`cloudSync.ts` 這個檔案已經刪除。

這次重構要解決的是同步機制本身的架構問題：
- 原本的「整包覆蓋」寫法沒有可信的逐筆時間戳、也沒有刪除紀錄，跨裝置合併時無法正確處理
  「這筆是不是已經在別的裝置被刪除」，做了讀取／還原功能後這個缺口會直接讓已刪除的資料復活。
- 三個資料存取（fetch/存 localStorage/推播雲端）散落在各個 hook 裡，沒有一致的分層，
  難以推廣到 renderer／mobile 兩個還沒有任何雲端同步的平台。

**如果之後要查「為什麼書名沒辦法同步改動」「Neon/Clerk 是怎麼申請的」這類背景，去看
`CLOUD_SYNC_PROGRESS.md`；要查「現在的分層架構長怎樣、書籤/註記怎麼合併、還剩哪些平台沒做」，
看這份文件。**

---

## 整體目標與範圍

使用者原始問題：專案裡有沒有「Client 層（網路細節）／Service 層（資料模型）／Hook 層
（TanStack Query 快取）」這種分層架構？調查後發現完全沒有，三個子專案（`pwa-next`／
`renderer`／`mobile`）都沒有 TanStack Query，`renderer`／`mobile` 甚至完全沒有登入機制。

使用者確認的範圍決策：
1. **三個子專案都要做**（`renderer`、`pwa-next`、`mobile`；不含已被取代的舊版 `pwa/`），且是
   **完整遷移**（改寫既有邏輯，不是新舊並存）。
2. **renderer 登入**：用**自訂 URL scheme 深連結**（`travelintime://`），不做手動配對碼。
3. **Electron token 儲存**：`safeStorage` 加密；若系統不支援加密（常見於無 keyring 的 Linux），
   直接擋下登入並顯示錯誤，不降級成明文。
4. **書籤／註記合併**：不接受「整包覆蓋、無法追蹤刪除」的限制，後端 PUT 改成逐筆 upsert
   ＋軟刪除，讓合併語意（LWW by `updatedAt`）真正站得住腳。
5. **進度同步**：本機 localStorage 每次翻頁立即寫，遠端推送 debounce 1200–1500ms。
6. 型別契約不建立要發佈的 npm 套件（三個獨立部署目標，套件版本管理成本高於複製貼上成本）。

**完整的架構設計細節（Client/Service/Hook 三層的介面形狀、renderer 深連結認證流程的完整步驟、
mobile Clerk Expo 整合方式、Bearer token 後端驗證路徑設計）記在 plan mode 產生的計畫書，
路徑：`/Users/yutingchan/.claude/plans/fancy-frolicking-fairy.md`（這是 Claude Code 本機的
plan 檔案，不在這個 git repo 裡，換一台機器或換人接手看不到——如果那個檔案未來不見了，
下面「三層架構設計」小節有摘要版，足夠接續 renderer/mobile 階段）。**

---

## 三層架構設計摘要

```
clients/   Client 層：只管網路（fetch wrapper、timeout、401 處理、Bearer token 注入）
services/  Service 層：純函式，資料模型 + local CRUD + remote CRUD + merge，不 import React
hooks/     Hook 層：把 Service 包成給元件用的 API（TanStack Query 或必要時的 useState/useCallback）
```

- **Client 層**（`pwa-next/src/clients/apiClient.ts`）：`createApiClient({baseUrl, getAuthHeader?, onUnauthorized?, timeoutMs})`，一律 `throw ApiError`，不吞錯——吞錯是 Service 層的業務語意判斷，不是 Client 層的責任。
- **Service 層**：每個資源一支檔案（`bookService.ts`/`progressService.ts`/`bookmarkService.ts`/`annotationService.ts`），固定形狀 `{ local: {...}, remote: {...}, merge(local, remote, ...) }`。永遠先寫 local（同步、不用等網路），保留「localStorage 才是 source of truth」的核心語意。
- **Hook 層**：`progressService` 走 TanStack Query（`useProgressQuery`／`useSaveProgress`，見 `hooks/reader/useProgress.ts`）；`bookmarkService`／`annotationService` **實際實作偏離了原計畫書**——原計畫要全部走 TanStack Query cache，但因為書籤/註記的還原時機是「開書當下」「還沒開任何 Reader 的書庫/筆記頁」等情境，跟 query cache 綁定的元件生命週期對不太上，最後改用單純的 `useState` + `useCallback` 穩定參照（`hooks/reader/useAnnotations.ts`、`hooks/reader/useBookmarks.ts`），是刻意的簡化，不是漏做。
- 詳細信任邊界／debounce 設計／renderer 深連結認證流程／mobile Clerk Expo 整合，見上面提到的 plan 檔案。

---

## Phase 進度

### Phase 0 — pwa-next：Progress 垂直切片（已完成，已推上 dev）
- [x] `@tanstack/react-query` 安裝＋`QueryProvider`
- [x] `clients/apiClient.ts`、`services/syncQueue.ts`、`services/syncGate.ts`、`services/progressService.ts`
- [x] `hooks/reader/useProgress.ts`（`useProgressQuery`／`useSaveProgress`，debounce 1400ms＋flush-on-exit）
- [x] 順手修正背景章節頁數掃描器的既有 bug：`components/Reader/pageCountCache.ts`（快取上次完整掃描的每章頁數，開書時提前灌回；掃描完成時 total 不能比目前顯示的還小，可疑結果不寫入快取；快取加版本號讓修正前寫入的舊快取失效）
- [x] 使用者測試 OK（進度保存、頁數顯示都正常），已 commit + push

### Phase 1 — pwa-next：Book/Bookmarks/Annotations 全量遷移（已完成，已推上 dev；跨裝置同步仍有已知問題）
- [x] Prisma schema：`Bookmark` 新增 `updatedAt`（nullable，舊資料列沒有可回填）／`deletedAt`，`Annotation` 新增 `deletedAt`（`db push` 同步到 Neon，**不能用 `migrate dev`**——這個專案沒有 migration 歷史，`migrate dev` 第一次跑會想整個 reset 資料庫，已經在對話中攔下沒讓它執行）
- [x] `bookmarks`/`annotations` route 從整包覆蓋改成逐筆 upsert + 軟刪除；後續又加固：`lib/validateSyncPayload.ts` 驗證 payload 形狀、`MAX_UPSERTS` 上限、`findMany` 批次查歸屬取代 N+1 `findUnique`、`deletedBookmarks`/`deletedAnnotations` 30 天保留期限內的軟刪除紀錄隨 GET 回傳（讓別裝置合併時知道「這筆已被刪除」，不會復活）、`$transaction` 加 timeout
- [x] `services/bookService.ts`／`bookmarkService.ts`／`annotationService.ts`（含 tombstone log、`restoreForBook(bookId)`——開書當下背景跟雲端合併這本書的資料，不阻塞開書；`local.clear(bookId)`——整本書刪除時一併清掉書籤/註記/進度的本機殘留，避免同內容重新匯入時憑空復活）
- [x] `store/useAnnotationStore.ts`（Zustand）、`utils/cloudSync.ts` 已刪除
- [x] `hooks/useCloudRestore.ts`：`restoreCloudDataOnce(replaceRecords)`，模組層級（不是 React state/ref）防重複觸發＋in-flight 去重，登入時、以及 `Notes.tsx`／`useBookmarks.ts`／`useReaderEngine.ts` 各自在自己的時機點呼叫
- [x] `services/syncGate.ts` 加了「登入世代」（`generation`）概念：帳號切換時卡在 `syncQueue` 佇列裡還沒送出的舊帳號寫入，執行前重新比對世代，世代不符直接跳過，避免舊帳號資料被當成新帳號的寫入送出去
- [x] `yarn build`/`yarn lint` 全程維持在改動前的基準值（29 problems, 10 errors, 19 warnings），沒有新增任何編譯/lint 問題
- [ ] **跨裝置同步：使用者實測「A 端新增註記，B 端沒有同步顯示」「A 端新增書本，B 端書本正確顯示為缺檔，但該書註記沒有出現在 B 端」，根因還沒查出來，使用者已要求先擱置，不要繼續盲改**（見下方「已知問題」）

### Phase 2 — 後端 Bearer Token 驗證路徑（未開始）
給 renderer/mobile 用：`ApiToken`/`PairingCode` model、配對碼交換端點、`requireUserIdMulti()`（依序嘗試 Clerk cookie / Clerk JWT bearer / opaque PAT bearer）、`/pair` 頁面。可以完全用 curl 獨立測試，不依賴任何前端 App。

### Phase 3 — renderer 登入（深連結，未開始）
`travelintime://` 協定註冊、`app.requestSingleInstanceLock()`、`open-url`/`second-instance` handler、`safeStorage` IPC bridge、登入 UI。**已知風險**：深連結在未打包的 dev 模式下協定關聯可能不穩定，測試這條路徑可能需要先跑過一次打包安裝。

### Phase 4 — renderer 資料層 + 同步 + 還原（未開始）
比照 Phase 1 的 pattern（`clients/apiClient.ts`＋`services/*.ts`＋tombstone log），renderer 現有 hooks 本來就是 pwa-next hooks 拿掉雲端呼叫的版本，改動面應該比 Phase 1 小。

### Phase 5 — mobile 登入（`@clerk/clerk-expo`，未開始）

### Phase 6 — mobile 資料層 + 同步 + 還原（未開始）
拆 `mobile/lib/library.ts` 目前身兼「儲存 client」跟「資料模型定義」的雙重角色。

### Phase 7 — 收尾（未開始）
清殘留舊程式碼、三平台交叉測試矩陣（特別覆蓋跨裝置刪除場景——這正是 Phase 1 目前卡住的同一類問題，Phase 7 執行前這個問題必須先解掉）。

---

## 已知問題（擱置中，下次接續時從這裡開始查）

**2026-08-08 使用者回報，尚未解出根因**：
1. A 端（VSCode 內建瀏覽器）新增註記後，B 端（一般瀏覽器）重新整理／重開同一本書，沒有看到新註記。
2. A 端新增書本後，B 端正確顯示該書為「缺檔」（需要使用者重新上傳），但該書在 A 端已有的註記，
   目前沒有在 B 端看到。

已經做過的修正（但使用者仍回報失敗，代表這些修正沒有完全解決，或還有其他根因沒找到）：
- 補上「開書當下背景跟雲端合併」（`restoreForBook`），取代原本只有登入當下一次性還原的機制。
- `Notes.tsx`（獨立路由，不跟 `App.tsx` 共用 React state）補上自己的還原 effect。
- `useBookmarks.ts` 加了 `activeBookIdRef` 防止「舊書的合併結果晚到才回來，覆蓋掉已經在讀的新書」。
- 後端補上 `deletedBookmarks`/`deletedAnnotations` 讓刪除紀錄能正確跨裝置傳播。

**下次排查時建議的方向**（沒有驗證過，是待測的假設）：
- 兩端是不是真的登入**同一個** Clerk 帳號（不同 OAuth 方式登入同一個 Google 帳號，Clerk 那邊
  會不會因為 `clerkUserId` 不同而被當成不同使用者？這是最值得先排除的低階可能性）。
- `restoreForBook` 呼叫的時間點，是不是真的在使用者觀察的當下已經跑完（背景 fetch 不 await，
  UI 可能還沒更新使用者就已經在看畫面了）——可以先加臨時的 `console.log` 或用瀏覽器 Network
  分頁直接確認 GET `/api/books/[bookId]/annotations` 有沒有真的發出去、回應內容是什麼。
- A 端是「VSCode 內建瀏覽器」——這個環境本身對某些瀏覽器 API 支援不完整是本專案已知的坑
  （見 `~/.claude/CLAUDE.md` 全域規則的「裝置能力 API」段落），雖然這次測的是網路請求不是
  裝置能力 API，但既然 A 端環境本來就比較特殊，不能排除是環境本身的問題，排查時第一步可以
  先確認 A 端在一般瀏覽器分頁測試是否同樣失敗，把「環境」跟「程式碼」兩個變因分開。

---

## 討論紀錄

- 2026-08-08：完成 Phase 0（Progress 垂直切片）與 Phase 1（Book/Bookmarks/Annotations 全量遷移）
  的規劃與實作，經多輪使用者實測抓出並修正：`useAnnotations.ts` 回傳函式未穩定參照導致的
  `Maximum update depth exceeded` 無限迴圈；還原流程漏了先補推 Book 列造成的 `P2003` 外鍵違反；
  `extractMeta` 用的獨立 epub.js book 實例沒套用既有的 `patchBookPrototype` destroy race 修補；
  劃線色塊選單在螢幕邊緣被裁切（clamp margin 抓太小）；跳轉到既有註記後標記未重新渲染
  （epub.js 的 `hooks.render` 只在章節第一次渲染時自動重新掛標記，同章節內跳轉不會觸發）。
  兩批修正都已 commit 並 push 到 `dev` 分支。用 `db push` 而非 `migrate dev` 同步 schema
  變更到 Neon（這個專案沒有 migration 歷史，`migrate dev` 第一次跑會想整個 reset 資料庫，
  已在對話中攔下沒有執行）。
  最後一輪使用者做跨裝置測試（VSCode 內建瀏覽器 + 一般瀏覽器，同帳號登入）失敗，兩個情境
  （新增註記不同步、新書的既有註記不同步）都沒有解出根因，使用者要求先擱置這個問題，
  其餘已驗證的修正照常推上 `dev`。新增本文件作為跨對話追蹤起點。

---

## 相關文件

- 雲端同步的原始背景／技術棧決策／Neon vs Supabase 取捨：[CLOUD_SYNC_PROGRESS.md](CLOUD_SYNC_PROGRESS.md)
- 更早的函數式重構（action/calculation/data 分層，PWA/RENDERER/RN 三版 Reader.tsx 拆分）：[FP_REFACTOR_PROGRESS.md](FP_REFACTOR_PROGRESS.md)
- 完整的三層架構設計書（renderer 深連結認證、mobile Clerk Expo、Bearer token 後端設計）：`/Users/yutingchan/.claude/plans/fancy-frolicking-fairy.md`（Claude Code 本機檔案，不在 git repo 裡）
