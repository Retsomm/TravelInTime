import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebView } from 'react-native-webview';
import {
  type Annotation,
  type BookRecord,
  type BookSettings,
  getBookBase64,
  listBooks,
  loadAnnotations,
  loadBookSettings,
  loadReadingCfi,
  saveBookSettings,
  saveReadingCfi,
  touchBook,
  updateProgress,
} from '../../lib/library';
import type { InboundMessage, OutboundMessage, TocItem } from '../../lib/readerMessages';
import { DEFAULT_TYPOGRAPHY } from '../../lib/readerSettings';

interface UseReaderEngineOptions {
  onBookChange?: () => void;
}

// 統籌 RN 端與 WebView 端（reader-web/index.ts）之間的訊息橋接：book 生命週期、排版設定
// 載入/存檔、換頁/跳轉衍生的 relocated 狀態（cfi/href/章節標題/頁碼）、目錄，以及選字/
// 標記點擊事件。書籤與朗讀跟讀邏輯各自獨立在 useBookmarks／useTTSReading，但都需要透過
// 這裡的 postToWebView／currentHrefRef 等介面跟 WebView 互動。
export const useReaderEngine = (id: string | undefined, darkMode: boolean, options: UseReaderEngineOptions = {}) => {
  const webviewRef = useRef<WebView>(null);
  const webviewReadyRef = useRef(false);
  const [record, setRecord] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [typography, setTypography] = useState<BookSettings>(DEFAULT_TYPOGRAPHY);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<{ cfi: string; text: string } | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentCfi, setCurrentCfi] = useState('');
  const [currentHref, setCurrentHref] = useState('');
  const [currentChapterTitle, setCurrentChapterTitle] = useState('');
  const [pageInfo, setPageInfo] = useState<{ page: number; total: number; percentage: number } | null>(null);
  const settingsLoadedRef = useRef(false);
  const hadSavedSettingsRef = useRef(false);
  const chapterTextResolverRef = useRef<((result: { text: string; startOffset: number }) => void) | null>(null);
  const chapterTextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relocatedResolverRef = useRef<(() => void) | null>(null);
  // 供 advanceToNextChapter 判斷「是否已經跨到新章節」／「是否已到書尾」，用 ref 而非
  // state 是因為要在同一個非同步迴圈裡讀到最新值，不能等 re-render 後的閉包。
  const currentHrefRef = useRef('');
  const atEndRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      touchBook(id);
    }, [id])
  );

  const postToWebView = useCallback((msg: InboundMessage) => {
    webviewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  // 載入這本書上次儲存的排版設定；settingsLoadedRef 避免載入完成前的初始 state 被下面的
  // 自動存檔 effect 誤存成預設值蓋掉使用者原本存好的設定。
  useEffect(() => {
    if (!id) return;
    settingsLoadedRef.current = false;
    hadSavedSettingsRef.current = false;
    let cancelled = false;
    loadBookSettings(id).then((saved) => {
      if (cancelled) return;
      if (saved) {
        setTypography(saved);
        hadSavedSettingsRef.current = true;
      } else {
        setTypography(DEFAULT_TYPOGRAPHY);
      }
      settingsLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !settingsLoadedRef.current) return;
    saveBookSettings(id, typography);
  }, [id, typography]);

  useEffect(() => {
    postToWebView({ type: 'ttsStop' });
    setToc([]);
    setCurrentCfi('');
    setCurrentHref('');
    currentHrefRef.current = '';
    atEndRef.current = false;
    setCurrentChapterTitle('');
    setPageInfo(null);
    setAnnotations([]);
    setSelection(null);
    setEditingAnnotationId(null);
    postToWebView({ type: 'clearSelection' });
    options.onBookChange?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleWebViewReady = useCallback(async () => {
    if (!id) return;
    const books = await listBooks();
    const found = books.find((b) => b.id === id) ?? null;
    setRecord(found);
    if (!found) {
      setErrorMessage('找不到這本書');
      setLoading(false);
      return;
    }
    try {
      const [base64, cfi, savedAnnotations] = await Promise.all([
        getBookBase64(found),
        loadReadingCfi(id),
        loadAnnotations(id),
      ]);
      setAnnotations(savedAnnotations);
      postToWebView({
        type: 'load',
        base64,
        cfi,
        annotations: savedAnnotations.map((a) => ({ id: a.id, cfi: a.cfi, color: a.color })),
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [id, postToWebView]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      let msg: OutboundMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        webviewReadyRef.current = true;
        postToWebView({ type: 'setDarkMode', darkMode });
        // settingsLoadedRef 還沒完成前先不送 setTypography，避免蓋成預設值；等
        // loadBookSettings 完成後，下面監聽 typography 變化的 effect 會補送一次真正的設定。
        if (settingsLoadedRef.current) {
          postToWebView({ type: 'setTypography', ...typography });
        }
        handleWebViewReady();
        return;
      }
      if (msg.type === 'relocated') {
        setLoading(false);
        setCurrentCfi(msg.cfi);
        setCurrentHref(msg.href);
        currentHrefRef.current = msg.href;
        atEndRef.current = msg.atEnd;
        setCurrentChapterTitle(msg.chapterTitle);
        setPageInfo(msg.page !== null && msg.total !== null ? { page: msg.page, total: msg.total, percentage: msg.percentage } : null);
        relocatedResolverRef.current?.();
        relocatedResolverRef.current = null;
        if (!id) return;
        saveReadingCfi(id, msg.cfi);
        updateProgress(id, msg.percentage);
        return;
      }
      if (msg.type === 'tocLoaded') {
        setToc(msg.toc);
        return;
      }
      if (msg.type === 'error') {
        setErrorMessage(msg.message);
        setLoading(false);
        return;
      }
      if (msg.type === 'chapterText') {
        if (chapterTextTimeoutRef.current) {
          clearTimeout(chapterTextTimeoutRef.current);
          chapterTextTimeoutRef.current = null;
        }
        chapterTextResolverRef.current?.({ text: msg.text, startOffset: msg.startOffset });
        chapterTextResolverRef.current = null;
        return;
      }
      if (msg.type === 'textSelected') {
        if (__DEV__) console.log('[reader] textSelected 收到', msg.text.slice(0, 20));
        setEditingAnnotationId(null);
        setSelection({ cfi: msg.cfi, text: msg.text });
        return;
      }
      if (msg.type === 'selectionCleared') {
        if (__DEV__) console.log('[reader] selectionCleared 收到');
        setSelection(null);
        return;
      }
      if (msg.type === 'annotationTapped') {
        if (__DEV__) console.log('[reader] annotationTapped 收到', msg.id);
        setSelection(null);
        setEditingAnnotationId(msg.id);
        return;
      }
      if (msg.type === 'debug') {
        if (__DEV__) console.log('[reader-web debug]', msg.message);
        return;
      }
      if (msg.type === 'bookLanguageDetected') {
        // 比照網頁版 Reader.tsx：baseScript 永遠反映書本原始語言；只有在使用者這本書
        // 從沒存過排版偏好時，才自動把顯示腳本切成跟書本原始語言一致（例如簡體書預設
        // 顯示簡體，而不是被 mobile 端寫死的預設值 'tc' 誤判成要轉換成繁體）。
        if (!hadSavedSettingsRef.current) {
          setTypography((prev) => ({ ...prev, script: msg.baseScript }));
        }
      }
    },
    [handleWebViewReady, id, darkMode, typography, postToWebView]
  );

  // 深色模式切換時（例如使用者從設定頁切回閱讀頁），即時通知 WebView 內的 epub 內容套用新樣式，
  // 不必等下一次換頁；WebView 尚未回報 ready 前先略過，ready 當下會用最新的 darkMode 補送一次。
  useEffect(() => {
    if (!webviewReadyRef.current) return;
    postToWebView({ type: 'setDarkMode', darkMode });
  }, [darkMode, postToWebView]);

  // 排版設定變更時即時套用到 WebView 內已渲染的內容，不必等下一次換頁。
  useEffect(() => {
    if (!webviewReadyRef.current) return;
    postToWebView({ type: 'setTypography', ...typography });
  }, [typography, postToWebView]);

  // 若已有一個 getChapterText 請求在飛行中，新請求直接回空字串，避免蓋掉前一個
  // resolver 導致前一個呼叫永遠 resolve 不到正確結果；並用逾時保護 WebView 沒回應時
  // 呼叫端不會卡死。
  const requestChapterText = useCallback((): Promise<{ text: string; startOffset: number }> => {
    if (chapterTextResolverRef.current) return Promise.resolve({ text: '', startOffset: 0 });
    return new Promise((resolve) => {
      chapterTextResolverRef.current = resolve;
      chapterTextTimeoutRef.current = setTimeout(() => {
        chapterTextResolverRef.current = null;
        chapterTextTimeoutRef.current = null;
        resolve({ text: '', startOffset: 0 });
      }, 5000);
      postToWebView({ type: 'getChapterText' });
    });
  }, [postToWebView]);

  // 等待下一次 relocated 事件（換頁完成）；逾時保護避免 WebView 端因故沒有觸發
  // relocated（例如已在書尾）時卡住整個自動朗讀流程。
  const waitForRelocated = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      relocatedResolverRef.current = resolve;
      setTimeout(() => {
        if (relocatedResolverRef.current === resolve) {
          relocatedResolverRef.current = null;
          resolve();
        }
      }, 1500);
    });
  }, []);

  const navigateTo = useCallback(
    (target: string) => {
      postToWebView({ type: 'goto', target });
    },
    [postToWebView]
  );

  // 清掉 RN 端的選取狀態同時，也要通知 WebView 清掉內容 iframe 裡實際的原生選取範圍
  // （瀏覽器藍色反白），否則只清 RN state 只會讓底部操作列消失，畫面上的選取反白仍留著。
  const clearSelectionState = useCallback(() => {
    setSelection(null);
    setEditingAnnotationId(null);
    postToWebView({ type: 'clearSelection' });
  }, [postToWebView]);

  return {
    webviewRef,
    record,
    loading,
    errorMessage,
    typography,
    setTypography,
    annotations,
    setAnnotations,
    selection,
    setSelection,
    editingAnnotationId,
    setEditingAnnotationId,
    toc,
    currentCfi,
    currentHref,
    currentChapterTitle,
    pageInfo,
    currentHrefRef,
    atEndRef,
    postToWebView,
    handleMessage,
    requestChapterText,
    waitForRelocated,
    navigateTo,
    clearSelectionState,
  };
};
