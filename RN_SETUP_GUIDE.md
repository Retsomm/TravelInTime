# React Native App 建置指南（取材自 SelfMap 專案的實戰踩坑）

> 本文件整理 SelfMap 專案（Next.js web + Expo/RN mobile 的 monorepo）在建置 RN App 時的實際設定與已驗證踩坑，供新專案「網頁 → RN App」改寫時參考，避免重複踩坑。

---

## 1. 專案結構：Monorepo 內獨立資料夾

SelfMap 的作法：web 與 mobile **完全分離、不共用元件**，只共用「後端 API」。

```
repo-root/
├── app/            ← Next.js web（App Router）
├── components/     ← web 專用元件
├── lib/            ← web 專用邏輯
├── mobile/         ← 獨立的 Expo/RN app（自己的 package.json、node_modules）
│   ├── app/        ← expo-router 檔案式路由
│   ├── components/
│   ├── lib/
│   ├── hooks/
│   ├── constants/
│   ├── app.json
│   ├── eas.json
│   └── package.json
```

**關鍵教訓**：
- mobile 是**獨立的 npm 專案**（有自己的 `package.json`、`node_modules`），不是 web 的子模組。所有 RN 指令都必須先 `cd mobile`，否則會誤用 web 的 `.env.local`、誤判 Expo 未安裝。
- web 與 mobile 的資料格式可能不同（例如同樣是「地點搜尋」，web 用 `GeoResult` 型別 + API 查詢，mobile 用純靜態 `City` 型別），**不要假設可以直接複用 web 元件邏輯**，通常需要依 RN 生態重寫。
- 兩邊真正共用的只有：後端資料庫 / API 路由（單一事實來源），前端程式碼一律分開維護。

---

## 2. 核心版本與套件（截至 2026-07，SelfMap 使用版本 — 舊版參考，TravelInTime 本身的 mobile/ 實際基準見第 11 節，是 Expo SDK 57 / RN 0.86）

```json
{
  "expo": "~56.0.12",
  "expo-router": "^56.2.11",
  "react": "19.2.3",
  "react-native": "0.85.3",
  "react-native-screens": "^4.25.2",
  "react-native-safe-area-context": "^5.8.0",
  "react-native-svg": "^15.15.5",
  "typescript": "~6.0.3"
}
```

⚠️ **重要**：Expo SDK 56 / RN 0.85 是很新的版本，訓練資料可能過時。**寫任何程式碼前，先讀 `node_modules/expo` 或官方 `https://docs.expo.dev/versions/vXX.0.0/` 對應版本的文件**，不要憑舊記憶假設 API。SelfMap 專案本身也在 `mobile/AGENTS.md` 明確要求這件事。

常用功能對應套件：
- 認證：`@clerk/expo`（若用 Clerk）+ `expo-secure-store`（token 儲存）+ `expo-auth-session`
- Dev Client：`expo-dev-client`（實機/模擬器安裝自訂原生模組時必需）
- 圖片：`expo-image-picker`
- PDF/分享：`expo-print` + `expo-sharing`
- SVG 繪圖：`react-native-svg`
- 本地驗證（Face ID/指紋）：`expo-local-authentication`

---

## 3. 初始化步驟

```bash
cd repo-root
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install expo-router expo-dev-client expo-constants expo-linking react-native-safe-area-context react-native-screens
```

`app.json` 最少要設定：
```json
{
  "expo": {
    "name": "AppName",
    "slug": "app-slug",
    "scheme": "app-scheme",
    "ios": { "bundleIdentifier": "com.yourcompany.app" },
    "android": { "package": "com.yourcompany.app" },
    "plugins": ["expo-dev-client", "expo-router"],
    "experiments": { "typedRoutes": true }
  }
}
```

`eas.json`（EAS Build 設定，若要打包成 apk/ipa）：
```json
{
  "cli": { "version": ">= 20.3.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "android": { "buildType": "apk", "autoIncrement": true } },
    "production": { "android": { "buildType": "app-bundle", "autoIncrement": true } }
  },
  "submit": { "production": {} }
}
```

---

## 4. 本機建置環境設定（macOS + Android Studio）

若要在**本機 Android 模擬器**用 `npx expo run:android` 建置 Dev Client（而非只用 Expo Go），需要先設定：

```bash
# ~/.zshrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

⚠️ **非互動式 shell（例如工具直接呼叫的 bash session）不會自動繼承 `.zshrc`**，若透過腳本/CI 執行指令，每次都要在指令前手動 `export` 這三個變數，不能只寫進 `.zshrc` 就當作一勞永逸。

### Gradle 版本不相容問題（RN 0.85 + Gradle 9+ 常見）

若 build 出現 `NoSuchFieldError: JvmVendorSpec.IBM_SEMERU`：
- **根因**：新版 Gradle（9.x）拿掉了 `JvmVendorSpec.IBM_SEMERU` 欄位，但 `node_modules/@react-native/gradle-plugin/settings.gradle.kts` 內寫死引用舊版 `foojay-resolver-convention:0.5.0`，該舊版外掛仍在用這個欄位。
- **診斷法**：用 `./gradlew app:assembleDebug --stacktrace` 看 `Caused by` 那行，才會看到真正是 `foojay-resolver` 出錯（不看 stacktrace 只看到最外層的 IBM_SEMERU 訊息，容易誤判成 daemon 快取問題）。
- **無效嘗試**：`./gradlew --stop` 清 daemon、`org.gradle.java.installations.auto-download=false` 都沒用，因為問題是 class 靜態初始化階段就崩潰。
- **解法**：把 `node_modules/@react-native/gradle-plugin/settings.gradle.kts` 裡 `foojay-resolver-convention` 版本從 `0.5.0` 改成 `1.0.0`（去 `https://plugins.gradle.org/m2/org/gradle/toolchains/foojay-resolver-convention/` 查最新版）。
- **限制**：這是改 `node_modules`，`npm install` 後會被蓋掉，只是暫時解法；長期應等 `@react-native/gradle-plugin` 官方升級，或用 `patch-package` 固化。

### 模擬器鍵盤不會自動彈出

Android 模擬器預設模擬「已接實體鍵盤」，導致點輸入框不會跳出虛擬鍵盤：
```bash
adb shell settings put secure show_ime_with_hard_keyboard 1
```
不用重開 AVD，立即生效。

---

## 5. 實機測試：Expo Dev Client 連線診斷順序

實機掃 QR 後看不到修改、顯示 `No apps connected` 時，**由外而內排查**，不要一開始就猜程式碼或快取問題：

1. `ifconfig` 確認電腦目前作用中網卡 IP，是否跟 terminal 印出的 `exp://<IP>:<port>` 一致（常見錯誤：電腦連了兩張網卡，Expo 選錯 IP）
2. 確認防火牆沒擋 node：`/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate`
3. **用手機瀏覽器直接開 `http://<電腦IP>:<port>`** 當最直接的連線測試：
   - 「無法連線」→ 網路真的不通（常見原因：手機熱點開了「用戶端隔離 / AP isolation」）
   - 網頁載入成功但空白 → 網路是通的，問題在 Dev Client App 本身（快取了舊連線 URL、沒完全關閉重開）
4. 網路確認通了，App 端還是連不上，才去清 App 快取 / 強制關閉重開 / 重新掃全新 QR（port 變了代表新 session，別用最近連線紀錄）

**Why**：App 端問題和網路問題表面症狀都是「連不上」，但修法完全不同，先排除網路層再往上查，才不會瞎猜浪費時間。

---

## 6. 鍵盤遮擋輸入框（表單頁常見問題）

`KeyboardAvoidingView behavior='height'` 在 Android 上**不可靠**（尤其 Expo SDK 56 edge-to-edge 強制 translucent status bar 時，視窗不會真的縮小）。已驗證的做法：

- **iOS**：交給 `ScrollView` 的 `automaticallyAdjustKeyboardInsets={true}`（原生機制），不要疊加 `KeyboardAvoidingView`（兩者疊加會多出一段空白）、也不要再手動 `scrollToEnd`。
- **Android**：寫一個 `useKeyboardHeight` hook，監聽 `Keyboard.addListener('keyboardDidShow'/'keyboardDidHide')` 拿到實測鍵盤高度，動態加到 `ScrollView` 的 `contentContainerStyle.paddingBottom`；鍵盤高度變 >0 時用 `useEffect` 觸發 `scrollToEnd()`（比固定 timeout 準）。
- 若畫面的 footer 跟 ScrollView 同層（不在 ScrollView 內）：iOS 保留 `KeyboardAvoidingView behavior='padding'` 把整體往上推；Android 改用算出的鍵盤高度當 `marginBottom`。

```ts
// useKeyboardHeight.ts 範例骨架
import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
```

---

## 7. iOS 26 Liquid Glass：原生 header 返回鍵白色圓形背景

iOS 26 + `react-native-screens` 的 native-stack，只要用**原生 header**（`headerShown: true`），左右按鈕（含自訂 `headerLeft`）都會被 UINavigationBar 自動包上白色玻璃圓形背景 —— 這是 UIKit chrome 層級行為，**不是** headerLeft 內容樣式問題，改什麼 JS 內容都沒用，`Info.plist` 的 `UIDesignRequiresCompatibility` 也無效。

**解法**：畫面改用 `headerShown: false`，在畫面內自繪返回列（自訂 `NavBackHeader` 元件：純文字 `‹` + 置中標題 + `router.back()`）。
- `SafeAreaView` 記得加回 `edges={['top']}`（原本靠原生 header 撐開的 top inset 要自己吃）。
- 返回鍵邏輯要先判斷 `router.canGoBack()`，沒有上一頁時（deep link 直接開啟）用 `router.replace(fallbackRoute)` 導回首頁分頁，避免死路。
- 純 JS/元件層級改動，不需要重新 build 原生專案。

---

## 8. 設計原則：自由文字搜尋比對，命中多筆要視為錯誤

若做「城市/地點搜尋」這類無下拉選單限制、使用者可打任意子字串的欄位，比對邏輯命中多筆時**不要靜默取第一筆**（例如打 "New" 同時符合「New Taipei」與「Newcastle」，兩者時區完全不同，選錯不會報錯，只會讓後續計算結果悄悄跑掉，難以被使用者發現）。

**原則**：用 `filter()` 取代 `find()`，命中 `> 1` 筆視為輸入不夠明確，回傳 `null` / 拋出「請確認拼字」錯誤，交由呼叫端顯示錯誤提示，而不是自動選一個。

---

## 9. 除錯前先確認是 Web 還是 Mobile

Monorepo 常見誤區：使用者回報「手機上」的問題，實際上可能是：
- **Web PWA**（瀏覽器風格 UI）→ 改 `app/`、`components/`
- **Native app**（底部 Tab Bar、圓角卡片、系統原生 Picker/keyboard）→ 改 `mobile/`

**判斷依據**：截圖有底部 native Tab Bar、圓角卡片、系統選擇器 → 一定是 Mobile。使用者提到「iOS/Android 模擬器」→ 優先查 mobile 目錄。不確定時直接問一句「這是網頁還是 App？」，比連續改錯地方三次划算。

---

## 10. 建置檢查清單（新專案照抄）

- [ ] `cd mobile`（或對應資料夾）後才跑任何 expo/npm 指令
- [ ] `app.json` 設定 `scheme`、`bundleIdentifier`/`package`、需要的 `plugins`
- [ ] 若要本機 Android build：確認 `ANDROID_HOME`/`JAVA_HOME` 已設定且該 shell 有繼承
- [ ] `npx expo run:android` 若噴 `IBM_SEMERU` 錯誤，檢查 `foojay-resolver-convention` 版本
- [ ] 表單頁鍵盤處理：iOS 用 `automaticallyAdjustKeyboardInsets`，Android 用 `useKeyboardHeight` 手動 padding，兩者分開寫，不要混用
- [ ] 若用原生 header 且在意 iOS 26 返回鍵樣式：預先規劃畫面內自繪 header 的共用元件
- [ ] 任何自由文字搜尋比對邏輯：命中多筆一律視為錯誤，不要隨機選一筆
- [ ] 實機連不上 Dev Client 時，先用手機瀏覽器戳 `IP:port`，別急著猜程式碼

---

## 11. TravelInTime 專案進度追蹤（跨對話同步用，每次階段性完成請更新此段）

### 目前狀態（最後更新：2026-07-03）

`mobile/` 實際套件版本是 **Expo SDK 57 / RN 0.86**（比本文件第 2 節記錄的 SDK 56/RN 0.85 又往前一版，`mobile/AGENTS.md` 已提醒寫程式前要查對應版本官方文件，不要用訓練資料舊記憶）。

**epub 渲染方案已決策**：採用「B：自建 WebView + 自帶 epub.js」。**MVP 版本已實作完成**（尚未實機/模擬器測試，見下方待驗證清單），細節：

- `mobile/reader-web/index.ts`：獨立的瀏覽器端 TS 原始碼（不經 Metro，只給 esbuild 打包），用 `epubjs` 直接 `ePub(arrayBuffer)` 渲染進 `#viewer`，監聽 `relocated` 事件回傳 cfi/頁碼給 RN；翻頁用 tap zone（畫面左 30% = 上一頁、右 30% = 下一頁），對外層 `#viewer` 與 iframe 內 `doc` 都各自掛一份 click listener（因為 epub 內容渲染在 iframe 裡，外層 click 事件不會穿透）。
- `mobile/scripts/build-reader-html.js`：`yarn build:reader` 執行，用 esbuild 把 `reader-web/index.ts` bundle 成單一 IIFE，包進 HTML 樣板，輸出成 `mobile/lib/readerHtml.generated.ts`（匯出一個 `READER_HTML` 字串常數，避免處理 Metro 的 html asset 設定）。已在 `package.json` 加上 `prestart`/`preandroid`/`preios` hook 自動先跑這個腳本，**但目前只用 pre-hook 觸發，改 `reader-web/index.ts` 後若不是透過 yarn start/android/ios 啟動，需要手動重跑 `yarn build:reader`**。
- `mobile/app/reader/[id].tsx`：整頁改用 `react-native-webview` 的 `WebView`，載入 `READER_HTML`；等 WebView 回報 `{type:'ready'}` 後，RN 端用 `getBookBase64()`（`mobile/lib/library.ts` 新增的 helper，讀取 epub 檔案轉 base64）+ `loadReadingCfi()` 讀取上次進度，一起用 `postMessage` 丟進 WebView；WebView 收到 `relocated` 訊息後回存 `saveReadingCfi` 與 `updateProgress`（用 epub.js 單一章節內的 `displayed.page/total` 概算全書進度，**不是** Electron 版那種背景逐章掃描算出的精確頁數，之後如需要精確全書頁碼需額外實作）。
- **已知型別坑**：`react-native-webview` 用 `npx expo install` 裝的相容版本是 `13.16.1`（比 `yarn add` 裝到的最新版 `14.0.1` 舊一版）——`14.0.1` 的 `index.d.ts` 把 `WebView<P = undefined>` 泛型預設值寫成 `undefined`，會讓 `Component<WebViewProps & P>` 的 props 型別整個塌縮成 `never`，導致所有 WebView props 在 tsc 底下報錯（`Overload 2 of 2, props: never`）。`13.16.1` 的型別把預設值改回 `P = {}`，此問題不會發生。**教訓**：裝 RN 原生模組一律用 `npx expo install <pkg>` 而非 `yarn add`，才會裝到該 Expo SDK 版本驗證過的相容版本；另外也在 `tsconfig.json` 加了 `"moduleSuffixes": [".ios", ".android", ""]`（一般 RN+TS 專案建議設定，這次雖非此問題根因，但無害且是常見最佳實踐，先留著）。
- **未做**（有意先跳過，之後任務再補）：翻頁動畫/手勢滑動（目前只有點擊翻頁，沒有 swipe gesture）、深色模式套用進 WebView 內容（`applyDarkOverride` 等 Electron 版邏輯尚未搬）、字體大小/字距/行距等閱讀設定套用、TTS 高亮、註記劃線、書籤導覽、章節目錄面板、epub metadata（書名/封面）——這些都對應本節下方「後續重構任務」第 5~9 項，故意不在這次一次做完，避免單一改動範圍過大難以測試。
- **驗證狀態**：`npx tsc --noEmit`、`npx expo-doctor`（20/20）、`npx expo export --platform android`皆通過，這是純打包驗證，不等於功能驗證。

**已知問題與修正（2026-07-03 使用者實測回報後）**：
  - 症狀：iOS 模擬機點擊完全無法翻頁；Android 模擬機可以翻頁，但翻個 4-5 頁後開始不受控地來回翻頁。
  - 修正方向（`mobile/reader-web/index.ts`）：
    1. 翻頁點擊偵測從 `click` 改成 `touchend`（含位移 <12px、時間 <500ms 的門檻判斷是否為單純點擊），因為 WKWebView（iOS）內巢狀 iframe 的合成 `click` 事件常不可靠；保留 `click` 當 fallback，但同一次觸控若已被 `touchend` 處理，500ms 內接著觸發的合成 click 直接忽略，避免同一下點擊觸發兩次翻頁。
    2. 加上翻頁忙碌鎖（`navBusy`）：`prev()`/`next()` 呼叫後鎖住，直到 `relocated` 事件觸發後再延遲 250ms 解鎖（或 1.5s 逾時強制解鎖保險），擋掉在 epub.js 尚未完成上一次 relocate 前又收到下一次翻頁請求——這是先前 relocate 計算錯亂、來回翻頁的最可能成因（Electron 版 `Reader.tsx` 的 `ttsAutoFollowBusyRef` 也是用同一種鎖來擋 epub.js 連續呼叫 `next()` 不穩定的問題，這次是同一類坑）。
    3. `resize` 事件加上 150ms debounce，並在寬高未實際變化時略過，避免潛在的 resize→relocate→resize 迴圈。
  - **這個修正沒有實機/模擬器驗證，只跑過 `tsc`/`expo export` 確認能編譯打包**。我沒辦法在這個環境跑 iOS/Android 模擬器，請你重新 `yarn build:reader` 後（若用 `yarn ios`/`yarn android` 啟動會自動先跑）在兩邊模擬器實測翻頁是否正常，尤其留意：iOS 點擊翻頁有沒有反應、Android 連續翻多頁（10 頁以上）是否還會出現來回跳頁。若 iOS 仍無反應，可能要換更底層的診斷方式（例如先確認 WebView 本身有沒有收到 touch 事件，而不是繼續猜測）。

**新增：滑動翻頁**（2026-07-03，使用者提到「網頁版的手機模式可以滑動翻頁」後新增）：
  - 先查證過 `renderer/src/page/Reader.tsx`：**Electron/網頁版目前其實沒有實作滑動翻頁**，只有點擊左右箭頭按鈕、鍵盤方向鍵，`touchstart` 監聽只用來關 popup。也確認過 `epubjs` 套件本身的「滑動吸附」功能（`managers/helpers/snap.js`）只有 `manager: 'continuous'` 才會啟用，我們用的是預設 manager，並沒有內建滑動翻頁。
  - 因此滑動翻頁是在 `mobile/reader-web/index.ts` 的 `registerTapZone` 內**新增**的邏輯（不是移植自網頁版）：同一組 `touchstart`/`touchend` 座標，`touchend` 時先判斷「水平位移 > 50px 且明顯大於垂直位移、時間 < 800ms」視為滑動（往左滑=下一頁、往右滑=上一頁），否則才落回原本「位移 <12px 判定為單純點擊」的 tap zone 邏輯；並加了「若目前有選取文字（selection 非空）就不觸發滑動」的保護，避免以後加上劃詞標記功能時互相打架。
  - 同樣**尚未實機/模擬器驗證**，只跑過 `tsc`/`expo export`。目前不支援 RTL 閱讀方向（滑動方向固定當作 LTR），`BookSettings.readingDirection` 這個設定值目前也還沒接進 `reader-web`。

