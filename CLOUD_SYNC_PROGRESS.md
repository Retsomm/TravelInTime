---
tags:
  - refactor
  - progress
  - cloud-sync
---
# 雲端同步（Clerk + 資料庫）進度追蹤

> 本文件目的：這是跨多次對話的大工程，單一對話的 context 不會保留，所以把決策與計畫寫在這裡，
> 之後任何一次對話（不論是不是同一個 Claude session）都能從這裡接續，不用重新討論一次。

**現況：Phase 1、Phase 2（雲端同步核心、書本檔案遺失復原、登入提示強化）、Phase 3 的
「我的筆記」頁面，都已完成寫碼並經使用者驗證。PWA 安裝/離線寫完但尚未實測，留到 Phase 5
實際部署時一併測試。`pwa-next/` 的閱讀器 UI 尚未跟 `pwa/` 逐項比對過完整功能對等，
離「可以切換上線」還有距離，見下方 Phase 5。**

---

## 背景（為什麼要做這個）

使用者在 PWA 版閱讀時，某天發現所有書本都打不開、註記內容全部消失，推測是不小心用了清理工具
把瀏覽器的 IndexedDB / localStorage 清掉了。目前的架構（見下方「現況」）完全沒有任何備份機制，
一旦本機儲存被清除就無法挽回。

討論後確認的方向：**不需要把書本檔案本體（epub）存到雲端**，因為使用者更在意的是筆記跟閱讀進度，
書本檔案體積大、上雲端有實際的儲存成本；只同步「書庫清單、閱讀進度、書籤、註記」這些輕量記錄，
成本低很多，也直接解決使用者最痛的問題。

---

## 現況（作為改造起點的事實）

- 目前**完全沒有後端**：這個 repo 只有 `pwa/`（PWA）、`renderer/`（Electron 渲染層）、`mobile/`（RN），
  沒有 server、沒有 Prisma、沒有任何 API。專案根目錄 `CLAUDE.md` 裡寫的「後端 Node+Express+Prisma+Postgres」
  是原本的規劃假設，尚未真的動工——**本次決定的技術棧會取代那個舊假設**（見下方技術棧）。
- 書本檔案存在瀏覽器 IndexedDB（`pwa/src/utils/indexedDb.ts`），書庫清單/進度/書籤/設定存在
  localStorage（`pwa/src/hooks/useLibrary.ts`）。
- 每本書的 `id` 是匯入當下用 `crypto.randomUUID()` 隨機產生（`useLibrary.ts` 的 `addBook`），
  跟書本內容完全無關——**這是本次改造必須解決的關鍵前提**，見下方。
- 註記資料結構（`pwa/src/store/useAnnotationStore.ts` 的 `Annotation`）已經包含 `text`（劃線原文）
  跟 `note`（使用者筆記），不是只有位置座標，所以註記本身可以脫離書本內容獨立顯示。
- 書籤、閱讀進度目前只存 CFI（書本內部位置座標），離開書本內容本身沒有意義，這部分只能等書本
  檔案重新匯入後才用得上，不需要（也無法）獨立顯示。
- `pwa/src/App.tsx` 的 `handleOpenBook` 目前偵測不到本機書本檔案時是靜默失敗（直接 `return`，
  沒有任何提示）。

---

## 架構決定：Next.js 不是「新增後端」，是取代 pwa/（2026-07-23 對話中修正）

一開始誤以為是「pwa/ 保留不動，另外加一個 backend/ 資料夾放 API」，對話中使用者糾正：
**這次是把整個網頁版重寫成 Next.js，Next.js 專案本身就同時是前端（閱讀器 UI）跟後端（API
route），寫完之後會完全取代 `pwa/`，不是 pwa/ 之外多一個獨立的後端服務。**

**放置位置的曲折**：一開始建在 `backend/`（誤判為純後端），發現後改放 repo 根目錄（結果發現
repo 根目錄的 `package.json` 其實是 **Electron 桌面版**的建置設定，跟 `renderer/`、
`electron-builder` 綁在一起，直接放根目錄會覆蓋掉桌面版設定），最後定案：

- **最終落腳點是 `pwa/` 這個路徑**（取代現有 pwa/ 目錄本身），`electron/`、`renderer/`、
  `mobile/`、repo 根目錄的 Electron `package.json` 都不受影響。
