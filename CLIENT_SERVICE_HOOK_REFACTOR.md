---
tags:
  - refactor
  - progress
  - client-service-hook
---
# Client / Service / Hook 分層架構重構進度追蹤

> 本文件目的：這是跨多次對話的大工程，單一對話的 context 不會保留，所以把決策與計畫寫在這裡，
> 之後任何一次對話（不論是不是同一個 Claude session）都能從這裡接續，不用重新討論一次。
> 格式沿用 [CLOUD_SYNC_PROGRESS.md](CLOUD_SYNC_PROGRESS.md) / [FP_REFACTOR_PROGRESS.md](FP_REFACTOR_PROGRESS.md) 的既有慣例。

**現況（2026-08-18）：跨裝置雲端同步功能已全數移除（使用者決定放棄，原因是 Phase 1 卡住的
跨裝置同步 bug 一直沒查出根因，見下方「已放棄的雲端同步」）。pwa-next 現在是純本機儲存，
沒有登入機制、沒有後端 API route、沒有資料庫。三個子專案（`pwa-next`／`renderer`／`mobile`）
接下來只做「本機儲存版」的 Client/Service/Hook 分層，不含任何雲端/帳號功能。renderer 的本機
資料層分層已完成實作（見下方 Phase 進度），**尚未經使用者瀏覽器實測，依規則等驗證通過才能
commit**；mobile 完全還沒開始動工。

---

## 已放棄的雲端同步（2026-08-18 移除，僅供歷史查閱）

Phase 0（pwa-next 進度同步）與 Phase 1（pwa-next 的 Book/Bookmarks/Annotations 全量遷移＋
逐筆 upsert＋軟刪除）原本已完成並推上 `dev` 分支，但 Phase 1 遺留一個沒解出根因的跨裝置同步
bug（A 端新增註記、B 端看不到；細節見 git 歷史 `371e0e1` 之後、`4471d71` 之前的
`CLIENT_SERVICE_HOOK_REFACTOR.md` 版本，或 `git log -p` 查看這份文件在拆除雲端同步那次
commit 之前的內容）。使用者在這次卡住後決定不再追查，直接要求整個拆除雲端同步功能。