**第二輪回報後的修正**（2026-07-03）：使用者實測結果——Android 滑動翻頁（左滑右滑皆可）正常，但點擊翻頁不穩定、可能來回翻頁；iOS 點擊、滑動翻頁都完全沒反應，但左滑會觸發返回書櫃頁（RN Stack navigator 內建的 edge-swipe-back 手勢）。
  - **iOS 診斷**：左滑觸發到「返回上一頁」這個系統手勢，代表觸控事件根本沒有被 WebView 內容接住，而是直接穿透給了外層 native 手勢辨識器。最常見成因：`react-native-webview` 預設會用一個 `UIScrollView` 包住內容（`scrollEnabled` 預設 `true`），但我們的內容剛好完全貼合畫面、不需要任何原生捲動（翻頁全部靠 epub.js/JS 處理），這種情況下 WebView 的手勢辨識器有時不會確實「認領」觸控，導致水平滑動被系統當成沒人要處理，繼續往上傳給 Stack navigator 的邊緣返回手勢。
    - 修正（`mobile/app/reader/[id].tsx`）：`<WebView>` 加上 `scrollEnabled={false}`、`bounces={false}`（iOS 專用）、`overScrollMode="never"`（Android 專用，無害保留）。這是 JS 端的 prop，不需要重新 `expo run:ios`/`run:android` 原生編譯，重新整理 JS bundle 就會生效。
  - **Android 點擊不穩定診斷**：滑動翻頁用「touchstart→touchend 座標差值 `dx`」判斷方向，只看相對位移，跟畫面寬度無關，所以穩定；點擊翻頁區（tap zone）則是拿 `clientX` 跟畫面寬度（`width*0.3`／`width*0.7`）比較決定方向，一旦「量到的寬度」跟「畫面實際寬度」對不上，就會讓同一個點擊位置有時判定成上一頁、有時判定成下一頁，表現就是「來回翻頁」。最可疑的成因：epub.js 的 `.epub-container` 預設是 `justify-content: center` 的 flex 容器，如果 `book.renderTo()` 當下量到的寬高跟畫面實際尺寸有一點落差，內容就會被置中，導致 iframe 內部座標系統跟外層畫面對不齊——**這正是 Electron 版 `renderer/src/page/Reader.tsx` 之前踩過、且已經修過的同一顆坑**（`.epub-container { justify-content: flex-start !important; }`）。
    - 修正（`mobile/scripts/build-reader-html.js`）：在產生的 HTML `<style>` 內加上同樣的 `.epub-container { justify-content: flex-start !important; }` 規則，防止內容被置中造成座標偏移。
  - **這兩個修正都還沒有實機/模擬器驗證**，只跑過 `tsc`/`expo export`（`scrollEnabled`/`bounces` 是純 JS prop 不影響編譯；CSS 規則是字串樣板，esbuild 打包沒有報錯）。麻煩重新測試：iOS 現在點擊/滑動翻頁是否有反應（若還是沒反應，代表根因不是 scrollEnabled，需要換更直接的方式確認，例如先用 remote debugger 確認 WebView 內部有沒有收到 touch 事件）；Android 多翻幾頁（含跨章節）點擊翻頁是否還會忽前忽後。

**第三輪：iOS 真正根因確認 + 拿掉點擊翻頁改成純滑動**（2026-07-03）：
  - `scrollEnabled={false}` 沒解決 iOS 問題，於是加了診斷 log（`mobile/reader-web/index.ts` 的 `debugLog`，透過 postMessage 把每個觸控階段回報給 RN，RN 端用 `console.log('[reader-web debug]', ...)` 印到 Metro terminal）。第一輪測試發現**連最外層 `document` 的 `touchstart` 都沒有任何 log**，代表 WebView 從頭到尾沒收到任何觸控事件，問題比 WebView 內部設定更外層。
  - 對照「左滑會觸發返回書櫃頁」這個現象，判斷是 **expo-router／React Navigation 的 Stack 在 iOS 預設開啟的滑動返回手勢**（`gestureEnabled`，預設整個畫面範圍都算，不只邊緣）搶在 WebView 之前攔截了所有觸控。修正：`mobile/app/_layout.tsx` 幫 `reader/[id]` 這個 route 加上 `gestureEnabled: false`。加了之後**確認有效**——log 開始正常出現，觸控事件也拿到了。返回書櫃改回只能用畫面左上角 `‹` 按鈕（原本就有）。
  - 拿掉這個手勢之後才看得到真正的數據，結果又發現另一個問題：**iOS WKWebView 裡，epub.js 內容 iframe 回報的 `window.innerWidth` 跟觸控 `clientX` 座標，數值高達數千 px**（例如 `width=6165`、`clientX=4454`），明顯不是單頁可視寬度／座標，而是某種橫跨多章節、經過內部捲動位移的完整內容畫布座標系。用這組數字去算「畫面左 30%／右 30%」的點擊翻頁區完全不可靠——這解釋了 Android 點擊翻頁忽前忽後、iOS 點擊完全無反應（因為座標系不對，永遠落不進正確的 zone）。
  - **決定拿掉點擊翻頁（tap zone）功能，只留滑動翻頁**：滑動判斷只用「touchend 座標 − touchstart 座標」的相對位移，不受這個座標系問題影響（swipe 在 Android 本來就穩定，iOS 拿掉手勢衝突後這次測試 log 也顯示 swipe 判斷跟呼叫 `turnPage()` 都正常觸發）。`mobile/reader-web/index.ts` 的 `registerTapZone`/`handleTap`（width-based 版本）已整個移除，改成單純的 `registerSwipeZone`。
  - **驗證狀態**：`tsc`、`expo export --platform android`、`expo export --platform ios` 皆通過。**滑動翻頁在 iOS 上是否真的會讓畫面翻頁（不只是 log 顯示呼叫了 turnPage），以及 Android 拿掉點擊翻頁後滑動是否還是穩定，都還沒有使用者這輪重新實測確認**，診斷用的 `debugLog`／`console.log('[reader-web debug]', ...)` 暫時保留，確認穩定後應該移除。

已完成：
- [x] `cd repo-root && npx create-expo-app@latest mobile --template blank-typescript`，改用 `yarn install`（已移除 `package-lock.json`，統一用 `yarn.lock`）
- [x] 安裝 `expo-router`、`expo-dev-client`、`react-native-safe-area-context`、`react-native-screens`、`expo-constants`、`expo-linking`
- [x] `mobile/app.json`：`name: "Travel in Time"`、`slug: "travel-in-time"`、`scheme: "travelintime"`、`ios.bundleIdentifier` / `android.package: "com.travelintime.app"`（比照 Electron 版 appId）、`plugins: ["expo-router", "expo-dev-client"]`、`experiments.typedRoutes: true`
- [x] `mobile/eas.json` 建立（development/preview/production 三種 build profile）
- [x] `package.json` 的 `main` 改為 `"expo-router/entry"`，刪除舊的 `App.tsx` / `index.ts`
- [x] 頁面骨架：
  - `mobile/app/_layout.tsx` — 根 Stack，掛 `(tabs)` 與 `reader/[id]`
  - `mobile/app/(tabs)/_layout.tsx` — Tab 導覽（書櫃／設定）
  - `mobile/app/(tabs)/settings.tsx` — 設定頁骨架（尚無邏輯）
  - `mobile/app/reader/[id].tsx` — 閱讀頁骨架，依第 7 節做法自繪返回列（`headerShown: false` + 自訂 `‹` 返回按鈕 + `router.canGoBack()` 判斷），已接上書籍中繼資料（顯示書名、呼叫 `touchBook`），epub 內容渲染仍是佔位文字
- [x] **書籍儲存與檔案存取**（對應重構任務第 2 項）：`mobile/lib/library.ts`
  - 用 `expo-file-system` 新版 `File`/`Directory` API（SDK 57，非舊版 legacy API）：`File.pickFileAsync({ mimeTypes: ['application/epub+zip'] })` 選檔 → `copy()` 進 `Paths.document/books/` 沙盒目錄
  - 中繼資料（書名/作者/進度）、閱讀進度 CFI、書本設定、書籤都存在 `@react-native-async-storage/async-storage`（對應 web 版 `useLibrary.ts` 的 `localStorage` 職責）
  - 提供 `listBooks`/`addBook`/`removeBook`/`touchBook`/`updateProgress`/`saveReadingCfi`/`loadReadingCfi`/`saveBookSettings`/`loadBookSettings`/`saveBookmarks`/`loadBookmarks`
  - **未做**：epub metadata（書名/作者/封面）擷取——web 版用 `epubMetadata.ts` 解析 epub 內的 opf/封面圖，RN 版目前只用檔名當書名，之後可能需要 `jszip`（相容性未驗證）或等 WebView epub.js 方案做好後由 JS 端回傳
- [x] **書櫃頁（`(tabs)/index.tsx`）基本實作**（對應重構任務第 3 項）：`FlatList` 列出書籍、右上角「+ 加入書籍」呼叫 `addBook()`、點擊進入 `reader/[id]`、長按跳出刪除確認（`Alert`）、用 `expo-router` 的 `useFocusEffect`（而非 `@react-navigation/native`，該套件未被直接安裝）在頁面聚焦時重新讀取清單
- [x] 驗證：`npx tsc --noEmit` 無錯誤、`npx expo-doctor` 20/20 通過、`npx expo export --platform android` 打包成功（1205 modules）
- [x] **使用者已在 iOS 模擬器與 Android 模擬器實測「加入書籍」流程，皆匯入成功**（2026-07-03）：`File.pickFileAsync` 系統檔案選擇器、`copy()` 寫入沙盒目錄、AsyncStorage 讀寫皆正常運作。加裝 `@react-native-async-storage/async-storage` 後需先跑一次 `expo run:android` / `expo run:ios` 重新編譯 Dev Client（純 JS reload 不會連結新的原生模組）才能生效，這點已驗證。
- [x] **epub 渲染 MVP（`reader/[id].tsx`）**（對應重構任務第 1 項 + 第 4 項）：WebView + 自帶 epub.js，可載入書籍、tap 翻頁、進度回存，細節見上方「epub 渲染方案已決策」段落。**尚未實機/模擬器測試**。
- [ ] **尚未驗證**：epub 渲染 MVP 尚未在模擬器/實機實際打開一本書測試；書櫃頁的刪除書籍、進度顯示等其餘互動尚未逐一實測。

### 對應到 Electron 版本的既有功能（`renderer/src/`）

| Web/Electron 檔案 | 功能 | RN 對應狀態 |
|---|---|---|
| `renderer/src/page/Library.tsx` | 書櫃：書籍清單、加入/移除書籍、封面 | 僅有空殼 `(tabs)/index.tsx` |
| `renderer/src/page/Reader.tsx` | 閱讀器：epub.js 渲染、翻頁 | 僅有空殼 `reader/[id].tsx`，**epub.js 是純 Web 套件，RN 上無法直接用**，需另尋方案（見下方重構任務） |
| `renderer/src/hooks/useLibrary.ts` | 書籍存取邏輯（檔案系統） | 未搬移，RN 需改用 `expo-file-system` / `expo-sqlite` |
| App.tsx 的 `darkMode` 狀態 | 深色模式切換 | 未搬移，設定頁骨架尚無邏輯 |
| TTS 朗讀、底部控制列（見 git log） | 朗讀 + 高亮 + 控制列 | 未搬移 |
| 註記筆記功能（見 git log） | 讀書筆記 | 未搬移 |

### 後續重構任務（依建議順序）

1. ~~**epub 渲染方案選型與實作**~~ **MVP 已完成**（2026-07-03）：`react-native-webview` + `mobile/reader-web/index.ts`（自帶 epub.js，esbuild 打包成 `mobile/lib/readerHtml.generated.ts`），已接上 `mobile/lib/library.ts` 的 `getBookBase64`/`saveReadingCfi`/`loadReadingCfi`/`updateProgress`。**尚未做**：翻頁手勢滑動（目前只有 tap zone）、深色模式/字體設定套用進 WebView 內容、精確全書頁碼（目前用單章節 page/total 概算）。**尚未實機測試**，下一步優先做這個。
   - 已放棄的候選：`@epubjs-react-native/core`（npm 最後發布 2025-01，與 RN 0.86 相容性未知，風險較高）。
2. ~~**書籍儲存與檔案存取**~~ **已完成**：`mobile/lib/library.ts`，見上方「已完成」清單。~~epub metadata（書名/作者/封面）擷取仍未做~~ **已完成**（2026-07-04，見上方「第四輪」段落），借用 WebView 內的 epub.js 擷取，**尚未實機/模擬器測試**。
3. ~~**書櫃頁（`(tabs)/index.tsx`）實作**~~ **已完成基本版，加入書籍流程已在 iOS/Android 模擬器實測成功**：清單、加入、長按刪除、點擊進入 `reader/[id]`。~~未做：封面縮圖（因尚無 metadata 擷取）~~ **封面縮圖已實作**（2026-07-04，尚未實機測試）；格狀版面仍未做（目前是清單）；刪除書籍、進度顯示尚未逐一實測。
4. ~~**閱讀頁（`reader/[id].tsx`）實作**~~ **MVP 已完成**（併入第 1 點）：接上 epub 渲染方案、tap 翻頁、閱讀進度回存。**下一步待驗證**：實機/模擬器實測 → 再補翻頁滑動手勢、閱讀設定（字體/深色）套用進 WebView 內容。
5. **TTS 朗讀功能**：評估 `expo-speech`（朗讀）+ 需自行實作高亮同步邏輯（web 版原本綁定 epub.js 的 CFI，RN 需視渲染方案重新設計事件橋接）。
6. **主題/深色模式**：比照 Electron 版 `darkMode` 狀態，搬到設定頁骨架，需決定用 RN 的 `useColorScheme` 自動跟隨系統，或維持手動切換 + 持久化（`AsyncStorage`）。
7. ~~**註記筆記功能**~~ **第一版已完成**（2026-07-05，見上方「第十八輪」）：劃線＋顏色＋感想筆記＋清單管理＋匯出（`Share.share`）皆已實作，儲存方式同第 2 點的本地儲存策略。**尚未實機測試**，且劃線操作列刻意改成底部固定列而非網頁版的浮動泡泡（避開已知的 iframe 座標系問題）。
8. **鍵盤處理**：若任一頁面（例如新增筆記表單）需要文字輸入，套用第 6 節的 iOS/Android 分開處理原則。
9. **iOS 26 原生 header 問題**：目前 `reader/[id].tsx` 已預先採用自繪 header，其餘頁面若未來改用原生 header 且有返回按鈕，需留意第 7 節的白色圓形背景問題。
10. **實機/模擬器測試**：待功能有基本可視內容後，盡早進行 `expo run:android`／`expo run:ios` 或 Dev Client 實機測試，不要等到功能全部做完才測（累積的整合風險會變大）。

**第四輪：epub metadata（書名/作者/封面）擷取**（2026-07-04）：
- 對應「後續重構任務」第 2 項的未完成部分。做法：不引入 `jszip`/`fast-xml-parser` 額外解析 epub 內部結構，而是借用既有的 `reader-web/index.ts`（已含 `epubjs`，在 WebView 這個真的有 DOM 的環境跑）新增一個 `extractMeta` 訊息類型：用 `ePub(buffer)` + `book.ready` 讀 `book.package.metadata`（title/creator）、`book.coverUrl()` 取封面 blob 轉 base64，不呼叫 `renderTo()`，跑完後 `metaBook.destroy()`。做法邏輯照抄自 `pwa/src/utils/epubMetadata.ts` 的既有實作。
- `mobile/app/(tabs)/index.tsx`（書櫃頁）新增一個**隱藏的 `WebView`**（`opacity:0`、移到畫面外、`pointerEvents="none"`），載入同一份 `READER_HTML`，專門用來收發 `extractMeta`/`metaExtracted` 訊息，不會顯示在畫面上。`handleAddBook` 流程：`addBook()` 建立好暫時記錄（檔名當書名）→ 立即 `refresh()` 讓使用者先看到書已加入 → 再 `postMessage` 送出 base64 給隱藏 WebView 擷取 metadata → 收到 `metaExtracted` 後用 `updateBookMeta()` 補上正確書名/作者，封面圖用新增的 `saveCoverImage()`（`mobile/lib/library.ts`）解碼 base64 寫進沙盒 `covers/{id}.<ext>` 檔案（不是存 base64 進 AsyncStorage，避免肥資料），存檔案路徑到 `BookRecord.coverUri`。有 10 秒逾時保險（`META_EXTRACT_TIMEOUT_MS`），逾時或擷取失敗就維持檔名當書名、無封面，不會卡住加入書籍流程。
- 書櫃列表（`(tabs)/index.tsx`）改成有封面縮圖（40x56，無封面時顯示書名字首當佔位）＋書名＋作者。
- `mobile/lib/library.ts` 新增 `updateBookMeta`、`saveCoverImage`、`base64ToBytes`（純 JS base64 解碼，Hermes 沒有全域 `atob` 所以自己寫，不引入額外套件）；`removeBook` 同步刪除封面檔案。
- `mobile/lib/readerMessages.ts` 新增 `extractMeta`（inbound）與 `metaExtracted`/`metaError`（outbound）訊息型別。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過，純打包/型別驗證。**尚未實機/模擬器測試**：加入書籍後書名/作者是否正確擷取、封面圖是否正確顯示、逾時保護是否真的不會卡住 UI，都需要你在模擬器上重新測「+ 加入書籍」流程確認。另外沒有處理沒有封面圖的 epub（純文字小說常見）以外的例外格式，理論上會落回檔名當書名，但沒有實際 epub 樣本測過涵蓋率。

**第五輪：書櫃改格狀版面 + 修一個可能吃掉書名/作者更新的 bug**（2026-07-04，使用者實測回報「封面沒顯示、看不到作者」後）：
- 使用者提供的模擬器截圖顯示：透過新加入書籍流程加入的書，書名有出現但**作者、封面完全沒有**；同時要求書櫃版面比照網頁版（`renderer/src/page/Library.tsx` + `BookCard.tsx`）改成格狀卡片＋封面圖＋書名＋作者＋進度條，而非目前的單欄清單。
- **檢查程式碼發現一個真正的邏輯漏洞**（尚未實機驗證是否為唯一根因，但邏輯上確實會導致「有封面的書連書名/作者都不更新」）：`mobile/app/(tabs)/index.tsx` 的 `handleExtractorMessage` 原本依序執行「組 patch → 若有封面就呼叫 `saveCoverImage()` 寫檔 → 呼叫 `updateBookMeta()` 存檔 → `pending.resolve()`」。如果 `saveCoverImage()`（同步的檔案寫入）丟出例外，整個函式會直接中斷，導致**書名/作者的 patch 也一起沒被存到**（因為 `updateBookMeta` 呼叫在它後面），而且 `pending.resolve()` 也不會執行，變成要等滿 10 秒逾時才會恢復——症狀會是「有封面圖的書，書名/作者都沒更新到；沒封面圖的書，書名/作者才會正常更新」，跟回報的現象（書名有出現、作者跟封面都沒有）大致吻合，但因為沒辦法在這個環境重現 `saveCoverImage()` 實際丟出的錯誤訊息，**不能 100% 確定這就是唯一根因**。
  - 修正：把 `saveCoverImage()` 包進獨立的 `try/catch`，封面寫檔失敗只跳過封面欄位、不影響書名/作者的 patch 照常套用；並加上 `if (__DEV__)` 的 `console.log('[library] metaExtracted', ...)` / `console.warn('[library] saveCoverImage failed', ...)` 診斷 log，方便下次測試時直接看 Metro terminal 輸出，不用再用猜的。
