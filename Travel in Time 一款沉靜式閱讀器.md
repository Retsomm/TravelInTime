# Travel in Time 一款沉靜式閱讀器

# 一、整體技術架構（先建立全局觀）

技術棧：

- 前端：React + Tailwind

- 桌面：Electron

- 後端：Node.js + Express

- 語音：OpenAI TTS API

- 書籍解析：epub.js（關鍵）

---

## 架構圖（你要這樣想）

```
Electron（桌面殼）
 ├── React UI（閱讀器）
 ├── epub.js（解析 epub）
 ├── 狀態管理（閱讀狀態、註記）
 └── 呼叫本地 API

Node.js / Express（本地 server）
 ├── TTS（OpenAI）
 ├── 資料庫（收藏 / 註記）
 └── 檔案管理（epub / audio）
```

---

# 二、核心功能拆解（產品等級設計）

我幫你分成 4 個模組

---

## 1\. 書籍閱讀系統（基礎核心）

功能：

- 匯入 epub

- 分頁閱讀

- 字體大小調整

- 主題切換（白 / 夜間）

技術：

```
epub.js + React
```

---

## 2\. 語音朗讀系統（你的亮點）

功能：

- 點擊段落朗讀

- 自動連續朗讀

- 語速調整

- 暫停 / 繼續

---

### TTS 流程（關鍵）

```
使用者選取文字
   ↓
React 傳文字給 Express
   ↓
呼叫 OpenAI TTS
   ↓
回傳 audio
   ↓
播放
```

---

## 3\. 註記系統（你說「超重要」這塊我會設計好）

功能：

- 劃線（highlight）

- 筆記（note）

- 書籤（bookmark）

- 匯出（JSON / Markdown / TXT）

---

### 註記資料結構（非常重要）

```
{
  id: "uuid",
  bookId: "book-001",
  cfi: "epubcfi(/6/2[chapter1]!/4/2/14)", // 定位位置（epub 核心）
  text: "被選取的文字",
  note: "我的筆記",
  color: "yellow",
  createdAt: "2026-03-20"
}
```

關鍵技術：

- epub CFI（定位文字）

- 不用 index，避免亂碼與錯位

---

### 匯出功能（你要打 Apple Books）

```
const exportNotes = (notes) => {
  return notes.map(n => `
## ${n.text}
- 筆記: ${n.note}
- 位置: ${n.cfi}
  `).join("\n");
};
```

支援：

- Markdown

- 純文字

- JSON（給工程師）

---

## 4\. 圖書館系統（使用者體驗）

功能：

- 收藏（favorite）

- 喜歡（like）

- 最近閱讀（recent）

- 閱讀進度

---

資料表設計：

```
books: []
favorites: []
recentReads: []
readingProgress: {
  bookId,
  cfi
}
```

---

# 三、Electron 專案結構（實務可用）

```
root
├── main (Electron 主程序)
├── renderer (React)
├── server (Express API)
└── database (SQLite)
```

---

# 四、開發階段規劃（你照這個做一定做得出來）

---

## Phase 1（基礎閱讀器）

目標：

- 可以開 epub

- 可以翻頁

技術：

- epub.js

- React state

---

## Phase 2（UI + 主題）

目標：

- Tailwind 主題切換

- 字體大小

---

## Phase 3（語音功能）

目標：

- 串接 OpenAI TTS

- 播放音訊

---

## Phase 4（註記系統）

目標：

- 劃線

- 儲存

- 顯示

---

## Phase 5（圖書館）

目標：

- 收藏

- 最近閱讀

---

## Phase 6（匯出系統）

目標：

- 一鍵匯出筆記（這會變你亮點）

---

# 五、資料庫建議（非常重要）

建議用：

- SQLite（本地 app 最適合）

---

## 表設計

```
books
notes
favorites
recent_reads
```

---

# 六、你這個專案的「差異化亮點」

你已經抓到重點了，我幫你整理：

1. 語音朗讀（接近真人）

2. 註記可匯出（打 Apple Books）

3. 本地化（隱私高）

4. Electron 跨平台

---

# 七、我給你的進階加分功能（面試會爆強）

你可以加：

- AI 摘要（書本重點整理）

- AI 問答（問書內容）

- 語音同步高亮（像 Kindle）

---

# 八、關鍵風險（你一定要知道）

## 1\. epub 解析

- 不同書格式會亂

- 要測很多檔案

## 2\. CFI 理解成本

- 一開始會卡

- 但這是核心能力

## 3\. TTS 成本

- API 有費用

- 建議做快取

---

# 九、下一步我可以幫你做什麼

我可以直接帶你進入實作，例如：

1. React + epub.js 閱讀器（從 0 到可讀書）

2. TTS 串接（完整可播放）

3. 註記系統（含 CFI）

---

# 總結

你這個專案如果做完整：

不是練習專案，是「產品級作品」

而且會讓你在前端工程師中非常突出，因為你結合了：

- UI

- 系統設計

- API 串接

- 本地應用