- **但現在還不能真的動 `pwa/`**：這次對話只做 Next.js 骨架 + API（Phase 1），閱讀器 UI（epub.js
  整合、IndexedDB、書庫/書籤/註記畫面）還沒搬過去。如果現在就刪掉 `pwa/`，部署在 Vercel 上的
  網頁版會在 UI 搬完之前的這段期間完全不能用（沒有閱讀器 UI）。
- **所以暫時放在 `pwa-next/`**（跟 `pwa/` 平行的暫存目錄），`pwa/` 維持現狀繼續運作。等之後
  把 UI 也搬進 `pwa-next/`、確認功能對等且使用者實測 OK 之後，才**一次性切換**：刪掉舊
  `pwa/`、把 `pwa-next/` 改名成 `pwa/`。**在那之前，`pwa-next/` 只是半成品，不要動 `pwa/`。**

## 決定的技術棧（2026-07-23 對話中決定）

| 項目 | 選擇 |
|---|---|
| 框架 | Next.js 16 (App Router) + React 19 + TypeScript |
| 樣式 | Tailwind CSS 4 |
| 身份驗證 | Clerk (`@clerk/nextjs`) |
| 資料庫 | PostgreSQL via Prisma（Neon 托管） |

**Next.js 16 / Prisma 7 是新版本，跟訓練資料裡的舊版 API 有差異，實作時發現的破壞性變更：**
- `middleware.ts` 這個 file convention 在 Next 16 被棄用，改名 `proxy.ts`（功能、`clerkMiddleware()`
  用法不變，只是檔名跟慣例名稱換了）。
- Prisma 7 的 `prisma-client` generator 強制要求 driver adapter（這裡用 `@prisma/adapter-pg`），
  不能再像舊版一樣單純傳連線字串給 `new PrismaClient()`。連線字串也搬到 `prisma.config.ts`，
  不再寫在 `schema.prisma` 的 `datasource` block 裡。
- `prisma init` 會順便生一堆 AI agent 用的 skill 參考檔（`.agents/`、`.windsurf/`、
  `.claude/skills/`、`skills-lock.json`），跟這個專案的工具鏈無關，已清掉 `.windsurf`／`.agents`／
  `skills-lock.json`；`.claude/skills` 保留（已被根目錄 `.gitignore` 的 `.claude/` 規則排除，
  不會進版控，留著當之後寫 Prisma 7 程式碼的參考文件）。

## 範圍界定

**同步（雲端資料庫）：**
- 書庫清單（書名、作者等 metadata）
- 閱讀進度（CFI）
- 書籤（CFI + 標籤）
- 註記（劃線原文 text + 使用者筆記 note）

**不同步（刻意排除）：**
- 書本檔案本體（epub）——永遠只存在本機 IndexedDB，不上雲端，避免大檔案儲存成本。

**已知限制（誠實記錄，不是可以之後用程式解決的東西）：**
- 如果使用者本機書本檔案遺失、手上也沒有原始 epub 檔案了，雲端資料庫救得回筆記/進度/書籤，
  但救不回書本內容本身——使用者仍然需要自己保留原始檔案的來源（電腦、雲端硬碟等）。

---

## 關鍵技術前提：書本 id 必須改成「內容綁定」，不能繼續用隨機 UUID

**問題**：現在 `addBook` 用 `crypto.randomUUID()` 產生 id。如果本機書本檔案被清掉，使用者重新
匯入同一份 epub，會產生一個全新的隨機 id，跟雲端資料庫裡舊的 id 完全對不上，導致雲端存的
進度/書籤/註記變成「孤兒資料」——資料庫沒壞，但 App 沒有任何辦法把它們跟剛匯入的書接回去。

**解法**：id 改成以檔案內容算 hash（或至少用 title + author + 檔案大小做指紋），確保同一本書
不管在哪裝置、匯入幾次，都能算出同一個 id。這樣重新匯入後，App 才能自動比對雲端資料、把
進度/書籤/註記接回這本剛匯入的書。

**這是能不能達成「記錄不會因書本檔案遺失而拿不到」這個目標的必要前提，不是可有可無的細節。**

---

## 兩個新增功能

1. **獨立的「我的筆記」列表畫面**：不透過打開 Reader，直接從資料庫把所有書的 `text` + `note`
   列出來看。因為註記資料本身已經帶著足夠內容（劃線原文 + 筆記），不需要打開書本原文就可讀。
   目前完全不存在這樣的頁面。
2. **書本檔案缺失時的優雅處理**：`handleOpenBook`（`pwa/src/App.tsx`）目前偵測不到本機檔案時
   靜默失敗，需要改成提示使用者「這本書的內容不見了，請重新匯入同一本書」，並利用上面的
   內容綁定 id 機制，重新匯入後自動接回雲端的進度/書籤/註記。