- **格狀版面重構**：新增 `mobile/lib/coverStyles.ts`（仿照 `renderer/src/components/Library/coverStyles.ts` 用 id 雜湊出固定色卡的邏輯，但把網頁版的 `oklch()` 色彩字串換成 RN 認得的 hex 值——**RN 的樣式引擎不支援 `oklch()`/`hsl()` 等 CSS 色彩函式，只能吃 hex/rgb/具名色**，這是這次順帶學到的限制）與 `mobile/components/BookCard.tsx`（2:3 封面比例、無封面時顯示色卡＋書名＋作者當佔位、封面下方書名兩行截斷＋作者＋細進度條）。`(tabs)/index.tsx` 的 `FlatList` 改成 `numColumns={2}` 搭配 `columnWrapperStyle`/`contentContainerStyle` 的 `gap`。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過。**這輪修正完全沒有實機/模擬器驗證**：格狀版面的視覺排版、`saveCoverImage` 的 try/catch 是否真的解決了封面/作者遺失的問題，都需要你重新測「+ 加入書籍」並貼一下 Metro terminal 印出的 `[library] metaExtracted` 那行 log 內容（`hasCover` 是 true 還是 false、`author` 是不是空字串），才能確認是不是真的是這個 bug，還是另有其他原因（例如 `book.package.metadata` 對某些 epub 本來就沒有 creator 欄位、或 `coverUrl()` 在 WebView 環境真的抓不到）。

**第六輪：iOS 書櫃卡片過大，改用固定像素尺寸取代 flex + aspectRatio**（2026-07-04）：
- 加了 `key="library-grid-2col"` 後，使用者回報「重新 build 後 iOS 模擬器書本卡片還是超大（幾乎全螢幕），Android 正常」。原本 `BookCard` 用 `flex: 1` + `aspectRatio: 2/3` 讓卡片寬度交給 `FlatList` 的 `numColumns`/`columnWrapperStyle` 去分配欄寬——這個做法**依賴 `numColumns` 真的有生效**，一旦 iOS 那個 JS instance 因為 Fast Refresh 沒有完整重新掛載（`numColumns` 停留在預設值 1），`flex:1` 就會讓卡片撐滿整列（=撐滿整個螢幕寬度），乘上 `aspectRatio 2/3` 後高度也跟著爆炸，正是回報看到的症狀。
- **改法**：不再依賴 FlatList 分配欄寬，改成呼叫端（`(tabs)/index.tsx`）用 `useWindowDimensions()` 自己算出固定的卡片寬度 `cardWidth = (windowWidth - H_PADDING*2 - GRID_GAP*(COLUMNS-1)) / COLUMNS`，往下傳給 `BookCard` 當 `width` prop；`BookCard`（`mobile/components/BookCard.tsx`）內部封面容器改用明確的 `width`/`height`（`height = width * 1.5` 算出 2:3 比例）取代 `flex:1`/`aspectRatio`。這樣即使未來又遇到 `numColumns` 因為某種重新整理時機沒套用成功，卡片也只會維持固定尺寸、最多是排列變成一整欄堆疊（仍然是正常大小），不會再出現撐滿全螢幕的爆版問題。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform ios` 皆通過。**尚未實機/模擬器驗證**這次改法是否真的解決 iOS 卡片過大的問題，請重新完整關閉重開 App（不要只等 Fast Refresh）後再測一次。
- 封面圖持續無法顯示的問題（見上一輪）**仍未確認根因**，還在等使用者提供 Metro 的 `[library] metaExtracted` log 內容（`hasCover`/`author` 的值），懷疑是來源 epub（檔名含「Z-Library」字樣）本身 metadata 不完整、非標準的封面標記造成 `book.coverUrl()` 正常回傳 `null`，但未證實。

**第七輪：封面擷取確認修好 + 加上右上角刪除按鈕**（2026-07-04）：
- 使用者實測確認：**新加入的書籍封面成功顯示**。回頭看，真正根因應該是第六輪提到的「隱藏 WebView 用 1x1 近乎歸零尺寸，iOS WKWebView 對這種視圖可能整個不執行內容 JS」，改成 100x100（仍用 `opacity:0` 隱藏）後解決；「來源 epub metadata 不完整」的猜測是錯的，不用再往那個方向查。舊資料（改動前就已加入的書）沒有封面是預期行為，MVP 目前只在加入當下觸發一次擷取，沒有針對既有書籍補跑的機制（如果之後要補，可以在書櫃畫面對缺封面的書自動或手動觸發一次 `extractMetaFor`）。
- 新增書櫃卡片右上角的圓形 ✕ 刪除按鈕（比照 `renderer/src/components/Library/BookCard.tsx` 的設計），取代原本「只能長按刪除」在手機上不夠明顯的問題；長按仍保留當備援手勢。`mobile/components/BookCard.tsx` 的 `onLongPress` prop 改名為 `onDelete`，外層容器從 `Pressable` 改成 `View`（內部兩個獨立的 `Pressable`：一個包住封面＋觸發開啟閱讀器，另一個是絕對定位在右上角、疊在封面上層的刪除按鈕，靠 JSX 中宣告順序讓刪除按鈕在觸控命中判定上位於上層）。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過。**刪除按鈕本身尚未實機測試**：需要確認點擊右上角 ✕ 是否正確觸發刪除確認框、且不會誤觸到底下的「開啟閱讀器」（兩個 Pressable 疊在一起的觸控命中判定，理論上 RN 會讓後宣告、疊在上層的那個接住觸控，但沒有實機驗證過）。

**第八輪：書櫃排序控制項**（2026-07-04）：新增 `mobile/components/SortControl.tsx`，比照 `renderer/src/components/Library/SortControl.tsx` 的分段控制項設計（灰底圓角容器＋選中項目白底＋文字色深淺區分），提供「最近閱讀／書名／進度」三種排序，狀態放在 `(tabs)/index.tsx` 的 `sort` state，用 `useMemo` 排序後的 `shown` 陣列餵給 `FlatList`（`recent` 用 `lastOpenedAt` 遞減、`title` 用 `localeCompare('zh-Hant')`、`progress` 用 `progress` 遞減，邏輯照抄網頁版 `Library.tsx` 的 `shown` 計算）。`tsc`、`expo-doctor`、`expo export` 皆通過，**尚未實機測試**三種排序切換後的實際排序結果與畫面更新是否正確。

**第九輪：修正進度百分比誤判「讀畢」**（2026-07-04，使用者回報 Android 書還沒看完就顯示「讀畢」後）：
- **根因**：`reader-web/index.ts` 原本用 epub.js `relocated` 事件的 `l.start.displayed.page/total` 算進度，但這兩個數字**只是目前這一章（spine item）內部的頁碼**，不是全書頁碼。書翻到任何一章的結尾時 `page` 就會等於 `total`，於是每一章結尾都會被 RN 端誤判成「這本書讀完了」存成 100%，畫面就顯示「讀畢」——這是文件裡本來就記錄過的已知限制（第一輪「未做」清單提過「不是精確全書頁碼」），這次終於補上。
- **修法**：改用 epub.js 內建的 `book.locations`：在 `rendition.display()` 之後（不 `await`，避免拖慢開書速度）背景呼叫 `book.locations.generate(1024)`，跑完後 `relocated` 事件的 `l.start.percentage` 才會是精確的全書百分比（原理：`book.locations.percentageFromLocation` 在 locations 沒產生前永遠回傳 `undefined`／不存在，這也是先前完全沒被用到的原因）。在 `book.locations.generate()` 完成前的過渡期，改用「章節索引 + 章內頁碼比例」概算一個粗略值（`(spineIndex + (page-1)/total) / book.spine.length`）頂著，避免完全沒有進度顯示；locations 產生完成後之後的 `relocated` 事件就會自動換成精確值，不需要額外通知。
- `mobile/lib/readerMessages.ts` 的 `relocated` 訊息新增 `percentage: number` 欄位；`mobile/app/reader/[id].tsx` 改用 `updateProgress(id, msg.percentage)` 取代原本的 `msg.page / msg.total`。
- `book.spine` 的 TypeScript 型別定義（`node_modules/epubjs/types/spine.d.ts`）沒有列出 `length` 欄位（但執行期 `unpack()` 時確實有設定），只能用 `(book.spine as any).length` 繞過型別檢查。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過。**尚未實機測試**：`book.locations.generate()` 對長篇小說可能要跑幾百毫秒到幾秒（視章節數與字數而定，這次沒有機會實測真實耗時），需要確認 (1) 這段背景運算會不會讓翻頁或介面卡頓、(2) 產生完成前後的百分比切換會不會讓進度條看起來跳動、(3) 大部頭 epub 是否會讓 `generate()` 耗時多到影響體驗（若真的太慢，可能要考慮改成第一次背景預先算好存起來，或用更粗的取樣粒度）。

**第十輪：新增深色模式切換（對應重構任務第 6 項起點）**（2026-07-04）：
- 新增 `mobile/lib/theme.ts` 的 `ThemeContext`/`useTheme()`（`createContext`+`useContext`），提供 `darkMode`/`toggleDarkMode`/`colors`；色票比照 `renderer/src/page/Library.tsx` 的 darkMode 色票，把 oklch 換成 RN 認得的 hex（`LIGHT_THEME`/`DARK_THEME`，欄位：`paperBg`/`paperBg2`/`borderColor`/`ink`/`ink3`/`progressTrack`/`progressFill`）。偏好值存 AsyncStorage（`settings:darkMode`），由新增的 `mobile/components/ThemeProvider.tsx`（含 `useEffect` 讀取＋`useState`）在 App 啟動時載入、`toggleDarkMode` 時寫回。
- `mobile/app/_layout.tsx` 最外層包 `<ThemeProvider>`；`mobile/app/(tabs)/settings.tsx` 加上深色模式開關（自製 `Pressable` 假 Switch，非 RN 內建 `Switch` 元件，因為要讓滑塊顏色跟著 `colors.progressFill` 走，維持跟自繪 UI 一致的設計語言）。
- 原本分散在 `lib/theme.ts`（`PAPER_BG`/`INK_COLOR`/`INK3_COLOR`/`BORDER_COLOR`，只有淺色一份、無 dark 對應）與 `lib/coverStyles.ts`（`PROGRESS_TRACK_COLOR`/`PROGRESS_FILL_COLOR`）的靜態色票常數已移除，改成畫面內 `const { colors } = useTheme()` 動態取色：`(tabs)/index.tsx`（書櫃頁背景/文字）、`(tabs)/_layout.tsx`（Tab bar 背景/選中色）、`components/SortControl.tsx`、`components/BookCard.tsx`（書名/作者/進度條文字與底色）、`app/reader/[id].tsx`（頂部返回列背景/文字）都已改用。書封無封面時的色卡（`coverStyleFor`，六組固定色）**沒有**跟著 darkMode 變化，這是刻意的（比照網頁版同一份色卡不分深淺色模式，卡片本身就是繽紛色塊）。
- **尚未做**（下一步）：WebView 內的 epub 內容（`reader-web/index.ts` 渲染的書本文字/背景）目前完全不受深色模式影響，只有 RN 原生 UI（書櫃、設定、閱讀頁頂部列）套用了主題色——這對應「後續重構任務」第 6 項還沒完成的部分，需要仿照 Electron 版 `Reader.tsx` 的 `applyDarkOverride(doc, darkMode)`，在 `reader-web/index.ts` 新增接收 darkMode 狀態的訊息類型，注入/切換 iframe 內文件的深色樣式。
- **驗證狀態**：`tsc --noEmit`、`expo export --platform android` 皆通過，純打包/型別驗證。**完全尚未實機/模擬器測試**：設定頁開關點擊後是否真的即時套用到書櫃/閱讀頁 UI、重開 App 後偏好是否有正確持久化、開關本身的觸控命中與視覺呈現，都需要你在模擬器上實測確認。

**第十一輪：深色模式套用進 WebView 內的 epub 內容**（2026-07-04，使用者實測回報「深色模式切了，書本內文還是白底黑字」後）：
- 上一輪只把主題色套進 RN 原生 UI（書櫃/設定/閱讀頁頂部列），epub.js 渲染在 WebView 內的書本內文完全沒接上，正是這次回報的現象。
- 做法照抄 Electron 版 `renderer/src/components/Reader/readerStyles.ts` 的 `applyDarkOverride`：CSS 注入蓋不過書本內容元素的 inline `!important` style，所以除了注入一個 `<style id="tit-dark">` 外，還要逐一 `querySelectorAll('body, body *')` 覆寫每個元素的 inline style（`img`/`svg`/`canvas`/`video`/`picture` 這幾種媒體標籤只清背景色、不覆寫文字色）。這段邏輯搬進 `mobile/reader-web/index.ts`（`applyDarkOverride`/`injectStyle`/`setDarkMode`/`applyDarkModeToOuterPage`），因為 RN 端沒有 DOM，這段一定要在 WebView 這個有 DOM 的環境跑。
- `rendition.hooks.content.register(...)` 掛上一個 hook：epub.js 每次渲染新的一頁/章節內容（都是重新產生一份 iframe document）都會觸發，把該次的 `contents.document` 存進 `contentDocs`（一個 `Set<Document>`）並套用目前的 `darkMode` 狀態；`setDarkMode()` 被呼叫時則對 `contentDocs` 內所有已記錄過的 document 全部重新套用一次——這樣「切換深色模式當下」不必等使用者翻頁，馬上就對目前這頁生效，之後翻到的新頁面也會因為 hook 而套用同一個 `darkMode` 值。
- WebView 外層（非 epub 內容 iframe 的最外層 HTML/`#container`）背景色也要跟著切換，否則翻頁動畫或頁面邊緣會露出寫死在 `build-reader-html.js` 內 `<style>` 的淺色背景；`applyDarkModeToOuterPage()` 直接改 `document.documentElement.style.backgroundColor`/`document.body.style.backgroundColor`。
- `mobile/lib/readerMessages.ts` 新增 inbound 訊息型別 `{ type: 'setDarkMode'; darkMode: boolean }`。
- RN 端（`mobile/app/reader/[id].tsx`）：從 `useTheme()` 多取出 `darkMode`；WebView 回報 `ready` 時立即 `postMessage({ type: 'setDarkMode', darkMode })`（在呼叫 `handleWebViewReady()` 載入書籍之前送出，讓後續每次渲染的內容從第一頁開始就是正確色調）；另外加一個 `useEffect` 監聽 `darkMode` 變化，只要 WebView 已經 ready（`webviewReadyRef`）就即時補送同一則訊息——涵蓋「使用者在閱讀頁面開著的情況下跑去設定頁切換深色模式，再切回閱讀頁」這個情境。
- **已知限制**：WebView 首次載入的極短暫瞬間，會先看到 `build-reader-html.js` 內寫死的淺色背景（`#f9f7f2`），等 JS 執行完 `ready`→收到 `setDarkMode` 訊息後才會轉成深色，深色模式下可能有一閃而過的白底閃爍；這次沒有處理這個小瑕疵（若要修，可以在 build-reader-html.js 用 query string 或某種方式讓 WebView 建立當下就知道 darkMode 初始值，但目前 `source={{ html: READER_HTML }}` 是靜態字串，要做到這件事需要額外改動，先不做）。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo export --platform android`、`expo export --platform ios` 皆通過，純打包/型別驗證。**完全尚未實機/模擬器測試**：切換深色模式後書本內文背景/文字顏色是否正確變化、翻頁後新頁面是否維持正確色調、閱讀頁開著時從設定頁切換是否即時生效、上述提到的短暫白底閃爍實際觀感如何，都需要你在 iOS/Android 模擬器重新測試「+ 加入書籍」後開書、翻頁、來回切換深色模式確認。

**第十二輪：閱讀頁頂部功能列重構——三顆按鈕任務拆解（2026-07-04）**：
- 使用者要求把閱讀頁頂部功能列比照網頁版 `renderer/src/components/Toolbar.tsx` 補齊，右側共三顆按鈕（比照網頁版 7 顆圖示簡化為手機版最關鍵的 3 類）：
  1. **設定**（`renderer/src/components/SettingsPanel.tsx`）：字體排版（字體家族／繁簡切換／左右閱讀方向／字體大小／行距／字距／重設預設值）＋語音朗讀（TTS：語音選擇／播放暫停／重置／語速／睡眠計時）。
  2. **書籤按鈕**：點擊將目前頁面加入／移出書籤清單（比照網頁版 `handleToggleBookmark`／`isBookmarked`）。
  3. **清單總按鈕**：開啟一個分頁面板，內含「書籤清單／目錄清單／書籍資訊／註記清單」四個分頁（比照網頁版 `activePanel` 的 `bookmarks`／`chapters`／`bookinfo`／`notes` 四種面板）。
- 執行順序：先完成第 1 項（本輪），第 2、3 項留待後續對話繼續（狀態見下方清單）。

**本輪已完成（第 1 項：設定面板＋TTS，尚未實機測試）**：
- 新增 `mobile/lib/readerSettings.ts`：搬移網頁版 `useReaderStore.ts` 的 `FONT_OPTIONS`（字型 CSS 字串必須跟網頁版完全一致，因為 `reader-web` 用同一組字串比對要不要注入對應的 Google Fonts 連結）、`TypographySettings` 型別、`DEFAULT_TYPOGRAPHY`、`normalizeFontFamily`。
- `mobile/lib/readerMessages.ts` 新增 inbound `setTypography`（帶完整 `TypographySettings`）與 `getChapterText`，outbound 新增 `chapterText`。
- `mobile/reader-web/index.ts` 搬移網頁版 `renderer/src/components/Reader/readerStyles.ts` 的 `applyFontFamilyOverride`／`applyFontSizeOverride`／`applyLineHeightOverride`／`applyLetterSpacingOverride`（含 Google Fonts `<link>` 注入邏輯），以及 `renderer/src/components/Reader/scriptConversion.ts` 的簡繁轉換（改用 `opencc-js`，`convertDoc`/`restoreDoc` 用 `WeakMap` 記住原始文字以便切換回來）。這幾個排版覆寫函式都跟已有的 `applyDarkOverride` 一樣掛在 `rendition.hooks.content.register(...)`，換頁/換章節時自動套用，並在 `setTypography()` 被呼叫時對 `contentDocs` 內所有已知 document 重新套用一次（跟深色模式那套機制共用同一個 pattern）。
  - **右→左（RTL）閱讀方向**：網頁版其實只是把翻頁箭頭的 prev/next 語意互換，不是真的改 epub.js 內部分頁方向；mobile 版比照，`registerTapZone` 在 `readingDirection === 'rtl'` 時把左右點擊區的 prev/next 對調。
  - **新增 `getChapterText` 訊息**：TTS 朗讀文字來源。實作方式是拿 `rendition.getContents()` 目前顯示中 iframe 的 `document.body.textContent`（paginated 模式下一個章節的完整內容渲染在同一份 document、只是用 CSS 分欄呈現，所以 `body.textContent` 涵蓋整章，不只目前可見那一頁）。
- 新增 `mobile/lib/tts.ts`（`useTTS` hook）：用 `expo-speech`（新安裝的原生模組，**需要重新 `expo run:android`／`expo run:ios` 才會生效**，純 JS reload 不夠）取代網頁版 `useTTS.ts` 用的瀏覽器 Web Speech API。**這是簡化版**，只做 play/pause/resume/reset、語速、語音選擇（`Speech.getAvailableVoicesAsync()` 過濾 `zh` 開頭語言）、睡眠計時倒數；**沒有**網頁版那套逐字元 boundary 追蹤、跨章節背景預先載入、CFI 高亮同步（`ttsHighlight.ts`／`continueFromSpine` 那整套），這些留給後續「TTS 朗讀功能」任務項（見下方「後續重構任務」第 5 項）再視需要補上。
  - 朗讀流程：`mobile/app/reader/[id].tsx` 的 `handleTTSPlay` 呼叫 `requestChapterText()`（用 pending-resolver pattern 包裝 WebView 的 `getChapterText`/`chapterText` 一來一回訊息成 Promise）拿到目前章節全文（**從章節開頭開始朗讀，不是從目前頁面精確位置開始**，這點跟網頁版不同，是簡化取捨），朗讀完一個章節後（`tts.speak` 的 `onAllDone` 回呼）自動送出 `next` 訊息翻頁、延遲 400ms 等 epub.js relocate 完成、再次 `getChapterText` 並繼續朗讀，直到翻到書尾抓不到文字為止才自然停止。
- `mobile/components/SettingsPanel.tsx`：RN 版設定面板，比照網頁版 `SettingsPanel.tsx` 版面（字體清單／繁簡+方向兩組分段控制／字體大小·行距·字距三個數值 stepper／重設按鈕／語音清單橫向捲動 chips／播放卡片／睡眠計時分段控制），全螢幕 overlay（不是網頁版側邊欄，因為手機螢幕窄），沒有用任何圖示套件（沿用 app 既有「純 Text/Unicode 符號」風格，例如 `‹`、`⚙`、`▶`、`❚❚`、`↺`），沒有裝 slider 套件（語速改用跟字體大小同款的 +/- stepper，避免多裝一個原生依賴）。
- `mobile/app/reader/[id].tsx`：頂部列右側新增齒輪 `⚙` 按鈕開啟 `SettingsPanel`；排版設定存在既有的 `mobile/lib/library.ts` 的 `BookSettings`/`saveBookSettings`/`loadBookSettings`（這幾個函式其實更早的回合就寫好了，只是這輪才第一次真正被用到）；用 `settingsLoadedRef` 避免載入設定完成前的初始 state 被自動存檔 effect 誤存成預設值蓋掉。
- `mobile/lib/theme.ts` 新增 `ink2` 色票欄位（比照網頁版 `useThemeColors.ts` 的 `ink2Col`，設定面板次要文字要用）。
- **依賴變更**：新增 `expo-speech`（用 `npx expo install` 裝，原生模組，SDK 57 對應版本 `~57.0.0`）、`opencc-js`（純 JS，`yarn add` 即可，只在 `reader-web` bundle 內使用，不進 RN 主 bundle，不需要原生重編）。`opencc-js` 的簡繁字典資料讓 `mobile/lib/readerHtml.generated.ts` 從原本數百 KB 暴增到 **2.5MB**（`yarn build:reader` 輸出可看到確切數字），純打包驗證沒有失敗，但沒有實測過這個尺寸對 WebView 初次載入速度的實際影響。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android`、`expo export --platform ios` 皆通過，純打包/型別驗證。**完全尚未實機/模擬器測試**，而且這次有一個额外前提：加了 `expo-speech` 這個原生模組後，**必須先重新跑一次 `expo run:android`／`expo run:ios` 重新編譯 Dev Client**才能讓 TTS 生效（純 JS reload 或 `yarn start` 連原本的 Dev Client 不會有新原生模組）。測試時請至少確認：(1) 設定面板開關與版面在手機螢幕上是否正常顯示、(2) 字體/字級/行距/字距/繁簡/左右方向切換後書本內文是否即時套用、(3) TTS 播放/暫停/重置/語速/睡眠計時是否正常運作、翻頁後是否真的接續朗讀下一頁、(4) 語音清單是否有列出裝置上的中文語音（模擬器可能語音選項很少甚至沒有，屬預期情況）。

