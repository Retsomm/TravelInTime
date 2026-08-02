# Travel in Time — 沉靜式電子書閱讀器

一款專注於沉靜、專注閱讀體驗的跨平台 EPUB 閱讀器，支援語音朗讀、畫線註記、繁簡轉換。
目前包含四個子專案：穩定可用的桌面版（Electron）與網頁版（PWA），以及兩個開發中的專案——
行動 App（Expo / React Native）與網頁版重寫版（Next.js，未來將加入雲端同步）。

---

## 功能特色

- **EPUB 閱讀**：完整支援 EPUB 格式，含複雜章節結構與圖片排版
- **語音朗讀**：使用系統內建語音（無需 API），邊讀邊高亮同步，支援即時調速
- **畫線註記**：多種顏色高亮、自由加筆記，按章節分組匯出
- **繁簡轉換**：一鍵切換繁體 / 簡體中文顯示
- **閱讀設定**：字體、字級、行距、字距自由調整
- **深色模式**：自動跟隨系統或手動切換
- **閱讀進度**：自動記錄每本書的最後位置，下次繼續
- **睡眠定時器**：設定朗讀時間到自動關閉應用
- **本機優先**：書籍檔案與設定儲存於 IndexedDB / LocalStorage / 裝置本機，不上傳任何資料
  （`pwa-next/` 的雲端同步僅同步書庫清單、進度、書籤、註記等輕量資料，不包含 EPUB 檔案本體，詳見下方）

---

## 版本與現況

| 子專案 | 路徑 | 狀態 |
|---|---|---|
| 桌面版（Electron） | `electron/` + `renderer/` | 穩定，已發布 |
| 網頁版（PWA） | `pwa/` | 穩定，目前線上使用的版本 |
| 網頁版重寫（Next.js） | `pwa-next/` | 開發中，尚未上線／未取代 `pwa/` |
| 行動 App（Expo RN） | `mobile/` | 開發中，程式碼完成、待實機測試，僅設定 Android 發布 |

### 桌面版（Electron）

前往 [Releases](../../releases) 頁面下載對應平台的安裝檔：

| 平台 | 格式 |
|------|------|
| macOS | `.dmg` |
| Windows | `.exe`（NSIS 安裝精靈） |
| Linux | `.AppImage` |

### 網頁版（PWA，目前線上版本）

直接在瀏覽器開啟，支援安裝至桌面或主畫面，可離線使用。

- 原始碼位於 `pwa/` 資料夾
- 部署至 Vercel 後即可透過網址存取
- 所有資料儲存在本機瀏覽器（IndexedDB / LocalStorage），無帳號、無雲端同步

### 網頁版重寫（Next.js，開發中）

`pwa-next/` 是 `pwa/` 的重寫版本，未來會**取代**現有 `pwa/`（不是額外新增的獨立後端）。
主要目的是加入雲端同步，解決「本機儲存被清除就無法挽回」的問題：

- 使用 Clerk 登入後，書庫清單、閱讀進度、書籤、註記會同步到雲端資料庫（Postgres，透過 Prisma）
- **EPUB 檔案本體不會上傳**，只同步上述輕量資料，檔案仍需使用者自行重新匯入
- 閱讀器 UI 已從 `pwa/` 移植大部分功能，但尚未逐項比對功能是否完全對等，**尚未準備好切換上線**
- 詳細背景、決策過程與待辦見 `CLOUD_SYNC_PROGRESS.md`

### 行動 App（Expo React Native，開發中）

`mobile/` 是以 Expo（React Native）打造的行動版閱讀器，核心閱讀邏輯透過 `react-native-webview`
內嵌一份用 epub.js 打包的網頁閱讀器（`mobile/reader-web/`，由 `yarn build:reader` 產生）。

- 功能涵蓋書庫管理、EPUB 匯入、閱讀、書籤、畫線註記、語音朗讀（`expo-speech`）、繁簡轉換、深色模式
- 目前僅設定 Android 建置與發布（`eas.json`、`store-assets/google-play/`），尚未設定 iOS 上架
- 程式碼已完成函式化重構，等待使用者實機測試驗證後才算完成（見 `FP_REFACTOR_PROGRESS.md`）

---

## 技術棧

### 桌面版（Electron）

| 層級 | 技術 |
|------|------|
| 桌面框架 | Electron 28 |
| 前端 | React 18 + TypeScript + Vite |
| 樣式 | Tailwind CSS |
| EPUB 解析 | epub.js |
| 狀態管理 | Zustand |
| 中文轉換 | opencc-js |
| 語音朗讀 | Web Speech API |
| 打包發布 | electron-builder + GitHub Actions |
| 測試 | Playwright (E2E) |

### 網頁版（PWA）

| 層級 | 技術 |
|------|------|
| 前端 | React 18 + TypeScript + Vite |
| 樣式 | Tailwind CSS |
| PWA | vite-plugin-pwa + Workbox |
| EPUB 解析 | epub.js |
| 狀態管理 | Zustand |
| 中文轉換 | opencc-js |
| 語音朗讀 | Web Speech API |
| 部署 | Vercel |

### 網頁版重寫（pwa-next）

| 層級 | 技術 |
|------|------|
| 前端框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| 樣式 | Tailwind CSS 4 |
| 身份驗證 | Clerk (`@clerk/nextjs`) |
| 資料庫 | PostgreSQL + Prisma 7（driver adapter：`@prisma/adapter-pg`） |
| EPUB 解析 | epub.js |
| 狀態管理 | Zustand |
| 中文轉換 | opencc-js |

