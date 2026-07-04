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
7. **註記筆記功能**：搬移「感想筆記」邏輯（見 `408b1eb` commit），儲存方式同第 2 點的本地儲存策略。
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

**Why 記錄這段**：mobile/ 的建置細節分散在多次對話中，若不集中記錄，下次對話容易重複「已經做過的初始化」或忘記 epub.js 在 RN 上不能直接用這個關鍵限制。