---

## 實作階段規劃（尚未開始，以下皆為計畫，不是完成狀態）

### Phase 0 — 準備
- [x] 決定後端專案放在這個 repo 底下哪個目錄，還是另立新 repo
      （2026-07-23 最終決定：見上方「架構決定」，最終取代 `pwa/`，過渡期先放 `pwa-next/`）
- [x] 在 Neon 建立 Postgres 資料庫 instance（2026-07-23：使用者已申請，`DATABASE_URL` 已寫入
      `pwa-next/.env`（gitignored）。`prisma db push` 已實測連線成功並同步 schema。）
- [x] 申請/設定 Clerk 專案（2026-07-23：使用者已申請，publishable key + secret key 已寫入
      `pwa-next/.env`（gitignored）。已用 curl 實測：`/api/me` 未登入會被 `clerkMiddleware`
      擋下並導去 Clerk 登入頁，確認中介層有生效。）

### Phase 1 — 骨架（Next.js 專案本身同時是前端＋後端）
- [x] Next.js 16 App Router 專案初始化（Tailwind 4、TypeScript），放在 `pwa-next/`
      （2026-07-23：`yarn build` 通過，無編譯錯誤／警告）
- [x] 整合 Clerk（`@clerk/nextjs`）：`pwa-next/src/proxy.ts` 用 `clerkMiddleware` 保護所有路由
      （`/api/health` 例外，留給健康檢查用），`layout.tsx` 包 `<ClerkProvider>`。
      （2026-07-23：僅完成中介層保護，還沒做登入/登出 UI 頁面，等 UI 搬遷階段一起做）
- [x] Prisma schema：`Book`（`(clerkUserId, id)` 複合主鍵，`id` 是內容 hash）、`ReadingProgress`、
      `Bookmark`、`Annotation`，皆綁定 `clerkUserId`（見 `pwa-next/prisma/schema.prisma`）。
      （2026-07-23：`prisma db push` 已實測同步到 Neon 成功）
- [ ] API Route Handlers：CRUD 進度/書籤/註記，每個請求都要驗證 Clerk session
      （2026-07-23：目前只有兩支驗證用的最小 route——`/api/health`（公開，查 DB 確認連線）、
      `/api/me`（受保護，回傳 `auth()` 的 userId），實際的 CRUD endpoints 還沒寫）

### Phase 2 — 把 pwa/ 的閱讀器 UI 搬進 pwa-next/（進行中）
> 這個階段開始前，`pwa/` 本身不會被動到，`pwa-next/` 只是逐步長出跟 `pwa/` 功能對等的
> UI（epub.js 整合、書庫列表、Reader、書籤/註記面板、設定等）。

- [x] `pwa/src/hooks/useLibrary.ts` 的 `addBook`：id 改為內容 hash 綁定（取代 `randomUUID`）
      （2026-07-23：這是在**舊的 `pwa/`** 裡改的，改用 SHA-256 對檔案內容算 hash 當 id；同內容
      已存在時直接 touchBook 接回既有紀錄，不覆蓋既有進度/書籤/註記。`yarn build` 通過，但尚未
      在瀏覽器實測匯入/重新匯入流程，請使用者實際操作驗證後再視為完成。）
- [x] 把 `pwa/src` 底下的元件/hooks/store/utils/constants/page 複製進 `pwa-next/src`，安裝對應套件
      （epubjs、opencc-js、zustand）
      （2026-07-23：`App.tsx` 加 `'use client'`，拿掉原本用 `window.location.pathname === '/private'`
      判斷路由的寫法，改成 Next.js 的獨立 route `app/private/page.tsx`。因為整個 App 依賴
      IndexedDB/localStorage 等瀏覽器 API，`app/page.tsx` 用 `next/dynamic` + `ssr:false` 掛載
      `App`，避免 Next.js 在伺服器端 render 時因為存取不到瀏覽器 API 而壞掉。globals.css 併入
      `pwa/src/index.css` 的 `@custom-variant dark`、`--font-reading`、防捲動設定；layout.tsx
      補上原本 `index.html` 的 Google Fonts（Source Serif 4／Noto Serif TC／Noto Sans TC／
      LXGW WenKai TC／Huninn／JetBrains Mono）、viewport、apple-web-app meta。`yarn build`
      通過，用 curl 對 `/`、`/private` 兩個路由實測回應 200 且 HTML 內容正確（標題、頁面文字都在），
      但 curl 只能驗證伺服器有正確吐出靜態殼層，**無法驗證 client-side 掛載後的實際互動**
      （書庫顯示、匯入書本、翻頁、書籤/註記、TTS 朗讀等都還沒有在瀏覽器裡實測過，需要使用者
      實際操作驗證）。
      過程中發現並修正一個 bug：一開始 `proxy.ts` 把除了 `/api/health` 以外的「所有」路由都
      擋在 Clerk 登入後面，包含 `/` 和 `/private`——但書庫瀏覽/閱讀完全是本機功能，不該要求
      登入，`/private`（隱私權政策）更是必須公開。已改成只保護 `/api/me`，頁面路由一律公開。