### 行動 App（mobile）

| 層級 | 技術 |
|------|------|
| 框架 | Expo（SDK 57）+ Expo Router + React Native 0.86 |
| 語言 | React 19 + TypeScript |
| EPUB 解析 | epub.js（打包成 HTML 後透過 `react-native-webview` 內嵌執行） |
| 語音朗讀 | expo-speech |
| 本機儲存 | @react-native-async-storage/async-storage、expo-file-system |
| 中文轉換 | opencc-js |
| 打包發布 | EAS Build / EAS Submit（目前僅 Android） |

---

## 開發環境啟動

### 桌面版

```bash
# 安裝依賴
yarn install
cd renderer && yarn install && cd ..

# 開發模式（同時啟動 Vite + Electron）
yarn dev
```

### 網頁版（PWA）

```bash
cd pwa
yarn install
yarn dev   # 開發伺服器 http://localhost:5174
```

### 網頁版重寫（pwa-next）

```bash
cd pwa-next
yarn install   # postinstall 會自動執行 prisma generate
yarn dev       # 開發伺服器 http://localhost:3000
```

需先設定 `.env`（Clerk 金鑰、資料庫連線字串等），詳見 `CLOUD_SYNC_PROGRESS.md`。

### 行動 App（mobile）

```bash
cd mobile
yarn install
yarn ios       # 或 yarn android / yarn web
```

`start` / `android` / `ios` 執行前會自動跑 `build:reader`，將 `mobile/reader-web/` 打包成
`mobile/lib/readerHtml.generated.ts` 供 WebView 使用，不需手動執行。

---

## 打包 / 部署

### 桌面版

```bash
# 建置
yarn build

# 打包（輸出至 release/）
yarn electron-builder
```

### 網頁版（PWA）部署至 Vercel

```bash
cd pwa && yarn build  # 輸出至 pwa/dist/
```

Vercel 專案設定：

| 設定項目 | 值 |
|---------|-----|
| Root Directory | `pwa` |
| Framework Preset | Vite |
| Build Command | `yarn build` |
| Output Directory | `dist` |

### 行動 App 打包（EAS）

```bash
cd mobile
eas build --profile preview      # 內部測試用 APK
eas build --profile production   # 上架用 Android App Bundle
eas submit --profile production  # 提交至 Google Play
```

---

## CI/CD

`.github/workflows/` 目前只涵蓋桌面版：

| Workflow | 觸發時機 | 內容 |
|---|---|---|
| `release.yml` | 推送 `v*` tag | 於 macOS / Windows / Linux 建置並發布 Electron 安裝檔 |
| `e2e.yml` | push / PR 至 main、master | 於 3 個作業系統跑 `renderer/` 的 Playwright E2E 測試 |

`pwa/`、`pwa-next/`、`mobile/` 目前沒有自動化 CI，變更後需手動建置與測試。

---

## 目錄結構

```
TravelInTime/
├── electron/           # Electron 主程序
│   ├── main.ts         # 視窗管理、自動更新
│   └── preload.ts      # IPC 安全橋接
├── renderer/            # 桌面版 React 前端
│   └── src/
│       ├── components/ # UI 元件（Reader、Library、Toolbar 等）
│       ├── hooks/       # 自訂 Hook（useTTS、useLibrary）
│       └── store/       # Zustand 狀態（閱讀設定、註記）
├── pwa/                 # 網頁版（PWA，目前線上版本）
│   ├── public/          # 靜態資源（icons）
│   ├── vite.config.ts   # PWA plugin 設定
│   └── src/              # 與桌面版共用相同元件架構
├── pwa-next/             # 網頁版重寫（Next.js + Clerk + Prisma，開發中）
│   ├── prisma/schema.prisma  # Book / ReadingProgress / Bookmark / Annotation 資料模型
│   └── src/
│       ├── app/api/     # 雲端同步 API routes
│       ├── page/        # Library / Reader / Notes / Privacy 頁面
│       └── utils/cloudSync.ts  # 登入時全量同步、資料變動時推送
├── mobile/               # 行動 App（Expo React Native，開發中）
│   ├── app/              # expo-router 路由（書庫、設定、閱讀器）
│   ├── reader-web/       # 內嵌 WebView 的 epub.js 閱讀器原始碼
│   ├── lib/readerHtml.generated.ts  # 由 reader-web 打包產生（勿手動編輯）
│   └── eas.json          # EAS Build / Submit 設定（目前僅 Android）
├── store-assets/         # 商店上架素材（目前僅 Google Play）
├── 隱私權政策.md          # 隱私權政策（涵蓋桌面版、PWA、行動 App）
├── .github/workflows/     # CI/CD（目前僅涵蓋桌面版：發布 + E2E 測試）
└── package.json           # Electron 桌面版建置設定
```

---

## 注意事項（macOS 安全性警告）

由於此應用程式尚未申請 Apple 程式碼簽署，macOS 首次開啟時可能出現安全性警告，無法直接雙擊開啟。

**解法（終端機指令）：**

1. 使用 Spotlight（`Cmd + 空白鍵`）搜尋並打開「終端機」
2. 貼上以下指令並按 `Enter`：

```bash
sudo xattr -rd com.apple.quarantine /Applications/Travel\ in\ Time.app
```

> 若應用程式不在「應用程式」資料夾，可貼上指令後加一個空格，再將應用程式圖示拖入終端機視窗。

3. 輸入 macOS 開機密碼（輸入時不會顯示字元，屬正常現象），按 `Enter`
4. 關閉終端機，重新開啟應用程式