**2026-08-18 拆除範圍**：
- pwa-next：移除 `@clerk/nextjs` 登入（`ClerkProvider`、`AuthStatus.tsx`、`src/proxy.ts`
  middleware、`useUser`/`isSignedIn` 各處呼叫）；移除 `clients/apiClient.ts`（Client 層）；
  移除四個 service（`bookService`/`progressService`/`bookmarkService`/`annotationService`）
  的 `remote`/`merge`/`pushNow`/`pushDebounced`/`restoreForBook` 與 tombstone（`recordDeleted`/
  `loadDeletedIds`/`clearDeletedIds`）機制，只留 `local` CRUD；移除 `services/syncQueue.ts`／
  `syncGate.ts`／`hooks/useCloudRestore.ts`；移除後端 `src/app/api/books/**`（books/
  bookmarks/annotations/progress route）、`src/app/api/me/route.ts`、`src/app/api/health/route.ts`、
  `src/lib/requireUserId.ts`、`src/lib/prisma.ts`；移除 `prisma/schema.prisma`／
  `prisma.config.ts`／`src/generated/prisma/`；移除 `QueryProvider.tsx`（連同
  `@tanstack/react-query`，拆完雲端還原後專案內沒有其他地方在用 TanStack Query）；
  `package.json` 移除 `@clerk/nextjs`／`@prisma/*`／`pg`／`prisma`／`@tanstack/react-query`
  五個依賴與 `postinstall: prisma generate`；`.env` 內的 `DATABASE_URL`／
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`／`CLERK_SECRET_KEY` 一併清掉（該檔本來就 gitignore，
  不影響版控）；`Privacy.tsx` 隱私權政策文案改寫為「純本機儲存、無帳號」。
- `yarn build`／`yarn lint` 都驗證過，`lint` 維持在改動前的既有基準值
  （29 problems, 10 errors, 19 warnings，跟這次移除完全無關的既有問題），沒有新增任何錯誤。
- **這批改動尚未經使用者在瀏覽器實際操作驗證（開書、翻頁存進度、加書籤、劃線註記、
  「我的筆記」頁刪除等），依照專案規則，要等使用者測過確認沒問題才能 commit。**

---

## 整體目標與範圍（2026-08-18 更新）

使用者原始問題：專案裡有沒有「Client 層（網路細節）／Service 層（資料模型）／Hook 層
（快取）」這種分層架構？調查後發現完全沒有。原始規劃是三個子專案都做完整的雲端同步分層，
但 pwa-next 的跨裝置同步卡住一直沒解，使用者決定放棄雲端同步這整條路線。

**現行範圍決策（取代舊決策）**：
1. **三個子專案都要做本機版分層**（`renderer`、`pwa-next`、`mobile`；不含已被取代的舊版
   `pwa/`），且是**完整遷移**（改寫既有邏輯，不是新舊並存）。
2. **不做任何登入/帳號機制**（Clerk 已從 pwa-next 移除，renderer 深連結登入／mobile Clerk
   Expo 整合這兩個計畫**取消**，不會實作）。
3. **不做任何跨裝置同步**（後端 API route、Bearer Token 驗證路徑、Prisma 資料庫這幾個計畫
   **取消**，不會實作）。
4. 分層的價值改成單純「Client 層之後不再需要（沒有網路）／Service 層封裝本機
   storage（IndexedDB/localStorage/SQLite 依平台而定）／Hook 層包成給元件用的 API」，
   讓 `renderer`/`mobile` 沿用跟 pwa-next 拆完雲端後同樣形狀的本機 Service 層，作為之後
   維護／單元測試的一致基礎，而不是為了同步。
5. 型別契約不建立要發佈的 npm 套件（三個獨立部署目標，套件版本管理成本高於複製貼上成本）。

---

## 三層架構設計摘要（本機版，2026-08-18 更新）

```text
services/  Service 層：封裝資料模型 + 本機 CRUD（storage 依平台而定），不 import React
hooks/     Hook 層：把 Service 包成給元件用的 API（useState/useCallback，不需要 TanStack Query
           ——沒有遠端資料要協調快取，pwa-next 已把 @tanstack/react-query 整個移除）