- [x] PWA 安裝／離線能力
      （2026-07-23：manifest 用 Next.js 內建的 `app/manifest.ts` 慣例（不用額外套件），數值跟舊
      `pwa/vite.config.ts` 的 `VitePWA` 設定對齊（name/theme_color/background_color/icons）；
      `yarn build` 確認會自動產生 `/manifest.webmanifest` route，curl 實測內容正確、
      `Content-Type` 也對。

      service worker 沒有用 `next-pwa`／`serwist` 這類套件——考量這次專案裡已經踩過好幾次
      Next 16／Prisma 7 這種新版本跟第三方套件相容性的雷，`next-pwa` 對 Turbopack／Next 16
      的支援沒有把握，加一個不確定相容的套件風險比自己寫更大。改成手寫一支極簡的
      `public/sw.js`：網路優先、離線時退回快取、導覽請求最後退回 `/`。**這個手寫版本的取捨
      要老實說清楚**：沒有 build-time 產生的資源清單，不會預先快取整個網站，離線能力只涵蓋
      「使用者連線時實際造訪過的頁面/資源」，跟舊版 `vite-plugin-pwa`+workbox 那種「安裝當下
      就預先快取好整個 app shell」不是同一個等級的離線體驗，是刻意的簡化版，不是功能對等。
      書本內容/進度/書籤/註記本來就在 IndexedDB/localStorage，不受這個快取策略影響。
      `ServiceWorkerRegister.tsx` 只在 `NODE_ENV==='production'` 註冊，避免 `yarn dev` 時
      service worker 快取住開發資源、Fast Refresh 後畫面還是舊的（這類設定常見的坑）。

      `yarn build` 通過，curl 確認 `/sw.js` 能正常存取（`Content-Type:
      application/javascript`）。**這部分完全沒有在真實瀏覽器測過**，curl 沒辦法驗證
      service worker 真的有註冊成功、離線時是否真的能開啟已造訪過的頁面、Chrome/手機瀏覽器
      的「加到主畫面」安裝流程是否正常出現——這些都需要使用者在 `yarn start`（production
      模式，不是 `yarn dev`）下用真實瀏覽器測試，用開發者工具的 Application 分頁確認
      Manifest／Service Workers 兩個項目狀態正常。）
- [x] 加入 Clerk 登入 UI
      （2026-07-23：新增 `components/Library/AuthStatus.tsx`，插入 `Library.tsx` 兩種 header
      （空書庫／有書籍）；未登入顯示登入圖示按鈕（`SignInButton mode="modal"`，彈窗登入不用跳頁），
      已登入顯示 Clerk 的 `UserButton`。因為書庫/閱讀完全是本機功能，登入純粹是「要不要啟用雲端
      同步」的加選項，不影響現有功能。）