**第十二輪追加修正：簡體轉繁體失敗（2026-07-04，使用者實測回報）**：
- 使用者重新編譯（`expo run:android`/`expo run:ios`）後，`Cannot find native module 'ExpoSpeech'` 已解決，但接著測「簡體轉繁體」失敗。
- **根因**：`mobile/reader-web/index.ts` 的 `applyScriptToDoc` 上一版寫死假設「書本原始文字一定是繁體」——選『繁體』就呼叫 `restoreDoc()` 還原成書本原文、選『簡體』才呼叫 `convertDoc(getToSC())` 轉換。如果書本原本就是簡體（例如 epub metadata `language` 是 `zh-CN`/`zh-Hans`/`zh`），選『繁體』只會把文字還原成「書本原本的簡體」，並不會真的轉成繁體，因為程式從沒把「簡體→繁體」這個方向的轉換函式 `getToTC()` 接進來過。網頁版 `Reader.tsx`／`scriptConversion.ts` 其實是靠 `baseScriptRef`（依 epub metadata 的 `language` 判斷書本原始語言）判斷該用哪個方向轉換，這次移植時漏掉了這個判斷。
- **修正**：`reader-web/index.ts` 新增 `baseScript` 模組變數，在 `loadBook()` 內 `book.ready` 之後、`rendition.display()` 之前，用跟網頁版一致的規則判斷（`/^zh$|zh[-_]?(cn|hans|sg)/i` 比對 `book.package.metadata.language`）設定 `baseScript`，並透過新增的 outbound 訊息 `bookLanguageDetected` 回報給 RN。`applyScriptToDoc` 改成比較 `typography.script` 是否等於 `baseScript`：相等就 `restoreDoc()`（顯示書本原文），不相等才轉換，且轉換方向依目標腳本決定（`sc` 用 `getToSC()`、`tc` 用 `getToTC()`）——這才是完整雙向轉換，不再只支援「原文繁體轉簡體」單一方向。
- `mobile/app/reader/[id].tsx` 新增 `hadSavedSettingsRef`（記錄這本書是否原本就有存過排版偏好）；收到 `bookLanguageDetected` 時，只有在**這本書從沒存過設定**的情況下才自動把 `script` 設成偵測到的 `baseScript`（比照網頁版「簡體書第一次開啟預設顯示簡體」的行為），使用者若已手動存過偏好則不覆蓋。
- `mobile/lib/readerMessages.ts` 新增 `bookLanguageDetected` outbound 訊息型別。
- **驗證狀態**：`yarn build:reader`、`tsc --noEmit`、`expo-doctor`（20/20）皆通過，純打包/型別驗證。**尚未實機測試**：麻煩重新 `yarn build:reader`（`yarn start`/`yarn android`/`yarn ios` 都會自動先跑，不需要重新原生編譯，這次改動不涉及原生模組）後，分別用「原本是繁體的書」「原本是簡體的書」測試繁簡切換兩個方向是否都正確轉換，以及沒存過設定的簡體書打開時是否自動顯示簡體。

**第十二輪再追加：語音清單只顯示美佳/婷婷**（2026-07-04）：
- `mobile/lib/tts.ts` 補上網頁版 `useTTS.ts` 的 `ALLOWED = /Meijia|Tingting|美佳|婷婷/i` 過濾邏輯：先篩出 `zh` 語言的語音，再只留名稱含「婷婷」「美佳」的，各取清單中最後一筆同名變體（避免同時列出多個版本），依「婷婷、美佳」順序排列。
- **裝置差異提醒**：「婷婷」「美佳」是 iOS 系統內建的 Siri 中文語音名稱，Android 上通常不存在。若裝置/模擬器上這兩個語音都找不到，會 fallback 顯示所有 `zh` 開頭的語音（避免清單整個空掉沒得選），這點跟網頁版行為一致。實測時請留意 Android 上的語音清單內容可能跟 iOS 不同，屬預期情況，不是 bug。
- 這次改動純 JS，不涉及原生模組，不需要重新原生編譯，重新整理/reload 即可生效。`tsc --noEmit` 已通過，**尚未實機測試**過濾後的清單內容是否符合預期。

**第十二輪再追加：Android 語音清單顯示技術代號 + 完全沒聲音**（2026-07-04，使用者附 iOS/Android 截圖回報）：
- iOS 實測確認「婷婷/美佳」過濾已生效（截圖正確只顯示這兩個）。Android 上 expo-speech 回傳的語音本來就沒有人類可讀名稱（`name` 欄位常常直接等於技術性 identifier，例如 `zh-TW-language`、`cmn-cn-x-cce-local`），這兩個 iOS 專屬語音在 Android 上不存在，會落到 fallback 分支「顯示所有 zh 語音」，於是清單顯示一堆英文技術代號。跟使用者確認後決定：**Android 全部保留、但換成友善標籤**，不砍成固定 2 個。
  - `mobile/lib/tts.ts` 新增 `friendlyLabelForLanguage`／`withFriendlyLabels`：依語音的 `language` 欄位（`zh-TW`/`zh-CN`/`zh-HK`/`zh-SG`/裸 `zh`）組出「中文（台灣）」之類的標籤，同語言有多個變體時加編號（「中文（中國） 1」「中文（中國） 2」）區分；只套用在 fallback（非 iOS 婷婷/美佳）清單，不影響 iOS 那組已經是友善名稱的清單。`identifier` 欄位不變，選擇/朗讀邏輯不受影響。
- 同一輪使用者接著回報「安卓版語音朗讀沒有聽到聲音」。**尚未確認根因**，但查了 `node_modules/expo-speech/android/.../SpeechModule.kt` 原生實作，發現一個可疑點：Android 的中文語音清單常包含「network」（需連網即時合成）與「-local」（內建離線）兩種變體，之前預設是選清單第一筆（`list[0]`），可能剛好選到需要連網合成、且模擬器/裝置沒有下載對應語音資料的那種，這種情況原生端經常「悄悄失敗」（連 `onError` 都不會觸發，不是我們攔截錯誤的邏輯漏掉）。
  - **暫時處理**（非確定修復，因為沒辦法在這個環境重現）：`mobile/lib/tts.ts` 語音清單改成把 identifier 含 `-local`（離線語音，不依賴網路/雲端資料）的排到前面，讓預設選到的語音優先是離線的；另外在 `speakChunk` 加上 `onStart`／`onDone`／`onError` 的 `__DEV__` 診斷 log（含呼叫時用的 `voice` identifier 與文字長度），確認穩定後應移除。
  - **麻煩你重新測試後回報 Metro terminal 印出的 `[tts]` 那幾行 log**：如果連 `onStart` 都沒印出來，代表引擎根本沒開始講（比較像我們哪裡傳錯參數，或原生端真的悄悄失敗）；如果 `onStart`/`onDone` 都有印出但還是沒聲音，比較像模擬器音訊路由或裝置本身靜音/音量問題，不是程式邏輯的 bug——這種情況建議直接去 Android 系統設定「協助工具 → 文字轉語音輸出 → 播放範例」測看看裝置本身的 TTS 引擎是否真的能發聲，排除是不是环境問題而不是我們程式的問題。
- **驗證狀態**：`tsc --noEmit` 通過，純型別驗證。這次改動不涉及原生模組，不需要重新原生編譯，`yarn build:reader` 也不需要跑（`tts.ts` 是 RN 主 bundle 的一部分，不是 reader-web bundle）。**完全尚未實機驗證修復是否有效**，需要你提供上述診斷 log 才能進一步判斷根因。

**第十二輪再追加：移除語音標籤的地區用字＋朗讀仍無聲音，補更多診斷 log**（2026-07-04）：
- `mobile/lib/tts.ts` 的 `withFriendlyLabels` 拿掉依語言代碼標「中國／台灣／香港」的做法（原本的 `CHINESE_REGION_LABELS`），改成一律用通用標籤「中文語音」＋編號（有多筆才加編號，例如「中文語音 1」「中文語音 2」），不含任何地區字樣。
- 使用者回報朗讀功能仍然沒有聲音（尚未回報上一輪加的 `[tts]`／`onStart`/`onDone`/`onError` log 內容，還無法判斷是「引擎沒開始講」還是「開始了但發不出聲音」）。這輪額外在 `mobile/app/reader/[id].tsx` 的 `handleTTSPlay` 加了 `[reader] chapterText length` 診斷 log，用來排除另一種可能：如果 `getChapterText` 從 WebView 抓回來的文字長度是 0（例如 `rendition.getContents()` 在目前 epub.js 狀態下抓不到內容），`tts.speak()` 根本不會被呼叫，症狀也會是「完全沒聲音」，但這種情況下 `[tts] speakChunk`/`onStart` 這些 log 完全不會出現——所以這兩組 log 合起來看才能判斷問題出在「抓文字」還是「語音引擎」這兩個環節的哪一個。
- **這輪沒有能力進一步確認根因**，需要使用者提供 Metro terminal 印出的 `[reader] chapterText length` 與 `[tts]` 開頭那幾行 log 內容才能繼續往下查。
- **驗證狀態**：`tsc --noEmit` 通過。純 JS 改動，不需要重新原生編譯。

**第十二輪再追加：語音清單縮到每種語言 1 筆＋朗讀無聲音的診斷結論**（2026-07-04，使用者提供 log）：
- 使用者貼出的語音清單顯示 Android 裝置上光是中文相關語音就有 16 筆（`cmn-cn-x-ccc/ccd/cce/ssa`、`cmn-tw-x-ctc/ctd/cte` 各自都有 `-local`／`-network` 兩份，加上 `zh-TW-language`／`zh-CN-language`），選項多到不知道選哪個。`mobile/lib/tts.ts` 新增 `dedupeByLanguage`：每個 `language`（例如 `zh-TW`／`zh-CN`）只保留一筆代表（因為排序已經把 `-local` 排到前面，保留下來的會是離線版本），比照 iOS 只留「婷婷／美佳」兩個選項的精神，把清單從 16 筆左右砍到跟裝置實際支援的語言數一致（通常 2 筆）。
- **朗讀無聲音的診斷結論**：使用者提供的 log 顯示 `[reader] chapterText length 3140`（章節文字有正確抓到）、`[tts] speakChunk` 有正確帶 `voice` 參數、且 **`[tts] onStart` 確實有觸發**（觸發了兩次，用的是不同語音 `cmn-cn-x-cce-local` 與 `cmn-cn-x-ssa-local`，研判是測試時切換了不同語音選項各按了一次播放，不是程式邏輯重複呼叫的 bug）。`onStart` 是原生 `TextToSpeech` 的 `UtteranceProgressListener.onStart` 回呼，會觸發代表 Android 系統的語音引擎確實收到並「開始」這個 utterance——**代表我們這邊的程式邏輯（抓文字→呼叫 speak→引擎接受請求）是正常運作的**，問題比較可能出在裝置/模擬器本身的音訊環境（音量、音訊路由、或宣稱是離線但實際語音資料未完整下載），而不是這幾輪改的程式碼。
  - 建議使用者直接去 Android 系統設定「協助工具（或設定裡的『語言與輸入』）→ 文字轉語音輸出 → 播放範例」測看看，脫離我們的 App，確認裝置本身的 TTS 引擎是否真的能發出聲音；如果系統內建測試也沒聲音，就能確定是裝置/模擬器環境問題，需要另外處理（例如模擬器音訊路由設定、確認語音資料包真的下載完成），不是這個 App 的程式碼問題。
- **後續確認（2026-07-04）**：使用者用 adb 開啟 Android 系統「文字轉語音輸出」設定頁（`android.settings.TTS_SETTINGS` 這個 intent 在使用者的 AVD 系統映像檔上無法解析，改用 `android.settings.ACCESSIBILITY_SETTINGS`／`android.settings.SETTINGS` 開啟主設定畫面，再手動搜尋進去），按「播放範例」確認裝置本身 TTS 引擎正常發聲，回到 App 內測試朗讀功能**也確認有聲音了**——證實先前判斷正確，問題出在裝置/模擬器環境（很可能是先前某個語音資料尚未真正就緒／裝置音訊狀態問題），不是程式邏輯的 bug。診斷用的 `[reader] chapterText length`／`[tts]` 系列 `console.log` 已移除（`mobile/lib/tts.ts`、`mobile/app/reader/[id].tsx`）。
- **驗證狀態**：`tsc --noEmit` 通過，純 JS 改動不需要重新原生編譯。**TTS 播放功能本輪已由使用者在 Android 模擬器實測確認有聲音**。

**待辦（第 2、3 項，下一輪繼續）**：
- [x] 頂部列書籤按鈕：加入/移出目前頁面書籤，比照網頁版 `handleToggleBookmark`／`getBookmarkLabel`（用當前 CFI 對應的章節標題當書籤標籤）；`mobile/lib/library.ts` 的 `Bookmark` 型別與 `loadBookmarks`/`saveBookmarks` 已存在，這次尚未使用。
- [x] 清單總按鈕＋四分頁面板：書籤清單（比照 `renderer/src/components/Reader/BookmarkPanel.tsx`）、目錄清單（比照 `ChapterPanel`，需要從 epub.js 的 `book.navigation.toc` 取得目錄資料，目前 mobile 端完全沒有這段邏輯）、書籍資訊（比照 `BookInfoPanel`，可用既有的 `BookRecord`/封面資料）、註記清單（比照 `renderer/src/components/NotePanel.tsx`，這對應到更後面「註記筆記功能」那個更大的任務項，目前 mobile 完全沒有註記/劃線功能，這個分頁這輪只能先做空殼或延後）。

