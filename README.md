# Travel in Time — 沉靜式電子書閱讀器

一款以 Electron + React 打造的跨平台桌面 EPUB 閱讀器，專注於沉靜、專注的閱讀體驗。
支援語音朗讀、畫線註記、繁簡轉換，所有資料完全儲存於本機，無需帳號或網路連線。

---

## 功能特色

- **EPUB 閱讀**：完整支援 EPUB 格式，含複雜章節結構與圖片排版
- **語音朗讀**：使用系統內建語音（無需 API），邊讀邊高亮同步，支援即時調速
- **畫線註記**：5 種顏色高亮、自由加筆記，按章節分組匯出
- **繁簡轉換**：一鍵切換繁體 / 簡體中文顯示
- **閱讀設定**：字體、字級、行距、字距自由調整
- **深色模式**：自動跟隨系統或手動切換
- **閱讀進度**：自動記錄每本書的最後位置，下次繼續
- **睡眠定時器**：設定朗讀時間到自動關閉應用
- **本機優先**：所有書籍與設定儲存於 IndexedDB / LocalStorage，不上傳任何資料

---

## 技術棧

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

---

## 開發環境啟動

```bash
# 安裝依賴
yarn install
cd renderer && yarn install && cd ..

# 開發模式（同時啟動 Vite + Electron）
yarn dev
```

## 打包應用

```bash
# 建置
yarn build

# 打包（輸出至 release/）
yarn electron-builder
```

---

## 下載安裝

前往 [Releases](../../releases) 頁面下載對應平台的安裝檔：

| 平台 | 格式 |
|------|------|
| macOS | `.dmg` |
| Windows | `.exe`（NSIS 安裝精靈） |
| Linux | `.AppImage` |

---

## 目錄結構

```
TravelInTime/
├── electron/           # Electron 主程序
│   ├── main.ts         # 視窗管理、自動更新
│   └── preload.ts      # IPC 安全橋接
├── renderer/           # React 前端應用
│   └── src/
│       ├── components/ # UI 元件（Reader、Library、Toolbar 等）
│       ├── hooks/      # 自訂 Hook（useTTS、useLibrary）
│       └── store/      # Zustand 狀態（閱讀設定、註記）
├── .github/workflows/  # CI/CD（自動測試 + 發布）
└── package.json
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