- [x] API Route Handlers：CRUD 進度/書籤/註記
      （2026-07-23：`/api/books`(GET)、`/api/books/[bookId]`(PUT 新增或更新書本 metadata／DELETE)、
      `/api/books/[bookId]/progress`(GET/PUT)、`/api/books/[bookId]/bookmarks`(GET/PUT 整包替換)、
      `/api/books/[bookId]/annotations`(GET/PUT 整包替換)。共用 `src/lib/requireUserId.ts`：
      沒登入直接回 `401 {"error":"unauthorized"}` JSON，不用 Clerk `auth.protect()` 的重導行為
      ——那是設計給瀏覽器導頁用的，JSON API 用重導對 `fetch()` 呼叫端不友善（`proxy.ts` 因此
      簡化成單純呼叫 `clerkMiddleware()`，不主動 protect 任何路由，交給各 API route 自己判斷）。
      書籤／註記後來從「個別新增/刪除」的 REST 風格改成「整包替換」（PUT 傳目前完整陣列，
      伺服器端 `deleteMany` + `createMany`），原因見下一項——前端本來就是整包 state 存
      localStorage，choke point 只有 `saveBookmarks`/`saveAnnotationsForBook` 這兩個函式，
      整包替換比追蹤單筆新增/刪除/改色/改筆記simpler。過程中發現本機 `Annotation`（
      `store/useAnnotationStore.ts`）其實還有 `color`（螢光筆顏色）跟 `chapter`（章節名稱，
      之後「我的筆記」列表頁用得到）兩個欄位，一開始的 schema 漏掉了，已經補上並重新
      `prisma db push` 到 Neon。`yarn build` 通過，用 curl 實測所有 API 未登入都正確回 401 JSON，
      `/`、`/private` 兩個頁面路由不受影響仍是公開的 200。
      **已知限制**：`ReadingProgress`/`Bookmark`/`Annotation` 的外鍵綁定 `(bookId, clerkUserId)`
      必須對應到已存在的 `Book` 列，也就是**前端呼叫順序上一定要先同步書本 metadata，才能寫入
      該書的進度/書籤/註記**，否則資料庫會丟外鍵違反錯誤直接 500，目前 route handler 沒有把
      這個錯誤轉成友善訊息（下一項的前端串接已經照這個順序呼叫，但錯誤處理本身還沒做）。
