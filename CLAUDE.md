# CLAUDE.md — AlwaysAccessibility 專案規則

> 每次回覆前請重新確認以下所有規則。

---

## 語言規則

- **所有回覆必須使用繁體中文**，包括說明、建議、錯誤訊息解讀等。
- 程式碼內的變數、函式名稱、註解

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | React + TypeScript + Vite + Tailwind CSS |
| 後端 | Node.js + Express + TypeScript + Prisma |
| 資料庫 | PostgreSQL（透過 Supabase 托管） |
| 前端部署 | Vercel |
| 後端部署 | Render |

---

## 套件管理

- **統一使用 `yarn`**，禁止使用 `npm` 或 `pnpm`。
- 安裝套件：`yarn add <package>`
- 安裝開發依賴：`yarn add -D <package>`
- 執行指令：`yarn dev`、`yarn build`、`yarn start` 等

---

## 程式碼原則

- 優先編輯現有檔案，非必要不建立新檔。
- 保持簡潔，不過度設計，不加入未被要求的功能。
- 安全優先：避免 SQL Injection、XSS、Command Injection 等常見漏洞。
- 不加入多餘的 console.log、型別標注或註解（除非邏輯不明顯）。
- 函數使用const 箭頭函數寫法
- CSS使用className寫法，並免使用inlineStyle
---

## 測試原則（重要）

- **每完成一個階段，必須實際測試確認功能正常，才能宣告完成。**
- 不可僅憑「程式碼看起來正確」就假設功能正常。
- 測試方式依情境而定：
  - 後端 API：用 `curl` 或啟動 server 實際打 endpoint
  - 前端：`yarn build` 確認無編譯錯誤，必要時描述測試步驟請使用者驗證
  - 資料庫：確認 Prisma migration 套用成功、schema 正確
- 若測試發現錯誤，先修復再回報，不要帶著已知錯誤結束任務。