**第十三輪：頂部功能列第 2、3 項——書籤按鈕＋書籤/目錄/資訊/註記面板（2026-07-05）**：
- **章節標題計算搬進 `reader-web`**：網頁版 `getBookmarkLabel`／`getChapterTitle` 都要用 `book.navigation.toc` 換算「目前位置屬於哪一章」，但 mobile 端原本完全沒有 TOC 資料。這次在 `mobile/reader-web/index.ts` 的 `loadBook()` 內 `book.ready` 之後新增 `buildToc()`（把 epub.js 的 `book.navigation.toc` 轉成扁平可序列化的 `TocItem` 巢狀結構）與 `spineHrefs`（`book.spine.items` 的 href 順序），並透過新的 outbound 訊息 `tocLoaded` 把整份目錄送到 RN 端（目錄面板顯示用）。`getChapterLabel()` 照抄網頁版兩段式邏輯：先 `findExactChapterLabel`（同檔案完全相符、深度優先）、找不到才 `findNearestChapterLabel`（spine 索引最接近但不超過目前章節的目錄項）；每次 `relocated` 事件都會算一次，結果放進新增的 `chapterTitle` 欄位（連同新增的 `href` 欄位，供目錄面板判斷目前正在讀哪一章用），不必額外來回訊息。
- **新增 `goto` inbound 訊息**：`rendition.display(target)` 同時接受 CFI 或 href 字串，書籤／章節導覽因此共用同一個訊息類型，不必分別實作。
- **RN 端狀態**（`mobile/app/reader/[id].tsx`）：新增 `bookmarks`（開書時 `loadBookmarks(id)` 載入）、`toc`、`currentCfi`、`currentHref`、`currentChapterTitle` 幾個 state；`currentCfi`/`currentHref`/`currentChapterTitle` 都在 `relocated` 訊息內同步更新，`isBookmarked` 直接用 `bookmarks.some((b) => b.cfi === currentCfi)` 算出。`handleToggleBookmark` 加入/移出書籤時直接拿目前追蹤的 `currentChapterTitle` 當標籤，不必像網頁版那樣點擊當下才呼叫函式現算（因為 mobile 版每次翻頁都已經算好存在 state 裡）。
- **頂部工具列**：原本只有返回鍵＋標題＋設定齒輪，這次在標題右側加了書籤與清單兩顆按鈕。

**第十三輪追加：改用跟網頁版一致的簡約線條圖示（2026-07-05，使用者回報不要用星星／emoji，要跟網頁版一樣的線條圖示）**：
- 原本這輪先用 `★`/`☆` 做書籤圖示，使用者接著又貼了網頁版 Toolbar 的線條圖示截圖，要求全面換成同款簡約線條圖示（不要 emoji、不要純文字符號）。純 Unicode 符號／emoji 無法重現網頁版那種向量線條造型，且 emoji 是系統內建多色圖形，不受 RN `color` 樣式影響（先前 `🔖` 書籤圖示才會改用「背景色塊」而非「圖示變色」來表示已加入狀態，就是因為卡在這個限制）。
- **新增依賴 `react-native-svg`**（`npx expo install react-native-svg`）：原生模組，比照先前 `expo-speech` 的情況，**必須重新跑一次 `expo run:android`／`expo run:ios` 重新編譯 Dev Client**才會生效，純 JS reload 或 `yarn start` 連原本的 Dev Client 不夠。
- 新增 `mobile/components/icons.tsx`：把網頁版 `renderer/src/components/Toolbar.tsx`（`IconBack`／`IconSettings`／`IconChapters`／`IconBookmarkOutline`／`IconBookmarkFill`）與 `renderer/src/components/SettingsPanel/icons.tsx`（`IconPlay`／`IconPause`／`IconReset`）的 SVG path **逐一照抄**成 `react-native-svg` 元件（`Svg`/`Path`/`Line`/`Circle`/`Polyline`/`Polygon`/`Rect`），確保跟網頁版視覺一致；另外因為網頁版側邊面板（`BookmarkPanel`／`BookInfoPanel`）關閉用的是 X 圖示（非返回箭頭），新增 `IconClose` 一併照抄那組 X 線條 path。
- 套用範圍：`mobile/app/reader/[id].tsx` 頂部列的返回箭頭／書籤／清單／設定四顆圖示；`mobile/components/SettingsPanel.tsx` 的關閉（改用 `IconClose`，原本是 `‹`）／朗讀播放-暫停（`IconPlay`/`IconPause`）／重置（`IconReset`，原本是 `↺`）；`mobile/components/ListPanel.tsx` 的關閉按鈕（改用 `IconClose`，原本也是 `‹`）。書籤圖示的已加入/未加入狀態現在改用 `IconBookmarkFill`（`colors.progressFill` 上色）／`IconBookmarkOutline`（`colors.ink` 上色）切換造型，不再只靠背景色塊。
- 目錄／清單面板內的分頁切換、書籤刪除確認等純文字按鈕（「移除」「取消」）維持文字，沒有對應的網頁版圖示可抄，不強行加圖示。
- **底部 Tab bar 圖示**（使用者接著回報「書櫃／設定」兩個 tab 也要換）：`mobile/app/(tabs)/_layout.tsx` 原本兩個 `Tabs.Screen` 完全沒有設定 `tabBarIcon`，只有文字標籤。這兩個 tab 是 mobile 專屬的底部導覽，網頁版（Electron 單頁應用）沒有對應元件可以照抄，改成沿用同一組 `mobile/components/icons.tsx`：書櫃 tab 借用 `IconBook`（網頁版 Toolbar 原本用來表示「書籍資訊」的書本圖示，語意上通用）、設定 tab 用 `IconSettings`（跟閱讀頁設定按鈕同一顆齒輪），維持風格一致而非另外設計新圖示。`tabBarIcon` 回呼拿到的 `color` 參數型別是 RN 的 `ColorValue`（可能是 `OpaqueColorValue`），跟 `icons.tsx` 元件期待的 `string` 不相容，呼叫處用 `color as string` 轉型（React Navigation 底層實際上只會傳字串色碼，只是型別宣告比較寬鬆）。
- **驗證狀態**：`yarn build:reader`、`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android`、`expo export --platform ios` 皆通過，純打包/型別驗證。**完全尚未實機/模擬器測試**，而且這次前提是**必須先重新 `expo run:android`／`expo run:ios` 重新編譯 Dev Client**（新增了 `react-native-svg` 原生模組），純 reload 不會生效；重新編譯後請確認：(1) 所有換成 SVG 的圖示是否正常顯示、大小/顏色是否合理（尤其深色模式下的對比）、(2) 書籤已加入/未加入狀態的圖示造型切換是否正確、(3) 底部 Tab bar 兩顆圖示是否正常顯示、選中/未選中的顏色是否正確切換、(4) 沒有因為原生模組編譯造成其他既有功能（尤其 TTS）跟著出問題。
- **新增 `mobile/components/ListPanel.tsx`**：比照網頁版四個獨立面板（`BookmarkPanel`／`ChapterPanel`／`BookInfoPanel`／`NotePanel`）合併成一個全螢幕 overlay＋頂部分段控制項切換四個分頁，理由是手機螢幕窄，四個各自獨立側邊欄的網頁版版面不適合直接搬。書籤分頁沿用網頁版「點擊列出待確認再按一次移除」兩段式刪除確認；目錄分頁遞迴渲染巢狀 `TocItem`（比照 `ChapterPanel` 的 `findBestMatch`/`TocRow` 邏輯，用目前 `currentHref` 高亮所在章節）；資訊分頁複用既有 `BookRecord`/`coverStyleFor`；註記分頁目前只有「註記功能尚未支援」的空殼文字（比照文件先前規劃，等後面「註記筆記功能」任務項再實作）。
- **依賴變更**：無新增套件，純 JS/TSX 改動；`mobile/lib/library.ts` 把原本模組內部的 `generateId` 改成 `export`，供 `reader/[id].tsx` 產生書籤 id 使用。

**第十三輪再追加：書籍資訊分頁封面顯示失敗＋補齊複製書名按鈕（2026-07-05，使用者附 iOS/Android 截圖回報）**：
- **根因（真正的邏輯漏洞，非環境問題）**：`mobile/components/ListPanel.tsx` 的「資訊」分頁封面區塊原本**只**畫了 `coverStyleFor` 的色卡 fallback，完全沒有判斷 `record.coverUri` 存不存在，導致就算這本書已經有擷取到真正的封面圖（書櫃列表 `BookCard.tsx` 也確實正常顯示），資訊分頁還是永遠顯示色卡佔位圖——這是這次新增程式碼漏寫了 `record.coverUri ? <Image /> : <fallback />` 判斷分支，不是封面資料本身有問題。修法：比照 `mobile/components/BookCard.tsx` 既有的判斷邏輯，`record.coverUri` 存在就用 `Image` 顯示，沒有才退回色卡。
- **補齊網頁版 `BookInfoPanel.tsx` 有、mobile 這次漏做的「複製書名」按鈕**：新增依賴 `expo-clipboard`（原生模組，**同樣需要重新 `expo run:android`／`expo run:ios` 重新編譯 Dev Client**），按鈕呼叫 `Clipboard.setStringAsync(record.title)`；圖示照抄網頁版該按鈕用的迴紋夾/複製 SVG path，新增進 `mobile/components/icons.tsx` 的 `IconCopy`。
- 其餘欄位（書名、作者、閱讀進度、匯入時間、最後閱讀）本來就有做，跟網頁版一致；使用者截圖中 iOS 那本書沒有顯示「閱讀進度」列，是因為該書 `record.progress` 本身是 `undefined`（跟網頁版同樣用 `progress != null` 才顯示的邏輯一致），不是 bug。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android`、`expo export --platform ios` 皆通過，純打包/型別驗證。**完全尚未實機/模擬器測試**，而且這次前提是**必須先重新 `expo run:android`／`expo run:ios` 重新編譯 Dev Client**（新增了 `expo-clipboard` 原生模組，`react-native-svg` 若上一輪已經重新編譯過則不用重複）；重新編譯後請確認：(1) 有封面圖的書在資訊分頁是否正確顯示真正的封面而非色卡、(2) 沒有封面圖的書是否仍正確退回色卡顯示、(3) 「複製書名」按鈕點擊後貼上是否確實是書名文字。
- **驗證狀態**：`yarn build:reader`、`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過，純打包/型別驗證。**完全尚未實機/模擬器測試**，需要你重新整理/reload 後確認：(1) 翻頁後書籤按鈕的星號狀態是否正確反映「目前頁面是否已加書籤」、(2) 加入書籤後標籤文字是否合理（沒有目錄資料的書籍會退回顯示「書籤」）、(3) 點擊清單按鈕開啟的面板四個分頁是否都能正常切換與顯示、(4) 書籤清單點擊項目是否正確跳轉、(5) 目錄分頁是否正確列出章節且巢狀縮排/高亮所在章節正常、(6) 目錄分頁點擊章節是否正確跳轉、(7) 書籍資訊分頁的封面色卡/進度/時間顯示是否正確。

**第十三輪再追加：設定面板／清單面板互斥顯示（2026-07-05，使用者回報兩個面板應共用同一個畫面區域）**：
- **問題**：`settingsVisible`（設定面板）與 `listPanelTab`（清單面板）原本是兩個完全獨立的 state，互不影響。如果使用者先開清單面板、再按設定齒輪，`settingsVisible` 會變 `true`，但 `listPanelTab` 沒有跟著關掉，兩個全螢幕 overlay 疊在一起（`ListPanel` JSX 在後面，會蓋在 `SettingsPanel` 上面）；使用者當下只會看到清單面板，這時按清單面板的關閉鈕，`listPanelTab` 變回 `null`、清單面板消失，卻會露出底下其實還開著的設定面板——不符合「關閉應該直接關掉，不會又跑出另一個畫面」的預期。
- **修法**：`mobile/app/reader/[id].tsx` 新增 `openSettings`／`openListPanel` 兩個包裝函式，開啟其中一個 overlay 時順便把另一個關掉（`openSettings` 內先 `setListPanelTab(null)` 再 `setSettingsVisible(true)`；`openListPanel` 反過來）；頂部工具列的設定齒輪／清單兩顆按鈕改呼叫這兩個函式，不再直接呼叫原本的 setter。兩個面板各自的關閉鈕（`onClose`）維持只關自己，因為互斥開啟已經保證另一個一定是關的，不需要額外處理。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過，純打包/型別驗證，這次是純 JS/TSX 邏輯改動，不涉及原生模組，不需要重新編譯 Dev Client。**尚未實機/模擬器測試**：麻煩確認 (1) 設定面板開著時按清單按鈕會不會正確切換成清單面板（設定面板消失）、(2) 反過來清單面板開著時按設定齒輪是否正確切換、(3) 任一面板按關閉鈕是否直接回到閱讀畫面，不會露出另一個面板。

**第十三輪再追加：修正封面持久化用絕對路徑，App 重新安裝後全部失效（2026-07-05，使用者回報「書櫃跟資訊分頁的封面都顯示失敗」）**：
- 使用者問「iOS 模擬器目前怎麼拿到並顯示封面」，順便回報書櫃（`BookCard.tsx`）跟資訊分頁封面都失敗——這代表問題不是上一輪 `ListPanel.tsx` 漏寫判斷式那個 bug（那個已經修過），而是更底層、兩處共同依賴的 `record.coverUri` 這個值本身失效了。
- **完整機制**（回答使用者的問題）：開書/加入書籍時，`(tabs)/index.tsx` 借用一個隱藏的 WebView（跟閱讀器共用同一份 `reader-web` bundle）送 `extractMeta` 訊息 → `reader-web/index.ts` 的 `extractMeta()` 用 epub.js 的 `book.coverUrl()` 拿封面 blob 轉 base64 → 用 `metaExtracted` 訊息送回 RN → `handleExtractorMessage` 呼叫 `saveCoverImage()` 把 base64 寫進 App 沙盒的 `Documents/covers/<id>.<ext>` 檔案 → 結果存進 `BookRecord`、`BookCard.tsx`／`ListPanel.tsx` 再用 `<Image source={{ uri: ... }}>` 顯示。
- **根因（找到的真正程式邏輯漏洞，不是環境臆測）**：`saveCoverImage()` 原本回傳 `file.uri`——這是 `expo-file-system` 組出來的**完整 `file://` 絕對路徑**，開頭包含當次 App 安裝的 sandbox 容器 UUID（iOS/Android 每個 App 安裝都有自己專屬的容器目錄）。這個完整路徑被直接存進 `BookRecord.coverUri`、序列化進 AsyncStorage 永久保存。只要 App 重新安裝過一次（例如這次為了 `react-native-svg`／`expo-clipboard` 兩個原生模組跑 `expo run:ios`／`expo run:android` 重新編譯 Dev Client），系統會分配一個新的容器路徑，舊的絕對路徑就完全失效（對應的檔案实际上可能還在，只是路徑字串對不上新容器），`<Image>` 抓不到檔案就顯示空白/失敗。反觀書籍本體檔案完全沒有這個問題，因為 `getBookFileUri`／`getBookBase64` 都是**每次呼叫時用 `booksDir()`（目前這次執行期的目錄）重新組出路徑**，不依賴存死的絕對路徑——封面這條路徑當初漏了比照這個已經存在的正確模式，是這次抓到的設計不一致。
- **修法**：`mobile/lib/library.ts` 新增 `coverFilename` 欄位取代直接持久化絕對路徑；`saveCoverImage()` 改回傳 `file.name`（純檔名）；新增 `getCoverUri(record)`，比照 `getBookFileUri` 的模式，每次呼叫都用目前的 `coversDir()` 現算完整路徑，且用 `file.exists` 確認檔案真的還在才回傳（檔案已經不存在就回傳 `null`，讓畫面正常退回色卡佔位圖，而不是顯示一張讀不到的破圖）；為了讓已經因為這個 bug 存了舊格式絕對路徑的既有書籍有機會救回來，`getCoverUri()` 在沒有 `coverFilename` 時會退而求其次，從舊的 `coverUri` 字串取檔名部分（`.split('/').pop()`）重新拼回目前的 `coversDir()` 嘗試——如果封面實體檔案剛好還在（只是路徑字串失效），就能救回來；如果連檔案本身都不在了（例如整個容器被清空），就會 fallback 顯示色卡，不會出現破圖。`removeBook()` 刪封面檔案的邏輯也一併改用同一套 `coverFilename` 現算路徑。`(tabs)/index.tsx`、`components/BookCard.tsx`、`components/ListPanel.tsx` 都改成呼叫 `getCoverUri(record)`，不再直接讀 `record.coverUri`。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過，純打包/型別驗證，純 JS/TS 改動不涉及原生模組，不需要重新編譯 Dev Client。**完全尚未實機/模擬器測試**，麻煩確認：(1) 現有書籍重新整理後封面是否恢復顯示（如果沙盒容器真的整個被清空、封面實體檔案已經不在了，這批舊書會退回色卡，需要重新加入書籍讓 `extractMeta` 重新擷取一次封面存成新格式）、(2) 之後重新加入的新書封面是否正常顯示且能撐過下一次原生重新編譯、(3) 書櫃長按刪除書籍時封面檔案是否確實一起被刪除、沒有殘留孤兒檔案。這個修復我沒辦法在這個環境驗證是否真的解決你遇到的狀況（尤其如果容器真的整個被清空、封面檔案本身已經不存在，就只能靠重新加入書籍復原），需要你實測後回報結果。