- [x] 前端資料層接上這些 API
      （2026-07-23：使用者選定「本機優先，登入後背景同步」——本機 localStorage/IndexedDB 永遠是
      唯一寫入目標，不受登入狀態影響；每次本機寫入完成後，額外背景發一個 fetch 去同步雲端，
      失敗（離線、未登入的 401、伺服器錯誤）一律靜默吞掉、不重試、不影響本機操作。新增
      `src/utils/cloudSync.ts` 這個共用工具，掛進既有的幾個「本來就是唯一寫入點」的函式裡，
      完全不用碰 `Reader.tsx`/`useReaderEngine.ts`/`useAnnotationPopups.ts` 等呼叫端：
      `useLibrary.ts` 的 `saveBookmarks`/`saveProgress` 各自多一行 sync 呼叫，`addBook`
      在建立與 `extractMeta` 解析完成後各同步一次書本 metadata，`removeBook` 多呼叫
      `syncRemoveBook`（雲端 cascade 刪掉該書的進度/書籤/註記）；`useAnnotationStore.ts` 的
      `saveAnnotationsForBook` 多一行 sync 呼叫。因為書籤/註記在本機都是整包陣列存
      localStorage，沒有單筆增刪的個別 API 呼叫點，這就是為什麼上一項把書籤/註記 API 改成
      整包替換。未登入時這些 fetch 一樣會發出去，只是穩定收到 401 後被吞掉——沒有另外判斷
      「有沒有登入」才發請求，刻意保持簡單。`yarn build` 通過。
      **2026-07-23 補上**：`AuthStatus.tsx` 原本未登入時只有一個 icon 按鈕，靠 hover title
      提示「登入以啟用雲端同步」，不夠明顯。改成 icon + 文字標籤（「登入以雲端備份」，桌面寬度
      才顯示文字，手機維持 icon-only 避免擠版面），跟書庫其他按鈕（例如「匯入 ePub」）的
      icon+文字慣例一致。`yarn build` 通過。**2026-07-23 使用者確認 OK**：登入用的是 Clerk
      自帶的彈窗（`SignInButton mode="modal"`），視覺檢查過沒問題。

      **2026-07-23 使用者實測回報並已修的 bug**：使用者第一次實測（登入、匯入書、翻頁、畫線），
      Neon 的 `reading_progress`/`annotations`/`bookmarks` 都是空的。從瀏覽器 Network 分頁
      + `yarn dev` 終端機的錯誤堆疊，抓到根因是 `P2003 Foreign key constraint violated`——
      這本書是在這次對話「接上 API 之前」就已經匯入到本機的，`addBook` 判斷「本機已存在
      這份內容」時只呼叫 `touchBook`，從來沒呼叫過 `syncBook`，所以 Neon 的 `books` 表根本
      沒有這本書的列，後續 progress/annotations/bookmarks 的同步請求全部因為外鍵對不到
      而 500。修法兩處：① `useLibrary.ts` 的 `addBook`，「本機已存在」分支也補上
      `syncBook(...)`（讀 `loadMeta()` 拿現有的 title/author/filename）；② `App.tsx` 新增
      一個 `useEffect`，監聽 Clerk 的 `isSignedIn`，登入那一刻把本機當下所有書本的
      metadata／進度／書籤／註記全部背景 push 一次，補上「登入當下一次性同步既有資料」這個
      原本缺的邏輯（也就是把上面「尚未做」清單的第二項一併做掉了）。`yarn build` 通過。
      使用者回報同一輪還出現過一次 `P2028 Transaction API error: Unable to start a
      transaction in the given time`（書籤的 `$transaction` 逾時）——目前判斷是短時間內
      大量重複失敗的請求（同一個 500 情境被反覆觸發）疊加造成 Neon 連線暫時繁忙的次生現象，
      FK 根因修掉後預期不會再出現，但**這只是推測，不是確認過的結論**，如果修完之後這個
      逾時錯誤還會出現，要另外處理。

      **2026-07-23 使用者驗證通過**：登出重新登入、走一次完整流程後，Neon 後台
      `books`／`reading_progress`／`bookmarks`／`annotations` 四張表都確認有資料。
      本機優先＋登入後背景同步、登入當下補推既有本機資料，這兩個機制都實測有效。
      `P2028` transaction 逾時這次沒有再出現，先前的推測（重複 500 疊加造成的次生現象）
      成立，不用另外處理。

      **2026-07-23 又抓到一個相關的競速條件 bug**：使用者反映希望「未登入時的資料，登入後
      自動走雲端」——這個機制本來就有（見上面「登入當下補推」），但檢查後發現登入當下補推
      迴圈裡，`syncBook(...)` 跟緊接著的 `syncProgress`/`syncBookmarks`/`syncAnnotations`
      都是 fire-and-forget、沒有互相等待，等於這幾個請求幾乎同時送出——如果進度/書籤/註記的
      請求比 `syncBook` 早一步抵達伺服器，雲端資料庫還沒有這本書的列，一樣會撞外鍵違反錯誤，
      跟先前那個「舊書從沒同步過」的 bug 現象相同，但根因是請求送出順序的競速，不是漏掉呼叫。
      修法：`cloudSync.ts` 每個函式改成回傳 `Promise<void>`（沿用同一個 fetch，settle 就好，
      大部分呼叫端仍然當 fire-and-forget 用、不用 await），登入補推迴圈改成對每本書
      `await syncBook(...)` 完成後才接著推該書的進度/書籤/註記，不同書之間仍然平行推
      （`Promise.all` 包每本書，每本書內部循序）。`yarn build` 通過。

      同時釐清一個使用者可能誤解的地方：**本機儲存本來就不會被雲端同步失敗影響**——不管
      有沒有登入、雲端請求成功或失敗，`localStorage`/`IndexedDB` 的寫入都是同步呼叫的第一步，
      雲端同步永遠是「寫完本機之後」才額外觸發的背景動作，失敗會被 `.catch` 吞掉，不會拋回
      呼叫端、不會讓本機儲存跟著失敗、也不會有任何錯誤跳出來擋住使用者操作。之前使用者在
      瀏覽器 Network 分頁 / 終端機看到的 500，只是背景同步請求本身失敗的紀錄，從使用者操作
      的角度完全不會感覺到——這部分不需要改，本來就是這樣設計的。

      **2026-07-23 使用者進一步反映**：未登入時背景同步請求還是會發出去、被伺服器用 401
      擋掉，雖然不影響操作，但使用者不希望看到這些請求。改成 `cloudSync.ts` 加一個模組層級
      開關 `setSyncEnabled`／`syncEnabled`，未登入時 `push()` 直接不 `fetch`（回傳
      `Promise.resolve()`），不是「送出去再被 401 擋掉」。`App.tsx` 新增一個 effect，
      監聽 `isSignedIn` 同步這個開關，且刻意排在登入補推那個 effect**之前**宣告（React
      同元件內的 effect 依宣告順序執行，這裡先開開關、下一個 effect 才用得到）。`yarn build`
      通過。

      **2026-07-23 使用者實測回報一個新問題並排查**：瀏覽器 console 印出
      `TypeError: Cannot read properties of undefined (reading 'replaceCss')`。追查 epub.js
      原始碼發現：`book.destroy()` 會把 `this.resources` 設成 `undefined`，如果開啟書本時
      內部非同步的 `replacements().then(() => this.resources.replaceCss())` 鏈還沒跑完、
      book 就被 destroy，就會撞到這個錯誤；epub.js 自己有包 `.catch(err => console.error(err))`，
      所以這個錯誤本來就只會被印在 console，不會變成沒接住的例外。使用者確認：**書本畫面正常
      顯示，只有 console 有錯誤訊息**，判斷是無害的雜訊（很可能是 dev 模式下 effect 重複
      掛載，先建立又立刻 destroy 的那個 book 實例留下的殘留錯誤）。既然 `epubPatches.ts`
      裡已經有同一類「epub.js 物件在非同步操作中被 destroy」問題的既有 patch 慣例
      （`patchRenditionPrototype`／`patchIframeViewPrototype`），跟進同樣手法新增
      `patchBookPrototype`，wrap `Book.prototype.replacements`，如果 reject 當下
      `this.resources` 已經是 undefined（代表 book 已經被 destroy，這個結果沒人在乎了）就
      靜默吞掉，否則正常往外拋。`yarn build` 通過，**這個修正還沒被使用者複測**，需要確認
      同樣情境下 console 不再印這個錯誤（或至少確認沒有引入新的問題）。

      **2026-07-23 使用者測試 OK**：未登入不再發同步請求、登入補推競速修正、epub.js
      console 錯誤，三項都驗證通過。