```

- pwa-next 現在的四個 service（`bookService.ts`/`progressService.ts`/`bookmarkService.ts`/
  `annotationService.ts`）都只剩 `{ local: {...} }` 這個形狀，是 renderer/mobile 本機版
  Service 層可以直接參考的藍本（各自平台的 storage API 不同：pwa-next 用
  IndexedDB+localStorage，renderer/mobile 要看現有的 `mobile/lib/library.ts` 之類實作用的
  是什麼）。
- Hook 層不再需要 TanStack Query：`useProgress.ts`／`useBookmarks.ts`／`useAnnotations.ts`
  現在都是單純的 `useState`/`useCallback`，這也是 renderer/mobile 應該沿用的形狀。

---

## Phase 進度（2026-08-18 全面改版：雲端相關 Phase 全部取消，改成本機版）

### pwa-next — 拆除雲端同步（已完成，見上方「已放棄的雲端同步」；待使用者驗證後才能 commit）

### renderer — 本機資料層分層（已完成實作，待使用者瀏覽器驗證）
新增 `services/{bookService,bookmarkService,progressService,annotationService}.ts`（`{ local: {...} }`
形狀，鏡射 pwa-next 對應檔案）。原本 `store/useAnnotationStore.ts`（Zustand + 模組級
`.subscribe()` 自動存檔，帶有「先 unsub 再 clearAll」排序陷阱，跟 pwa-next 重構前的舊版
`useReaderEngine.ts` 是同一類模式）整個刪除，改成鏡射 pwa-next `hooks/reader/useAnnotations.ts`
的 `useState`/`useCallback` 版本（`hooks/reader/useAnnotations.ts`，新增）。`useReaderEngine.ts`
不再對 annotation store 做 subscribe 自動存檔，改成每個 mutation 自帶 persist；書本內「relocated
後補畫缺漏 SVG 標記」這段 renderer 既有邏輯保留（pwa-next 沒有對應段落，不確定分岔原因，
故未比照刪除），只是讀取來源從 zustand `getState()` 換成 `annotationsRef`（由 `Reader.tsx` 用
`useEffect` 同步）。`useLibrary.ts`／`useBookmarks.ts`／`useAnnotationPopups.ts`／`NotePanel.tsx`
等改成呼叫對應 service／透過 props 拿 annotations，而非直接讀 zustand store。**沒有搬**
pwa-next 的 `addBook` 內容雜湊去重 id 策略、`annotationService` 的 `updatedAt`＋格式驗證
（renderer 既有註記資料沒有 `updatedAt` 欄位，硬加驗證會讓舊資料在下次讀取時被判定格式不符
整批消失，此風險判斷後放棄搬這段，只保留鏡射「抽 service＋消除 subscribe 陷阱」這個核心目的）。
`yarn build`（`tsc && vite build`）驗證通過，renderer 沒有 `lint` script。**尚未經使用者
瀏覽器實際操作驗證**（開書翻頁存進度、加書籤、劃線註記、換顏色、寫感想筆記、換章節後標記是否
仍顯示、排版設定還原、刪除書籤等），依規則要等使用者測過確認沒問題才能 commit。

### mobile — 本機資料層分層（未開始）
拆 `mobile/lib/library.ts` 目前身兼「儲存 client」跟「資料模型定義」的雙重角色，比照 pwa-next
`bookService.ts` 現在的本機版形狀（`{ local: {...} }`）拆開。

### 收尾（未開始）
三平台的本機資料層一致後，交叉檢查三個子專案的 Service 層介面形狀是否夠接近、有沒有值得抽共用
邏輯的地方（不建 npm 套件，複製貼上即可，見上方範圍決策第 5 點）。

---

## 討論紀錄

- 2026-08-08：完成 Phase 0（Progress 垂直切片）與 Phase 1（Book/Bookmarks/Annotations 全量遷移）
  的規劃與實作，經多輪使用者實測抓出並修正多個 bug，兩批修正都已 commit 並 push 到 `dev` 分支。
  最後一輪使用者做跨裝置測試失敗，兩個情境（新增註記不同步、新書的既有註記不同步）都沒有解出
  根因，使用者要求先擱置這個問題。
- 2026-08-18：使用者決定不再追查跨裝置同步問題，直接要求移除所有雲端同步/登入功能，
  renderer/mobile 之後只做本機儲存版的分層。當次對話完成 pwa-next 的全面拆除（見上方
  「已放棄的雲端同步」段落），`yarn build`/`yarn lint` 驗證通過，**尚未經使用者瀏覽器實測**，
  依規則等驗證通過才能 commit。
- 2026-08-18（另一次對話）：使用者選擇先做 renderer 的本機資料層分層。比對 pwa-next 現有
  `services/*.ts`／`hooks/reader/use*.ts` 的實際寫法（非文件描述，直接讀程式碼）後動手，
  發現 pwa-next 早已把 annotation 從 Zustand 換成 `useAnnotations(bookId)` hook（理由記在
  該檔案開頭的長註解：subscribe 模式的排序陷阱），renderer 當時還停留在同一類舊模式，因此
  這次一併把 renderer 的 annotation 狀態管理也換掉，不只是抽 service。實作前先用 EnterPlanMode
  寫了完整檔案異動清單並取得使用者核准，執行時發現 pwa-next 的 `annotationService` 有
  `updatedAt`＋格式驗證，但 renderer 舊資料沒有這個欄位，判斷會导致舊註記被驗證邏輯整批清空，
  因此**沒有**搬這段，只搬「抽 service＋消除 subscribe 陷阱」的核心部分。實作完成、
  `yarn build` 通過，**尚未經使用者瀏覽器實測**，依規則停在工作目錄未 commit。

---

## 相關文件

- 雲端同步的原始背景／技術棧決策／Neon vs Supabase 取捨（純歷史，機制已不存在）：
  [CLOUD_SYNC_PROGRESS.md](CLOUD_SYNC_PROGRESS.md)
- 更早的函數式重構（action/calculation/data 分層，PWA/RENDERER/RN 三版 Reader.tsx 拆分）：
  [FP_REFACTOR_PROGRESS.md](FP_REFACTOR_PROGRESS.md)