**第十三輪再追加：清單／設定面板改成開關式圖示，移除多餘的關閉鈕與麵包屑列（2026-07-05，使用者附截圖回報）**：
- 使用者回報 `ListPanel.tsx` 頂部有兩層多餘的 UI：一個「✕ 書籤／目錄／資訊」列（`✕` 關閉鈕＋純顯示、點了沒作用的麵包屑文字），下面才是真正能切換的分頁列（書籤／目錄／資訊／註記），兩者重複；`SettingsPanel.tsx` 也有類似的關閉鈕列。要求全部移除，改成「再點一次頂部工具列的圖示就直接關閉」，且圖示要在面板開啟時高亮，讓使用者看得出目前開的是清單還是設定。
- **`mobile/components/ListPanel.tsx`**：整個「✕ ＋ 書籤／目錄／資訊」列直接刪掉，只留下面真正可切換的分頁列（往上補一點 `marginTop` 保持間距）；連帶移除不再使用的 `onClose` prop 與 `IconClose` import。
- **`mobile/components/SettingsPanel.tsx`**：頭部的 `✕` 關閉鈕移除，只留「排版與語音」標題文字；同樣移除不再使用的 `onClose` prop 與 `IconClose` import。
- **`mobile/app/reader/[id].tsx`**：原本的 `openSettings`/`openListPanel`（只會開、不會關）改成 `toggleSettings`/`toggleListPanel`——再按一次目前已經開著的那顆圖示會直接關閉（`setSettingsVisible((prev) => !prev)`／`setListPanelTab((prev) => (prev ? null : 'bookmarks'))`），同時保留原本「開其中一個要順便關掉另一個」的互斥邏輯。兩顆圖示按鈕加上開啟狀態的視覺提示：比照這次稍早書籤按鈕的做法，開啟時圖示顏色換成 `colors.progressFill`、背景墊一層 `colors.paperBg2` 色塊（`accessibilityState={{ selected }}` 一併補上，方便無障礙工具判讀）。
- **驗證狀態**：`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過，純打包/型別驗證，純 JS/TSX 邏輯與版面改動，不涉及原生模組，不需要重新編譯 Dev Client，reload 即可生效。**尚未實機/模擬器測試**：麻煩確認 (1) 清單／設定圖示點第二次是否正確關閉面板、(2) 面板開啟時圖示是否正確顯示高亮（顏色＋背景色塊）、關閉後是否正確恢復原色、(3) `ListPanel` 移除頂部列之後，分頁列上緣間距看起來是否還算合理（沒有貼著螢幕邊緣瀏海/狀態列）。

**第十四輪：閱讀頁頁數顯示，比照網頁版 Toolbar 設計（2026-07-05）**：
- 網頁版 `renderer/src/components/Toolbar.tsx` 中間區塊顯示「第 X 頁」＋細進度條＋「/ 共 Y 頁 · Z%」，X/Y 是**背景逐章渲染**算出的精確全書頁碼（`Reader.tsx` 的 `chapterPagesRef` 機制），mobile 沒有那套背景掃描機制（見第一輪「未做」清單）。
- **做法**：借用第九輪已經為了算精確 `percentage` 而產生的 `book.locations`（`reader-web/index.ts` 的 `book.locations.generate(1024)`），用 `book.locations.locationFromCfi(cfi)` 當「目前頁碼」（index+1）、`book.locations.length()` 當「全書總頁數」——這是概算值（location 顆粒度取決於 1024 字元切分，不是排版精確分頁），但足夠給使用者一個大致頁碼參考，且不需要额外背景渲染成本。`locations.generate()` 完成前 `page`/`total` 送 `null`，畫面先不顯示；`readerMessages.ts` 的 `relocated` 訊息型別對應改成 `page: number | null; total: number | null`。
- **已知型別坑**：`node_modules/epubjs/types/locations.d.ts` 把 `locationFromCfi()` 回傳型別誤標成 DOM 內建的 `Location`（單純撞名，實際上是 `number`），需要 `as unknown as number` 轉型，否則 `tsc` 會報 `>=`/`+` 不能用在 `Location` 上的錯誤。
- **UI**：`mobile/app/reader/[id].tsx` 頂部返回列下方新增一列（`pageInfo` 有值才顯示）：「第 X 頁」＋ `flex:1` 細進度條（`colors.progressTrack`/`colors.progressFill`）＋「/ Y · Z%」，樣式與配色照抄網頁版 Toolbar 中間區塊。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過，純打包/型別驗證。**尚未實機/模擬器測試**：麻煩確認 (1) 開書後頁數列多久會出現（等待 `locations.generate()` 跑完，書越大可能越慢）、(2) 翻頁時頁碼與進度條是否隨之更新、(3) 概算頁碼是否大致合理（不需要跟網頁版逐字比對，只要不會出現明顯跳動或負數/NaN）。

**第十四輪追加：兩種模擬器都完全沒看到頁數列（2026-07-05，使用者實測回報）**：
- **根因推測（未經實機證實）**：`relocated` 事件的 handler 只在「使用者翻頁/換章節時」觸發；`book.locations.generate()` 是背景非同步跑完（可能要幾百毫秒到幾秒），若使用者開書後沒有繼續翻頁，`locations` 算完這件事本身並不會觸發新的 `relocated` 事件，`page`/`total` 就會一直停在最初的 `null`，頁數列因此永遠不出現——這是「開書後靜靜看，不翻頁」這個路徑本來就會踩到的坑，先前只用「等下一次 relocated」的假設是不完整的。
- **修法**：`reader-web/index.ts` 把原本寫在 `relocated` handler 內的計算邏輯抽成獨立函式 `postRelocated(l)`，並新增模組層級變數 `lastRelocatedLoc` 記住最近一次的位置；`book.locations.generate(1024)` resolve 後除了設定 `locationsReady = true`，還會主動用 `lastRelocatedLoc` 呼叫一次 `postRelocated()` 補送，不必等使用者翻頁。
- **加了診斷用 debug log**（`post({ type: 'debug', ... })`，會經 `mobile/app/reader/[id].tsx` 的 `handleMessage` 印到 RN 端 `console.log('[reader-web debug]', ...)`）：`generate()` 開始/完成（含 length）/失敗、以及每次 `postRelocated` 算出的 `locationsReady`/`locIndex`/`locTotal`/`page`/`total`。這是暫時性診斷，之後確認穩定應該移除；若這次補送後使用者仍看不到頁數列，麻煩開 Metro/Expo 終端機或 Safari/Chrome Web Inspector 看這些 log，確認是 (a) `generate()` 根本沒開始/一直失敗，還是 (b) 有跑完但 `postRelocated` 算出的 `page`/`total` 仍是 `null`（例如 `locationFromCfi` 找不到位置回傳 -1），藉此縮小根因範圍，而不是繼續猜。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**同樣尚未實機/模擬器測試**——這個修法解決的是「開書後不翻頁就永遠看不到」這個已知邏輯漏洞，但無法排除還有其他根因（例如某些書 `generate()` 本身失敗），需要使用者這輪重新測試並回報 debug log 內容才能確認。

**第十四輪再追加：Android 翻不到書尾＋連續翻頁頁碼對不上（2026-07-05，使用者實測回報）**：
- **根因**：`book.locations.generate(1024)` 是跟 `rendition` 共用同一個 `book` 實例呼叫的。epub.js 的 `Locations.generate()` 內部會依序對「每一個」spine section 呼叫 `section.load()` 取內容、`section.unload()` 釋放——這批 section 物件跟 `rendition` 當下正在顯示、或使用者翻頁時即將要導覽進去的 section 是**同一份**。背景掃描把某個 section `unload()` 掉的當下，如果剛好是 rendition 準備要進入的 section，會撞見已經被清空的 document／內容快取：Android 上表現成「翻到接近書尾就卡住翻不過去」；連續快速翻頁時則表現成「epub.js 內部位置跟我們算出來的頁碼對不上，翻了好幾頁但頁碼沒跟著動」。這個背景掃描本身（原本是第九輪為了修正「讀畢」誤判而加的）從那時候就存在，只是這次因為新增頁碼顯示功能而被更仔細測試出來。
- **修法**：改用第二個**獨立、不掛 `renderTo()`** 的 `locationsBook` 實例（跟 `extractMeta()` 讀書名/封面用另一個 `metaBook` 是同一招——同一份 base64 重新 `ePub()` 解析一次），背景掃描只發生在這個獨立實例的 section 上，不會再跟 `rendition` 當下的 section 打架。連帶地，原本讀取 `l.start.percentage`（epub.js 內建算法，內部其實是用 `this.book.locations`，`this.book` 就是跟 rendition 共用的主 `book`，等於還是踩同一顆坑）也拿掉，全書精確進度百分比改成用 `locationsBook` 自己算的 `locIndex / locTotal`，跟頁碼共用同一份定位索引，數值上互相一致。
- `mobile/reader-web/index.ts`：新增模組層級變數 `locationsBook`；`loadBook()` 內 `rendition.display()` 之後改成 `locationsBook = ePub(base64ToArrayBuffer(base64)); await locationsBook.ready; await locationsBook.locations.generate(1024)`（包在自執行 async function 內、不 `await` 外層，維持原本「不拖慢開書速度」的行為）。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機/模擬器測試**：麻煩確認 (1) Android 上這次能不能順利翻到書本最後一頁、(2) 連續快速翻頁時「第 X 頁」數字是否每次翻頁都會跟著變化、不再卡在原地不動、(3) 進度百分比／「讀畢」判斷是否還維持正常（不會提早在章節結尾誤判 100%）。若還有異常，一樣可以看 `[reader-web debug]` 開頭的 log（`locationsBook.generate` 開始/完成/失敗、每次 `postRelocated` 算出的數值）幫忙定位。

**第十四輪再追加之二：使用者回報重新 build 後兩個問題依然都在（2026-07-05）**：
- **誠實記錄**：上一輪「獨立 locationsBook 隔開 section 衝突」的推測，實測結果證明**沒有解決問題**（或至少不是唯一根因），不能再假裝這個修法有效。這輪改往兩個新方向處理，但同樣缺乏實機驗證管道，如果這次還是沒改善，需要靠使用者提供的 debug log 才能真正定位，而不是繼續憑空猜測。
- **方向一（可能導致「連續翻頁頁碼跟不上」的根因）**：`locations.generate(1024)` 用 1024 字元切一個「location」，但一般字級設定下手機螢幕一頁大概只有幾百字，等於一個 location 大約橫跨 2 個實際螢幕頁——使用者翻 2 頁，頁碼概念上才會跳 1，這是原本設計對「概算」的取捨沒說清楚會有多粗，不是真的邏輯錯誤，但體感上就是「翻好幾頁沒反應」。**修法**：`reader-web/index.ts` 把切分粒度從 `1024` 字元降到 `350` 字元（`LOCATIONS_CHARS_PER_PAGE` 常數），讓一個 location 更接近一般設定下的一頁螢幕內容，仍不是精確 1:1（字體大小/行距等排版設定會讓實際落差不同），但應該會讓頁碼變化跟翻頁動作更貼近。
- **方向二（可能導致「Android 翻不到書尾」的另一個根因，尚未證實）**：即使改成獨立的 `locationsBook`，`ePub()` 解析 zip（JSZip 解壓）＋逐章掃描字元本身仍是吃 CPU 的背景工作，如果剛好在使用者開書後馬上連續翻頁測試的那幾秒執行，可能讓 WebView 主執行緒忙線，導致觸控/`relocated` 事件被延遲甚至掉幀。**修法**：`loadBook()` 內用 `setTimeout` 把 `locationsBook` 的建立與 `generate()` 延後 4000ms 才啟動，避開使用者剛打開書最常見的「馬上連續翻頁測試」這個時間窗口。
- **加強診斷**：`turnPage()` 現在每次呼叫都會送 debug log（direction、是否因為 `navBusy` 被略過、`rendition.next()/prev()` 的 promise 何時 resolve/reject），方便下次如果還有問題時，直接比對「使用者實際按了幾次」跟「log 裡真正執行了幾次、有沒有卡在 promise 沒 resolve」，而不是只能看最終畫面結果猜測。
- **這輪坦白說明限制**：以上兩個方向都是**推測**，我沒有辦法在這個環境重現 Android 模擬器連續翻頁或翻到書尾的行為，無法實際驗證是否真的解決。如果這輪測試後問題依然存在，**麻煩把 Metro/Expo 終端機裡完整的 `[reader-web debug]` 系列 log 貼給我**（尤其是使用者連續翻頁那段期間、以及翻到書尾附近卡住那次的 log），才能從「使用者實際按了幾次、log 裡對應到幾次 `turnPage` 執行、`relocated` 有沒有觸發」精確定位問題，不要再靠我單方面猜測改。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過，純打包/型別驗證，不代表功能已修正。

**第十四輪再追加之三：使用者回報頁碼有增加但翻兩頁才跳一次、Android 依然翻不到書尾（2026-07-05）**：
- **判斷**：字元切分粒度調整（1024→350）方向是對的但治標不治本——只要用「每 N 字元一個位置」概算，就永遠沒辦法保證使用者「翻一次螢幕頁＝頁碼加一」，因為 N 字元橫跨幾個實際螢幕頁會隨字體大小/行距等排版設定變動，不可能靠調參數湊出精確 1:1。Android 翻不到書尾的問題則兩輪都沒解決，代表「獨立 book 實例隔開 section 衝突」這個推測大機率是錯的方向。
- **改用網頁版既有、已驗證的做法**：`renderer/src/page/Reader.tsx` 的 `scanAllChapterPages`——背景用一個**隱藏、不顯示在畫面上**的 `hiddenRendition`（**跟主 rendition 共用同一個 book 實例**，不是另外重新解析一份）依序 `display()` 每個 spine 章節，直接讀 epub.js 自己算出來的 `displayed.total`（該章節在目前字級/行距/字距設定下的真實頁數，不是概算），加總起來當全書總頁數。因為讀的是 epub.js 真正的分頁結果，使用者在主畫面翻一次頁，`displayed.page` 就真的加 1，全書頁碼自然也是 1:1。這次額外想通的一點：**Rendition 的 `display()`／導覽本身不會呼叫 `section.unload()`，只有 `Locations.generate()` 才會**——所以用 hiddenRendition 掃描完全不用擔心先前顧慮的「跟主 rendition 搶同一批 section 物件」問題，可以放心共用同一個 `book`，不需要再另外解析一份（也省了重新解析 zip 的 CPU 成本）。
- `mobile/reader-web/index.ts`：新增 `scanAllChapterPages()`（建立隱形 `hiddenEl` 附加到 `document.body`、`book.renderTo(hiddenEl, ...)`、套用跟主 rendition 一樣的 `applyTypographyToDoc` hook、逐章 `await hiddenRendition.display(href)` 後讀 `currentLocation().start.displayed.total` 存進 `chapterPageCounts: Map<index, total>`，每章之間 `await new Promise(r => setTimeout(r, 0))` 讓出一個 tick 避免整段同步佔滿主執行緒，跑完 `hiddenRendition.destroy()` 並移除 `hiddenEl`）；`postRelocated()` 改成用 `chapterPageCounts` 累加「目前章節之前」的頁數 + 當前章節 `displayed.page` 算全書頁碼，累加全部章節算全書總頁數，寫法對應網頁版 `accuratePage`/`totalPages` 的計算方式。移除了上一輪的 `locationsBook`／`book.locations.generate(chars)` 整套字元概算邏輯。
- 保留上一輪「延後 4000ms 才開始背景掃描」與 `turnPage()` 的 debug log，這兩個改動本身沒有壞處，繼續留著。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機/模擬器測試**：這是目前為止最貼近網頁版做法、理論上最站得住腳的版本，但同樣沒有把握一定解決 Android 翻不到書尾的問題（那個推測至今兩輪都沒中，這次換了完全不同的技術路徑，用意是排除「locations 生成方式」這整條懷疑鏈，而不是繼續在同一條路上微調）。麻煩重新測試：(1) 連續翻頁時「第 X 頁」是否確實每翻一次就加 1、(2) Android 這次能不能翻到書本真正的最後一頁。若 (2) 依然沒解決，代表根因很可能完全跟頁碼功能無關，是更早就存在、和這個功能無關的翻頁/導覽層問題，需要換方向單獨排查（例如先確認不開頁碼功能的情況下，Android 單純翻頁到書尾是否本來就有問題），而不要再往頁碼計算這個方向猜。

**第十四輪再追加之四：Android 已能翻到書尾，但最後一頁顯示「第 315 頁／共 316 頁・100%」（2026-07-05，使用者實測回報＋截圖）**：
- **證實**：上一輪換成 `scanAllChapterPages` 隱藏渲染的做法後，Android 翻不到書尾的問題**這次真的解決了**——原本「獨立 book 實例隔開 section 衝突」的推測方向確實是錯的，問題根因跟 `Locations.generate()` 有關，換掉整套機制後就好了。
- **新的小落差**：畫面顯示「第 315 頁」但「共 316 頁」，內文卻已經是「[全書完]」——顯然使用者已經在真正的最後一頁。**根因**：`scanAllChapterPages()` 的 `hiddenRendition` 跟畫面上真正顯示中的 `rendition` 是兩個各自獨立的渲染流程，即使套用完全相同的字級/行距/字距設定，字型載入時機、版面量測時機等細節仍可能有極小差異，導致兩邊各自算出「最後一章有幾頁」時相差 1 頁——這不是計算邏輯錯誤，是兩份獨立渲染結果之間無法完全對齊的先天限制。
- **修法**：`postRelocated()` 內，`chapterPageCounts` 算出 `pageTotal` 後，如果 epub.js 自己回報的 `l.atEnd`（真的已經翻到書尾）為真，直接把 `page` 強制設成等於 `pageTotal`——用 epub.js 自己「是否已到書尾」的判斷當最終校正基準，不管背景掃描跟即時渲染兩邊差了幾頁，翻到真正最後一頁時畫面一定會顯示「第 Y 頁／共 Y 頁・100%」，不會再出現「明明讀完了但頁碼沒對齊」的觀感問題。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機測試這個最新的 atEnd 校正**：麻煩確認翻到書尾時「第 X 頁」是否確實等於「共 Y 頁」且顯示 100%；另外因為使用者這輪已確認「連續翻頁頁碼是否每次準確加 1」看起來沒有再回報異常，可以視為這部分已驗證通過（如果實際上還有落差，麻煩再告知）。

**第十四輪再追加之五：atEnd 校正沒生效，重新 build 後落差依舊（2026-07-05，使用者回報）**：
- **真正根因（這次找到具體機制，不是猜測）**：epub.js 的 `rendition.next()`/`prev()` 實際上只會在 `item.linear === 'yes'` 的章節之間移動（`node_modules/epubjs/src/spine.js` 的 `item.next()`/`item.prev()`，遇到 `linear !== 'yes'` 的章節會整個跳過，使用者靠翻頁永遠到不了）；`atEnd` 的判斷條件也明確寫死是「目前章節 === `book.spine.last().index`」（`node_modules/epubjs/src/rendition.js` 第 825 行），這裡的 `spine.last()` 是**整個 spine 陣列最後一筆**，不管它是不是 linear。epub 檔案很常把版權頁／後記等單獨標成 `linear="no"`（例如放在最後一個 spine 項目）。之前的 `scanAllChapterPages()` 掃描的是**全部** spine 章節（沒有排除 non-linear），把使用者翻頁永遠碰不到的那個 non-linear 章節的頁數也算進 `pageTotal`，導致總頁數比使用者實際能翻到的最大頁數多；同時因為那個 non-linear 章節不是 spine 最後一筆以外的情形時 `atEnd` 也不會在使用者翻到的真正最後一頁被觸發（`end.index` 永遠到不了 `spine.last().index`），上一輪加的 `if (l.atEnd) page = pageTotal` 校正因此完全沒有機會執行——這解釋了為什麼那個修法沒有效果。
- **修法**：`scanAllChapterPages()` 改成只掃描 `item.linear === 'yes'` 的章節（`linearItems = spineItems.filter(item => item.linear === 'yes')`），`chapterPageCounts` 只會收錄使用者翻頁真正到得了的章節，non-linear 章節的頁數不會被算進全書總頁數，兩者的落差自然消失，不需要再依賴 `atEnd` 硬校正（`atEnd` 校正邏輯保留當作保險，理論上不會再被觸發）。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機測試**：麻煩確認翻到書尾時「第 X 頁」這次是否真的等於「共 Y 頁」；如果這本書原本就沒有 non-linear 章節，這個修法不會改變任何顯示結果，落差若依然存在就代表根因不是這個，需要請你回報翻到書尾那次的 `[reader-web debug]` log（尤其 `postRelocated` 那行印出的 `spineIndex`/`page`/`total`/`atEnd` 數值），才能繼續往下查。

**第十四輪再追加之六：使用者回報 debug log，找到真正卡住的原因（2026-07-05）**：
- 使用者這本書沒有 non-linear 章節（上一輪修法沒改變結果），但提供的 log 顯示連續按兩次「下一頁」，兩次 `postRelocated` 印出的數值完全一樣：`spineIndex=22 page=315 total=316 atEnd=false`——`turnPage` 的 log 也顯示 `[turnPage] direction=next promise resolved`（epub.js 的 `next()` 有正常呼叫、promise 也正常 resolve），但畫面位置（CFI）完全沒有移動，也沒有觸發 `atEnd`。
- **根因**：最後一章（spineIndex 22）結尾有一小段內容，epub.js 的分頁量測（`displayed.total`）認為那還算獨立的一頁，但 `next()` 實際上翻不過去（可能是那段內容太短/是空白，epub.js 內部判斷「沒有更多內容可以顯示」而拒絕真的翻頁，但同時因為 `displayed.page` 還沒追上它自己量出的 `displayed.total`，`atEnd`（`node_modules/epubjs/src/rendition.js` 第 825 行的判斷）就一直不會是 `true`）。這是 epub.js 對這一類「章節結尾剩一小段」情境的分頁量測跟實際導覽結果不一致的既有行為，不是我們的計算邏輯錯誤，靠 `atEnd` 旗標校正在這種情況下天生就不會生效。
- **修法**：`reader-web/index.ts` 新增 `lastNavDirection` 記錄剛剛呼叫的是 `prev()` 還是 `next()`；`postRelocated()` 現在會額外收到「呼叫翻頁前的 CFI」，如果剛剛呼叫的是 `next()`、但這次 relocated 事件的 CFI 跟呼叫前完全一樣（代表畫面根本沒有真的翻動），就直接把 `pageTotal` 校正成等於目前的 `page`（不是反過來把 `page` 往上推，因為使用者畫面上就是停在這裡，沒有更多內容可以顯示；把 `page` 硬推高只會讓「共 Y 頁」對得上但畫面顯示的頁碼變成假的）。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機測試這次的修正**：麻煩確認翻到書尾（連續按下一頁按到不會再動為止）時，畫面是否會變成「第 X 頁／共 X 頁・100%」（兩個數字一致）；如果還有落差，麻煩再貼一次那次的 `[reader-web debug]` log（這次應該會多印出一行「偵測到 next() 後 CFI 未變化…」的校正 log，可以確認校正邏輯有沒有被觸發到）。

**第十四輪再追加之七：postRelocated 的 stuck-CFI 校正確實有效，但要多按一次「下一頁」才會生效（2026-07-05，使用者實測回報＋截圖）**：
- 使用者截圖確認：翻到書尾第一次顯示「第 315 頁／共 316 頁・100%」，再按一次下一頁畫面沒有變動，這時才變成「第 315 頁／共 315 頁・100%」——上一輪加的 stuck-CFI 校正邏輯本身是有效的，但要使用者多按一次原本不需要的「下一頁」才會觸發，體驗上不夠好（使用者會覺得「怎麼按了沒反應，還要再按一次數字才對」）。
- **修法**：把驗證提前到背景掃描階段，不要等使用者自己翻到書尾才發現。`scanAllChapterPages()` 現在對「全書最後一個 linear 章節」多做一次驗證：先用 epub.js 量出來的 `displayed.total` 當初始值，接著在隱藏的 `hiddenRendition` 上實際逐頁呼叫 `next()`，每次都比對 CFI 是否真的往前移動；一旦 CFI 不再變化，就代表那就是真正能翻到的最後一頁，把這章的頁數改記錄成這個「實測驗證過」的頁數，而不是 epub.js 一開始量出來、可能多算 1 頁的 `displayed.total`。這樣使用者第一次翻到書尾時，頁碼／總頁數就已經是對的，不需要再多按一次。只對最後一章做這個額外驗證（其他章節中間如果也有同樣的量測誤差，頂多讓全書總頁數有 ±1 的極小誤差，不會像最後一頁那樣造成「卡住翻不動」的明顯體驗問題，不需要對每一章都做，避免背景掃描時間大幅增加）。
- 上一輪加的 `postRelocated` stuck-CFI 校正邏輯（使用者多按一次下一頁時的保險）繼續保留，當作這個背景驗證萬一沒觸發到（例如某些特殊情況）時的最後防線，兩者不衝突。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機測試**：麻煩確認這次翻到書尾時，是不是第一次就顯示「第 X 頁／共 X 頁・100%」，不需要再多按一次下一頁。

**第十四輪再追加之八：加了背景驗證後反而「翻不到最後一頁」變成真的翻不動了（2026-07-05，使用者回報＋log＋截圖）**：
- **回報現象**：log 顯示 `postRelocated` 校正訊息「pageTotal 從 315 校正為 315」（數字沒變，代表背景驗證這次算出來的總頁數本身就是 315），但截圖顯示畫面卡在「凱蒂活下來了…」那段，還沒翻到「[全書完]」那頁——代表背景驗證算出的 315 是**錯的、少算了**，把使用者原本翻得到的最後幾頁都排除在外，比上一輪（顯示 315/316，只是數字對不上但至少翻得到底）還要糟。
- **根因**：上一輪新增的驗證迴圈裡，`await hiddenRendition.next()` 的 promise 一 resolve 就馬上呼叫 `currentLocation()` 讀新位置——但這個 promise resolve 的時機，不保證 epub.js 內部的位置狀態已經真的更新完成（這正是主畫面翻頁那邊，`navBusy`/`unlockNavSoon` 需要在 relocated 之後還額外留 250ms 緩衝時間、不能 promise 一 resolve 就解鎖的同一個原因，這裡新寫的驗證迴圈忽略了這個已知的坑）。結果驗證迴圈常常在還沒真的翻到底時，就因為讀到「舊」CFI 誤判成「翻不動了」而提前中止，把後面其實翻得到的頁數也算沒了。
- **修法**：驗證迴圈改成掛一次性的 `hiddenRendition.on('relocated', ...)` 監聽器，`next()` 呼叫後改成等真正的 `relocated` 事件觸發（而不是 promise resolve 當下）才讀新的 CFI 判斷有沒有真的翻動；有 1000ms 逾時保護避免萬一沒收到事件卡住背景掃描。
- **這輪的風險評估，供下次對話參考**：如果這個修法還是不準，比較安全的退路是**整個拿掉「背景預先驗證最後一章」這個附加功能**，只保留已經證實有效、無害的 `postRelocated` stuck-CFI 即時校正（代價只是使用者翻到書尾那次要多按一次「下一頁」才會把數字校正成一致，不會有「明明翻得到卻被擋住」這種更嚴重的問題）。背景預先驗證是體驗優化（少按一次），不是必要功能，優先度低於「翻頁本身不能被我們的計算邏輯卡住」。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機測試**：麻煩確認 (1) 這次翻到書尾能不能翻到「[全書完]」那頁、(2) 到達之後頁碼／總頁數是否一致。如果還是翻不到底或數字算少了，請直接告訴我，下一步會考慮移除這個背景驗證功能，改回只靠即時校正。

**第十五輪：點目錄章節無法跳轉＋goto 補上 navBusy 忙碌鎖（2026-07-05，使用者回報 iOS/Android 皆有問題）**：
- **第一步**：`goto`（目錄／書籤跳轉）訊息原本完全沒有經過翻頁用的 `navBusy` 忙碌鎖，直接呼叫 `rendition.display(target)`。如果使用者剛翻頁、鎖還沒解開（`unlockNavSoon` 的 250ms 緩衝內）就馬上點目錄章節，會變成 `display()` 跟前一次 `next()/prev()` 同時操作 epub.js 內部狀態——這正是 `navBusy` 鎖原本要擋的情況，只是 `goto` 這條路徑當初漏接了。改成新增 `gotoTarget()`，用短輪詢等現有忙碌鎖解開後才真的執行（不像 `turnPage` 忙碌時直接略過——章節/書籤跳轉是使用者明確的單次意圖，不應該被靜默丟棄），並加上 debug log。
- **第二步（使用者提供 log 後找到的真正根因）**：加了 log 後使用者實測回報 `[goto] target=../Text/Section0055.xhtml promise rejected: No Section Found`——問題其實不是忙碌鎖，是 **href 格式對不上**。epub.js 的 `Navigation` 解析器（`node_modules/epubjs/src/navigation.js`）完全不會正規化 nav/ncx 檔案裡寫的 href（建構時沒有傳入 resolver），而 `nav.xhtml`／`toc.ncx` 常常跟內容檔案放在不同資料夾，導致目錄裡的 href 是**相對於 nav 檔案自己的路徑**（例如 `../Text/Section0055.xhtml`），跟 spine item 的 href（相對於 OPF 解析出來的路徑，例如 `Text/Section0055.xhtml`）對不起來，`spine.get()` 找不到對應 section，`rendition.display()` 因此拋出 `No Section Found`。
- **修法**：新增 `resolveNavTarget()`，先用 `/^epubcfi\(/i` 判斷是不是 CFI（書籤跳轉用，本身就是 spine 索引編碼過的字串，不需要這段正規化），如果是章節 href，改用**檔名比對** `book.spine.items` 找出對應項目，拿 spine item「自己的」href 去 `display()`——這是照抄網頁版 `renderer/src/page/Reader.tsx` 的 `handleNavigateToChapter` 已經驗證過的解法（同一個 monorepo 的 web 版本原本就踩過、也修過這題，這次只是把同一招搬到 mobile）。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機測試**：麻煩確認目錄點擊章節這次是否能正常跳轉（iOS、Android 都測），也留意 debug log 是否有印出「href 正規化 ... -> ...」這行，可以確認有沒有真的比對到 spine item。

**待查（尚未動手）**：使用者另外回報 Android「點一次右側畫面翻頁區塊卻實際翻兩頁」，原因未知，使用者選擇先擱置、優先處理目錄跳轉問題。下次對話若要繼續查，需要使用者重現當下（點一次、確認翻了兩頁）前後的完整 `[reader-web debug]` log，藉此分辨是「同一次點擊觸發了兩次 `turnPage`」還是「一次 `turnPage`/`next()` 內部就跳了兩頁」，兩者根因與修法完全不同，不要沒有 log 就先猜著改。

**第十五輪追加：目錄跳轉已修好，但 Android 書中間頁碼卡在「第 301 頁／共 301 頁・100%」（iOS 同一位置正常顯示「第 321 頁／共 337 頁・95%」）（2026-07-05，使用者截圖回報）**：
- **先確認現象**：問過使用者，畫面在這個位置還是能正常繼續往前翻（不是卡住），純粹是頁碼／總頁數的數字顯示錯了——排除掉「翻不到底」那一類問題，縮小到單純的計算邏輯錯誤。
- **根因**：`postRelocated()` 裡第十四輪加的 stuck-CFI 校正（`next()` 後 CFI 沒變就把 `pageTotal` 降到等於 `page`）沒有限制只在真正的書尾章節才生效，只要 `next()` 之後任何一次 relocated 事件剛好回報了「跟前一次相同的 CFI」就會觸發。Android 上翻頁跨章節時，偶爾會有這種 relocated 事件回報了尚未更新的 CFI（不是真的卡住，多半再翻一次就正常前進），這個校正邏輯把它誤判成「已經到書尾」，把 `pageTotal` 永久鎖死在當下頁碼——這正是這次看到「書中間卡在 100%」的根因，是上一輪加的保險機制本身的副作用，不是新問題。
- **修法**：新增 `lastLinearSpineIndex`（由 `scanAllChapterPages()` 設定成全書最後一個 linear 章節的 spine index），`postRelocated()` 的 stuck-CFI 校正現在多加一個條件：只有 `l.start.index === lastLinearSpineIndex`（真的在最後一章）才會觸發，書中間任何章節都不會被這個校正影響，避免誤判。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機測試**：麻煩確認 (1) 書中間翻頁時頁碼／總頁數是否恢復正常、不會再卡在某個數字不動、(2) 翻到真正書尾時「第 X 頁／共 X 頁・100%」的校正是否仍然正常運作（避免這次限制範圍時把原本修好的書尾情境弄壞）。

**第十五輪再追加：範圍限制沒解決問題，log 顯示總頁數整段都跟頁碼同步變化（2026-07-05，使用者附完整 log 回報）**：
- **回報現象**：使用者這次附的 log 顯示，翻到最後一章後連續按 4 次下一頁，「共 X 頁」的數字**每次都跟著「第 X 頁」一起變成一樣的數字**（312/312 → 313/313 → 314/314 → 315/315），代表全書總頁數根本沒有被當成固定值，而是被算成跟目前頁碼一樣——範圍限制（只在最後一章生效）本身沒錯，但揭露了另一個更根本的問題：全書總頁數的來源本身就是錯的。
- **真正根因**：這一切都指向 `chapterPageCounts.get(22)`（全書最後一個 linear 章節、也就是使用者當下正在看的這一章）被記錄成一個遠小於實際值的數字（例如 1），導致「全書所有章節頁數加總」这個 `totalPages` 一路都小於「目前頁碼」，`Math.max(totalPages, page)` 於是每次都選中 `page` 自己，畫面上總頁數就變成跟著頁碼同步跳動。往回追，兇手是第十四輪加的「對最後一章逐頁模擬 `next()`，驗證真的翻不翻得動」那段背景驗證邏輯：它會等待 `hiddenRendition` 的 `relocated` 事件才判斷有沒有真的翻頁，但如果**這個事件在背景掃描當下遲遲沒有觸發**（逾時 1000ms 或時序問題，在 Android 模擬器背景執行時很有可能發生），迴圈會在還沒真的翻完一整章之前就提早中止，把這一章的頁數嚴重低估到接近初始值（例如整章只算出 1 頁）——這比它原本想解決的「多算 1 頁」問題嚴重得多。
- **修法（這次選擇拿掉整個功能，不再修修補補）**：`scanAllChapterPages()` 移除「對最後一章模擬 next() 驗證」這整段邏輯，改回完全信任 epub.js 量出來的 `displayed.total`（跟其他章節一視同仁，不再對最後一章特殊處理）。原本這段驗證想解決的「使用者翻到書尾時可能多算 1 頁」，改回完全交給 `postRelocated()` 的 stuck-CFI 校正處理（`next()` 真的卡住、CFI 沒變、且發生在 `lastLinearSpineIndex` 時才校正）——差別只是使用者翻到書尾那次要多按一次「下一頁」數字才會校正一致，但不會再有把整章頁數低估成 1 頁這種嚴重錯誤。
- **這輪教訓**：背景模擬導覽（呼叫 `next()`／等 `relocated` 事件）在 Android 這個環境下時序不可靠，已經連續兩輪在這個「背景預先驗證最後一章」功能上出包（先是提早誤判翻不動、這次是逾時提早中止）——**日後不要再嘗試用背景模擬導覽的方式取得精確頁數**，優先用「使用者實際翻頁時即時修正」這種被動、低風險的做法，即使代價是體驗上少一點即時性。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過。**尚未實機測試**：麻煩確認 (1) 全書總頁數這次是否恢復成固定值、不會再跟著頁碼一起跳動、(2) 翻到真正書尾時，是否還是需要多按一次下一頁才會讓頁碼／總頁數校正一致（這是預期中的、可接受的行為，不是 bug）。**使用者後續貼的 log 顯示總頁數全程固定在 316、翻到書尾後校正也正確從 316 變成 315（見上一輪的 log），推斷已解決，但使用者沒有明確用文字說「好了」，之後若還有相關回報要留意。**

**第十六輪：閱讀頁與書櫃卡片的進度百分比不一致（2026-07-05，使用者截圖回報「個人時代」書櫃顯示 28%、閱讀頁顯示 29%）**：
- **根因**：兩處各自用不同公式算百分比。存進書櫃／`updateProgress()` 用的是 `postRelocated()` 算出的 `percentage`（`(page - 1) / (total - 1)`，語意是「第 1 頁 = 0%，最後一頁 = 100%」）；但 `mobile/app/reader/[id].tsx` 閱讀頁footer 自己另外用 `page / total`（沒有減 1）重算了一次百分比給畫面顯示用。兩個公式在頁數夠大時差異很小，四捨五入後常常剛好差 1%，就是這次「書櫃 28%、閱讀頁 29%」的來源——不是進度儲存錯誤，是同一份資料被算了兩次、公式不一致。
- **修法**：`readerMessages.ts` 的 `relocated` 訊息本來就有 `percentage` 欄位（已經在算了，只是閱讀頁沒有拿來用），`mobile/app/reader/[id].tsx` 的 `pageInfo` state 新增 `percentage` 欄位直接存下 `msg.percentage`，footer 的百分比顯示與進度條寬度改成直接用 `Math.round(pageInfo.percentage * 100)`，不再自己用 `page/total` 另外算一次——這樣閱讀頁畫面上顯示的數字，保證跟同時間存進 `updateProgress()`、書櫃卡片讀到的是同一個數字來源，四捨五入結果一定一致。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過，純 JS/TSX 改動不影響原生模組，不需要重新編譯 Dev Client。**尚未實機測試**：麻煩確認同一本書在書櫃卡片與閱讀頁 footer 顯示的百分比這次是否完全一致。

**第十七輪：iOS 模擬器點目錄章節跳轉失敗，且完全沒看到任何 debug log（2026-07-05）**：
- 使用者回報 iOS 模擬器上目錄跳轉失敗；請對方抓 log 時，回報「完全沒有 log」——這比「有 log 但數字不對」更值得注意，代表問題可能發生在比 `gotoTarget()`／`resolveNavTarget()` 更早的環節（例如 `ListPanel` 章節按鈕的觸控事件在 iOS 上根本沒有觸發、或 postMessage 沒有送達 WebView），先前這幾輪除錯（`[reader-web debug]`）都是 WebView 內部的 log，如果訊息根本沒送到 WebView，這些 log 自然一行都不會出現。
- **這次還沒找到根因，只先補齊診斷用的 log，縮小範圍**：
  1. `mobile/app/reader/[id].tsx` 的 `handleNavigateToTarget()` 新增一行**純 RN 端**（不經過 WebView bridge）的 `console.log`，印出呼叫時的 `target` 跟 `webviewRef.current` 是否存在——如果連這行都沒出現，代表問題出在 `ListPanel` 章節列表的按鈕本身沒有把觸控事件正確傳到這個函式，是 RN 元件層級的問題，跟 WebView／epub.js 完全無關。
  2. `mobile/reader-web/index.ts` 的 `handleMessage()` 補上「JSON.parse 失敗」的 log（原本失敗是直接靜默 return，訊息內容跟原因完全看不到）以及「收到任何合法訊息就印出 type」的一行 log——如果第 1 點的 log 有出現、但這裡完全沒印，代表 `postMessage` 送出去了但 WebView 端沒收到（iOS/Android 傳遞 message 事件的機制不同，`document`/`window` 都有掛 listener，但不排除 iOS 這裡還有沒覆蓋到的情況）。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過，純診斷用改動。**下一步需要使用者重新測試並回報兩種 log 各自有沒有出現**：(1) 純 RN 端的 `[reader] handleNavigateToTarget ...`、(2) WebView 端的 `[reader-web debug][ios] [handleMessage] 收到 type=goto`。哪一個先斷掉，就能準確定位問題在 RN 元件層、訊息傳遞層、還是 WebView 內部處理邏輯，這次不要再猜，先看這兩個 log 的落點。

**另外回報的 `TurboModuleRegistry.getEnforcing(...): 'RNCWebViewModule' could not be found` 錯誤，跟頁碼功能無關**：這是原生模組層級的錯誤，代表目前執行的 Android 原生 App 二進位檔裡沒有註冊 `react-native-webview` 這個原生模組——純 JS/Metro 的 reload 或 Fast Refresh 沒辦法修好這種錯誤，因為原生模組需要在原生建置（compile）階段連結進 App 裡。這次對話完全沒有異動任何原生依賴（`package.json` 的 `react-native-webview` 版本從頭到尾都是 `13.16.1`，見 `mobile/package.json`），所以這應該是環境面的問題，不是這幾輪程式改動造成的。**建議處理方式**：關掉目前的 Metro/Dev Client，重新跑一次 `npx expo run:android`（不是 `yarn start`／`expo start`）讓它重新編譯並安裝原生 App；如果重新編譯後還是一樣，可能要試著清一下 Android 的 build 快取（`cd android && ./gradlew clean`，跑完再 `npx expo run:android`）。

**第十七輪追加：iOS 目錄跳轉問題重新測試後恢復正常，移除所有診斷用 log（2026-07-05）**：
- 使用者回報「剛才測試又變正常了」，第十七輪那次 iOS 跳轉失敗研判是一次性/暫時性狀況（例如尚未重新整理到最新 JS bundle、或模擬器本身的暫時性問題），不是程式邏輯的 bug，沒有繼續深究根因。
- 使用者要求移除這幾輪為了除錯陸續加上的所有診斷用 log，全部清除：
  - `mobile/reader-web/index.ts`：`debugLog()` 函式本身、`turnPage()`／`gotoTarget()`／`registerTapZone()`／`scanAllChapterPages()`／`postRelocated()`／`handleMessage()` 內所有 `debugLog(...)`／`post({ type: 'debug', ... })` 呼叫全部移除，恢復成單純的邏輯（不影響任何行為，只是拿掉印 log 的動作）。
  - `mobile/lib/readerMessages.ts`：`OutboundMessage` 移除 `{ type: 'debug'; message: string }` 這個變體。
  - `mobile/app/reader/[id].tsx`：`handleMessage` 移除 `msg.type === 'debug'` 的分支（原本會 `console.log('[reader-web debug][...]', ...)`）；`handleNavigateToTarget` 移除上一輪新增的純 RN 端診斷 `console.log`；連帶移除已經沒用到的 `Platform` import。
- **驗證狀態**：`tsc --noEmit`、`yarn build:reader`、`expo-doctor`（20/20）皆通過，純移除診斷程式碼，不涉及任何功能邏輯改動，理論上不需要使用者額外測試，但如果之後這幾個功能（翻頁頁碼、目錄跳轉）又出現問題，會需要重新加回類似的 log 才能除錯。

**第十八輪：註記筆記功能第一版（對應重構任務第 7 項起點，2026-07-05）**：
- 對應「後續重構任務」第 7 項：搬移網頁版「劃線＋感想筆記」邏輯（`renderer/src/store/useAnnotationStore.ts`／`NotePanel.tsx`／`HighlightPopup.tsx`／`annotationUtils.ts`／`annotationExport.ts`，見 `408b1eb` commit）。mobile 這是第一次動這個功能，之前都只有 `ListPanel.tsx` 的「註記」分頁空殼文字。
- **資料模型**：`mobile/lib/library.ts` 新增 `Annotation` 介面（`id`/`cfi`/`text`/`color`/`chapter`/`createdAt`/`note?`，欄位跟網頁版 `useAnnotationStore.ts` 的 `Annotation` 一致）與 `loadAnnotations`/`saveAnnotations`（存 AsyncStorage，key 比照書籤模式 `tit:annotations:<id>`），`removeBook()` 一併清除。新增 `mobile/lib/annotationColors.ts` 的 `HIGHLIGHT_COLORS`（5 色，數值跟網頁版 `annotationUtils.ts` 保持一致）。
- **重要設計決定：劃線操作列改用「畫面底部固定列」，不是網頁版那種浮在選取文字旁邊的懸浮泡泡**：網頁版 `HighlightPopup.tsx` 靠滑鼠位置精確定位，但 mobile 這邊選取文字發生在 epub.js 內容 iframe 裡，這個 iframe 在 iOS WKWebView 上的內部座標系統這幾輪已經反覆證實不可靠（見第十四輪「iOS WKWebView 裡...window.innerWidth 跟觸控 clientX 座標數值高達數千 px」那個坑，翻頁點擊區也是因為同一個問題才改成蓋在最外層的 tap-zone）。與其冒同樣的風險去算選取文字的精確螢幕座標，這次刻意選擇跳過這整類座標數學：選取文字或點擊既有標記時，一律在畫面底部彈出固定操作列（`mobile/components/SelectionBar.tsx`，`mode: 'selection' | 'edit'`），完全不需要計算文字在螢幕上的位置。這是刻意的簡化取捨，不是漏做。
- **`mobile/reader-web/index.ts`**：
  - 劃線標記渲染／點擊：`applyAnnotations(list)` 整批比對目前畫面上的標記跟 RN 端傳來的最新清單（新增/顏色變更就 `rendition.annotations.underline()` 重畫、清單裡消失的就 `rendition.annotations.remove()`），照抄網頁版 `addEpubAnnotation` 用的 `'underline'` 型別＋`stroke`/`stroke-width` 樣式；epub.js 的 `Annotations` 類別本身會在 `hooks.render` 自動把已加入的標記套用到每個新渲染的章節 iframe（見 `node_modules/epubjs/src/annotations.js` 建構子），換頁/換章節不需要手動重掛。
  - 文字選取：改用 `rendition.on('selected', (cfiRange, contents) => ...)`——epub.js 的 `Contents` 類別本身已經監聽 `selectionchange`（`node_modules/epubjs/src/contents.js`）並幫忙把選取範圍換算成 CFI 字串，不需要自己手動算 CFI 或碰觸選取範圍的螢幕座標。但這個事件**只在選取範圍非空時**才會 emit，使用者點掉選取／收合選取範圍完全沒有對應事件，因此另外在既有的 `hooks.content.register` 內加一個自己的 `selectionchange` 監聽，只在偵測到「收合」時 post `selectionCleared` 關閉操作列，兩者互不干擾（各自關注不同的狀態轉換）。
  - 新增 inbound 訊息 `setAnnotations`（RN 每次新增/改色/刪除註記都送一次完整清單）、`clearSelection`（劃線動作完成後，清掉目前顯示中 iframe 的原生選取反白，讓畫面改由新畫的底線標記接手）；`load` 訊息新增 `annotations` 欄位，開書時連同 cfi 一起帶入，`rendition.display()` 完成後立即 `applyAnnotations(initialAnnotations)` 畫出這本書已存的所有標記。新增 outbound 訊息 `textSelected`（cfi + 選取文字）、`selectionCleared`、`annotationTapped`（使用者點了既有標記，只帶 id，不帶座標——沿用上面「不算座標」的設計決定）。
- **`mobile/app/reader/[id].tsx`**：新增 `annotations`/`selection`/`editingAnnotationId` state；`handleWebViewReady` 的 `Promise.all` 一併 `loadAnnotations(id)`，跟 base64/cfi 一起送進 `load` 訊息。新增 `handleCreateAnnotation`（用 `selection.cfi`/`.text` + 使用者選的顏色 + 目前 `currentChapterTitle` 組成新記錄，存檔並整批同步給 WebView，同時送 `clearSelection` 清掉原生選取反白）、`handleChangeAnnotationColor`、`handleDeleteAnnotation`、`handleUpdateAnnotationNote`（筆記純粹是 RN 端資料，不影響標記顏色，不需要通知 WebView）、`handleNavigateToAnnotation`（複用既有的 `goto` 訊息）、`handleCopySelection`（`expo-clipboard`，已是既有依賴）、`handleSearchSelection`（`Linking.openURL` 開 Google 搜尋，比照網頁版 `HighlightPopup` 的 G 按鈕）。`toggleSettings`/`toggleListPanel` 也一併清掉 `selection`/`editingAnnotationId`，避免底部操作列跟設定/清單面板同時疊在畫面上。
- **`mobile/components/ListPanel.tsx` 的「註記」分頁**：從原本的「尚未支援」空殼文字，改成完整清單：每筆顯示選取文字（左側色條標示顏色，`numberOfLines=4`）＋章節＋日期，可勾選（全選／個別）、點顏色圓點展開色票更換顏色、點 ✕ 兩段式確認刪除、感想筆記可新增/編輯/清空（`TextInput` 多行，儲存/取消/刪除筆記三個按鈕，比照網頁版 `NotePanel.tsx` 的 `editingNoteId`/`editingNoteText` 狀態機）、點文字本身跳轉到該段落（複用 `goto`）。**匯出改用 RN 內建的 `Share.share()`**，不是網頁版的「產生 .txt 檔案下載」：mobile 沒有「下載資料夾」這個概念，`Share` 更貼近手機使用情境（可以分享到訊息、筆記、其他 App），不需要額外裝 `expo-sharing`；匯出文字格式（依章節分組、`• 文字` + `筆記：...`）照抄網頁版 `annotationExport.ts`。
- **依賴變更**：無新增套件，全部沿用既有的 `expo-clipboard`（`ListPanel.tsx` 已裝）與 RN 內建 `Share`/`Linking`。
- **驗證狀態**：`yarn build:reader`、`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android`、`expo export --platform ios` 皆通過，純打包/型別驗證，這次沒有新增原生模組，不需要重新編譯 Dev Client，reload 即可生效。**完全尚未實機/模擬器測試**，這是全新功能的第一版，風險比之前的小修正高很多，麻煩重點確認：
  1. 在書本內文中間三分之一區域（`build-reader-html.js` 的 tap-zone 只蓋左右各 33%，中間留給選字）長按選取一段文字，畫面底部是否會跳出顏色選取列；點任一色是否會在該段文字下方畫出對應顏色的底線標記。
  2. 點擊已經畫好的底線標記，底部是否改成「換色／刪除」操作列；換色是否即時反映在畫面上的標記顏色；刪除是否會讓底線標記消失。
  3. 翻頁/回到同一頁後，先前劃的線是否還在（驗證 epub.js 標記有沒有正確跨頁重掛）；離開書本再重新打開這本書，標記是否還原（驗證 AsyncStorage 存讀）。
  4. 清單／設定面板打開時，底部操作列是否有正確一併關閉，不會疊在一起。
  5. 「清單」按鈕→「註記」分頁：新增的標記是否出現在清單、點文字是否正確跳轉、更換顏色/刪除/新增感想筆記是否正常運作、全選＋匯出是否會跳出系統分享選單且內容格式正確。
  6. iOS 這邊的選取手勢（長按出現選取控點、拖曳調整範圍）在 epub.js iframe 內是否運作正常——這是這次唯一沒有迴避掉、必須依賴系統原生選字手勢的部分，如果 iOS 這裡本身就有已知的 WKWebView 選字限制，可能需要另外處理，但目前沒有機制可以在這個環境驗證。
  這次没有事先預告哪一步最可能出問題，因為是全新功能沒有既有的踩坑紀錄可以參考，麻煩實測後把出問題的那個步驟明確告訴我（例如「第 1 步完全沒反應」或「第 3 步翻頁後標記消失」），才能對應到正確的環節排查，不要籠統說「註記功能怪怪的」。

**第十九輪：劃線完全無反應，加除錯 log 後新增「劃線模式」切換按鈕（2026-07-05，使用者兩種模擬器實測回報）**：
- 使用者回報：在畫面中間三分之一窄帶（tap-zone 沒蓋到的區域）長按嘗試選字，兩種模擬器都完全無效，沒有反白也沒有畫出標記。
- 依上一輪加的 log 排查：`[content touchstart]` 有正常印出（代表觸控確實有送達 epub 內容 iframe，原本懷疑的「tap-zone 整個擋掉觸控」不是唯一問題），但 `[selectionchange]`／`[rendition selected]` 完全沒有出現——代表長按手勢從頭到尾沒有真正進入「文字選取模式」，問題發生在觸控送達之後、原生選字手勢啟動之前的環節。
- **判斷**：使用者的長按操作，手指在按住/微調的過程中很可能會有些微位移，一旦位移掃出中間那條窄帶、碰到左右兩側不透明的 tap-zone div，長按手勢就會被中斷（tap-zone 蓋在最上層攔截觸控，見第十八輪／`registerTapZone` 的說明）。中間窄帶只有螢幕寬度的 33%，要求使用者精準壓在這麼窄的範圍內完全不移動並不實際。**這是推測，不是確認過的根因**——log 只能證明「送達了 touchstart 但選字沒有啟動」，無法區分是「手勢位移出窄帶被攔截」還是「模擬器的滑鼠模擬觸控本身就無法正確觸發長按選字手勢」（後者是模擬器環境的已知限制，跟程式碼無關，這個環境沒有辦法驗證是不是這個原因）。
- **應對方式（使用者提議，已採納）**：與其要求使用者精準操作，新增一個「劃線模式」切換按鈕（頂部工具列書籤圖示右側，`IconNotes`），讓使用者可以主動把畫面切到「整個寬度都能長按選字」的狀態：
  - `mobile/lib/readerMessages.ts` 新增 inbound 訊息 `setAnnotationMode`。
  - `mobile/reader-web/index.ts` 新增 `setAnnotationMode(enabled)`：開啟時把 `#tap-zone-prev`/`#tap-zone-next` 兩個 div 的 `style.pointerEvents` 設成 `'none'`，讓觸控直接穿透到底下的 epub 內容 iframe（等於畫面全寬都能長按選字），關閉時恢復 `'auto'`。
  - `mobile/app/reader/[id].tsx` 新增 `annotationMode` state 與 `toggleAnnotationMode()`：切換時送出 `setAnnotationMode` 訊息，關閉時額外送 `clearSelection` 清掉可能殘留的選取；跟既有的設定/清單面板互斥邏輯一致（開啟其中一個要順便關掉其他覆蓋層）；換書時（`[id]` reset effect）一併重置成 `false`。畫面上方新增一條提示橫幅（劃線模式開啟時顯示「劃線模式中：長按文字選取即可標記，點擊畫面翻頁已暫停」），提醒使用者這段期間點擊畫面兩側不會翻頁——這是刻意的取捨，翻頁跟選字兩種手勢原本就會搶同一塊觸控區域，不用「模式切換」很難兩全。
- **誠實說明限制**：這個修法解決的是「中間窄帶太窄、長按容易滑出去被攔截」這個已知可能成因；但log 沒辦法排除「模擬器的觸控模擬本身就不會觸發原生長按選字」這個可能性，這種情況下就算切到劃線模式（畫面全寬可選字），可能還是選不到，需要使用者這輪實測後回報結果才能確認。如果切到劃線模式後選字仍然完全沒反應，下一步應該優先懷疑是模擬器環境限制，可能需要在實機上才能真正驗證這個功能是否可用。
- **驗證狀態**：`yarn build:reader`、`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform android` 皆通過，純打包/型別驗證，純 JS/TSX 改動不涉及原生模組，不需要重新編譯 Dev Client。**尚未實機/模擬器驗證**：麻煩點擊書籤圖示右側新增的圖示進入劃線模式（頂部會出現提示橫幅），再嘗試長按選字（這次畫面任何位置都可以，不限中間窄帶），確認是否出現反白/選取控點；不管有沒有選到，都請把這次的 `[reader-web debug]`／`[reader]` log 貼給我。

**第二十輪：iOS 模擬器選字/建立註記已成功，但畫面上完全看不到底線標記（2026-07-05，使用者截圖回報）**：
- 好消息：使用者這輪截圖證實「劃線模式」按鈕跟長按選字都正常運作——選取文字、挑色、存成註記、出現在清單、點清單項目正確跳轉，這幾步（上一輪懷疑的選字手勢問題）**都已解決**。
- 新問題：跳轉到某筆註記所在的段落後，畫面上完全看不到對應顏色的底線標記，即使文字內容跟清單裡的註記完全吻合。
- **判斷（尚未證實，找到一個已知、合理的候選機制）**：epub.js 的 `Annotations` 類別是掛在 `rendition.hooks.render` 自動把已存在的標記重新掛到每個新渲染的頁面/章節（`node_modules/epubjs/src/annotations.js` 建構子），但 `hooks.render` 觸發的時間點有時候會比這一頁 iframe 的內容/尺寸真正準備好還早，導致標記用來畫線的 `marks-pane` SVG 函式庫算出來的位置/尺寸基準還沒就緒，呼叫本身不會拋例外，但畫面上什麼都畫不出來——這正是網頁版 `Reader.tsx` 的 `addEpubAnnotation` 當初就踩過、也已經修過的同一顆坑（該處註解：「hooks.render 比 contents 就緒早，部分 annotation inject 可能失敗」），mobile 這次第一版漏搬這段保險機制。這個解釋能同時說明「建立當下沒看到、跳轉過去也沠看到」，但**還沒有實機證據能 100% 確認就是這個原因**，也不能排除是 mobile 特有的 iframe 座標問題（第十四輪記錄過 iOS WKWebView 的內容 iframe 內部座標系統跟畫面實際尺寸對不上的先例）。
- **這輪的修法（照抄網頁版保險機制 + 加大量診斷 log，而不是盲猜著改）**：
  - `mobile/reader-web/index.ts` 新增 `verifyAnnotationsRendered()`／`reinjectAllAnnotations()`：`underline()` 呼叫完成後 300ms，檢查 DOM 裡是不是真的生出對應的 `.ann-<id> line` 元素，沒有的話呼叫 `rendition.annotations` 的 `clear(view)`/`inject(view)` 對目前所有 view 強制重新掛一次（跟網頁版 `addEpubAnnotation` 的 300ms 後備援邏輯同一招）。
  - 同一套 verify 也掛進既有的 `rendition.hooks.content.register(...)`（每次新頁面/章節內容渲染完都跑一次，300ms 後檢查目前 `renderedAnnotations` 清單裡的每一筆是不是都找得到對應的 DOM 元素），涵蓋「點清單跳轉到別的章節後，那一頁本來就該有標記卻沒被正確掛上」這個情境，不只是「剛建立當下」這一種情況。
  - 新增 `logMarkGeometry()` 診斷函式：印出標記 SVG 元素本身的量測結果（寬高/座標）、其所在 `<svg>` pane 的量測結果、目前內容 iframe 的 `getBoundingClientRect()` 與 `contentWindow.innerWidth`/`scrollWidth`——這幾個數字能直接判斷是「完全沒有生成標記元素」還是「元素生成了、但因為座標系統跟第十四輪那個已知的 iframe 座標坑一樣算錯了位置變成跑到看不到的地方」，這兩種情況修法完全不同，這次先蒐證不瞎猜。呼叫時機：`underline()` 呼叫完成當下、300ms 後（reinject 判斷前）、如果有觸發 reinject 則再追加一次 reinject 後的量測。
  - 標記線條 `stroke-width` 從 `2` 調成 `3`，順手排除「其實有畫出來，只是線太細在深色模式下不明顯」這個更單純的可能性（不影響前面的診斷邏輯，即使真正根因是別的，這個改動本身也無害）。
- **驗證狀態**：`yarn build:reader`、`tsc --noEmit`、`expo-doctor`（20/20）、`expo export --platform ios` 皆通過，純打包/型別驗證，純 JS 改動不涉及原生模組，不需要重新編譯 Dev Client。**尚未實機/模擬器驗證這次的 verify+reinject 是否真的解決問題**：麻煩重新整理後再測一次「跳轉到某筆註記」，並把這次新增的 `[markGeometry:*]`／`[verifyAnnotationsRendered]`／`[reinjectAllAnnotations]` 這幾行 log 完整貼給我——特別留意 `mark=` 那組數字是 `no-svg`／寬高是 0，還是有正常的寬高但位置座標看起來異常（例如負值或遠超過螢幕尺寸），這能直接判斷是「完全沒生成」還是「生成了但位置算錯」，才能決定下一步往哪個方向修，不要只回報「還是看不到」。

**Why 記錄這段**：mobile/ 的建置細節分散在多次對話中，若不集中記錄，下次對話容易重複「已經做過的初始化」或忘記 epub.js 在 RN 上不能直接用這個關鍵限制。