### Phase 3 — 新功能（在 pwa-next/ 裡做）
- [x] 新增「我的筆記」獨立列表頁面
      （2026-07-23：新增 `src/page/Notes.tsx` + `app/notes/page.tsx`（`next/dynamic` + `ssr:false`，
      跟主頁面同樣的手法，因為要讀 localStorage）。讀本機資料（跟整個 app 的「本機優先」原則
      一致，不是讀雲端資料庫——不需要登入也能用），遍歷 `useLibrary()` 的所有書本呼叫
      `loadAnnotationsForBook`，攤平成一個依時間排序、依書名分組的清單，每筆顯示劃線原文、
      筆記、章節、日期，有一個「開啟這本書 →」連結（`/?open=<bookId>`）跟刪除功能（直接讀寫
      `localStorage`，沒有透過 Reader 內的 zustand store，因為那個 store 一次只服務一本書）。
      Library 的 logo 選單新增「我的筆記」連結入口（新增 `IconNote`）。
      `App.tsx` 新增處理 `?open=` query param 的 `useEffect`（用 `next/navigation` 的
      `useSearchParams`/`useRouter`），讓從筆記頁點連結回到書庫時能自動打開對應的書、
      再清掉網址參數。`yarn build` 通過，curl 確認 `/notes` route 回 200（實際內容是
      client-only render，跟首頁一樣 curl 看不到，需要瀏覽器驗證）。**2026-07-23 使用者
      看過畫面確認 OK**（UI 元件都是直接沿用書庫既有的元件/樣式慣例，視覺上沒有問題）；
      **但「開啟這本書」連結跳轉、刪除筆記這些互動功能，還沒有明確確認實際點過測試**，
      之後如果這兩個操作出狀況要回來看這裡。）
- [x] `handleOpenBook` 補上本機檔案遺失的提示 + 重新匯入引導 + 匯入後自動用內容 hash 比對接回雲端資料
      （2026-07-23：新增 `components/Library/MissingBookModal.tsx`，`getBookUrl` 找不到檔案時
      跳出提示＋一個隱藏的檔案選取器讓使用者重新匯入；選對檔案（hash 相符）會直接接續打開，
      選錯（hash 不符）會被當成新書匯入，不強行打開，符合「不同內容不能被誤判成同一本書」。
      **過程中發現並修正一個更根本的 bug**：`addBook` 原本的「已存在」判斷只看 IndexedDB
      裡有沒有檔案，沒有另外檢查書庫清單的 metadata 是否已經有這本書的紀錄——如果檔案遺失但
      metadata 還在（這正是這個復原情境的前提），重新匯入會被誤判成「全新的書」，在書庫清單
      裡產生一筆重複項目，而不是把檔案內容補回既有紀錄。已改成同時檢查 metadata／IndexedDB
      兩者是否存在，三種情況（都存在／只有 metadata／都沒有）分開處理。`yarn build` 通過。

      **2026-07-23 使用者實測**：不是手動模擬的，測試期間 IndexedDB **自己**不見了（書庫清單
      還在、書本檔案不見）——推測跟測試過程中 `pwa-next` 的 port 換過（3000/3001）有關，但
      port 切換理論上 localStorage 應該也會一起看不到，跟實際觀察到的「清單還在、只有檔案
      不見」對不上，**確切原因還沒查清楚**，先記錄下來，不排除是瀏覽器對 IndexedDB／
      localStorage 的清除粒度本來就不同（例如 IndexedDB 儲存的是大檔案，可能被瀏覽器在
      儲存空間壓力下優先清掉），這跟使用者最初遇到的正式環境資料遺失事件是同一類問題。
      復原流程本身跑對了：重新匯入後確認只有一本、不重複，進度/書籤/註記都正確接回。
      但**書本封面沒有正確顯示**——因為封面圖存在同一個 IndexedDB 資料庫的另一個 store
      （`covers`），這次是整個資料庫一起不見，不是只有 `files`，我原本的復原邏輯只補回了
      檔案本體，沒有重新萃取封面，已修正：復原路徑現在也會重新呼叫 `extractMeta` 補回封面圖、
      更新 `hasCover`。**2026-07-23 使用者複測確認封面正確顯示，此項驗證通過。**

### Phase 4 — 測試（使用者驗證前，此專案不可視為完成）
- [ ] 情境：清除本機瀏覽器資料後重新登入，確認進度/書籤/註記皆能還原
- [ ] 情境：書本檔案遺失後重新匯入同一份 epub，確認能自動接回舊紀錄
- [ ] 情境：匯入內容不同、但檔名相同的另一本書，確認不會被誤判成同一本書接錯資料
- [ ] 情境：離線時（無網路）本機閱讀/畫記是否仍可正常運作，恢復連線後能否正確同步

### Phase 5 — 切換上線（高風險，必須使用者明確同意才能執行）
- [ ] 確認 `pwa-next/` 功能跟 `pwa/` 對等，且使用者已實際測試過
- [ ] 刪除舊 `pwa/`、把 `pwa-next/` 改名成 `pwa/`
- [ ] 確認 Vercel 部署設定（build command、根目錄等）都指向新的 `pwa/`（原 `pwa-next/`）
- [ ] 部署後在正式環境（不是 localhost）再驗證一次登入、資料同步、離線閱讀

---

## 討論紀錄

- 2026-07-23：架構修正——原本誤判為「pwa/ 不動、另外加一個 backend/ 資料夾」，使用者糾正這次
  是把整個網頁版重寫成 Next.js，Next.js 專案本身就同時是前端＋後端，最終會取代 `pwa/`。放置位置
  討論出一個過渡方案：暫時放 `pwa-next/`（`backend/` 先改名成這個），`pwa/` 維持現狀直到 UI
  也搬完、使用者實測 OK，才一次性刪舊建新切換，避免 Vercel 上的網頁版在 UI 搬遷期間掛掉。
  同一次對話完成 Phase 1：Next.js 16 專案初始化、Prisma schema（Book/ReadingProgress/Bookmark/
  Annotation，皆用 `(clerkUserId, id)` 複合鍵確保不同使用者的書本記錄不會互相覆蓋）、`prisma db
  push` 到 Neon 成功、Clerk `clerkMiddleware` 保護路由、實際用 curl 驗證 `/api/health`（查詢
  Neon 成功）跟 `/api/me`（未登入正確被擋下）。過程中發現並處理了幾個 Next.js 16 / Prisma 7
  的破壞性 API 變更（詳見上方「決定的技術棧」小節）。
- 2026-07-23：完成 Phase 2 第一項（`useLibrary.ts` id 改內容 hash），`yarn build` 通過但尚未經使用者
  在瀏覽器實測，不可視為完成，等使用者驗證後才能 commit。決定後端放同一個 repo 底下的 `backend/`
  目錄。資料庫從 Supabase 改成 Neon：使用者擔心免費額度不夠，討論後確認額度本身對這個用途（只存
  文字資料）綽綽有餘，真正的痛點是 Supabase 免費專案閒置 7 天會自動暫停、需手動去後台喚醒，Neon
  免費額度足夠且連線時自動喚醒，故改用 Neon，其餘技術棧不受影響。Supabase／Clerk 帳號使用者尚未申請。
- 2026-07-23：使用者發現書本與筆記全部消失，懷疑是清理工具誤清瀏覽器儲存。逐步討論出
  「不同步書本本體、只同步輕量記錄」的方案；確認書本 id 需改成內容綁定才能讓雲端記錄與
  重新匯入的書本接得回去；確認註記資料已含原文+筆記可獨立顯示，但書籤/進度只是座標無法
  獨立顯示；決定技術棧為 Next.js 16 + Clerk + Prisma + Supabase Postgres。
