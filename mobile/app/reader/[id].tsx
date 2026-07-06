import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { IconBack, IconBookmarkFill, IconBookmarkOutline, IconChapters, IconNotes, IconPause, IconPlay, IconReset, IconSettings, IconSleepTimer } from '../../components/icons';
import ListPanel from '../../components/ListPanel';
import SelectionBar from '../../components/SelectionBar';
import SettingsPanel from '../../components/SettingsPanel';
import {
  type Annotation,
  type BookRecord,
  type BookSettings,
  type Bookmark,
  generateId,
  getBookBase64,
  listBooks,
  loadAnnotations,
  loadBookSettings,
  loadBookmarks,
  loadReadingCfi,
  saveAnnotations,
  saveBookSettings,
  saveBookmarks,
  saveReadingCfi,
  touchBook,
  updateProgress,
} from '../../lib/library';
import { READER_HTML } from '../../lib/readerHtml.generated';
import type { OutboundMessage, TocItem } from '../../lib/readerMessages';
import { DEFAULT_TYPOGRAPHY } from '../../lib/readerSettings';
import { useTheme } from '../../lib/theme';
import { useTTS } from '../../lib/tts';
import { useFocusEffect } from 'expo-router';

const ReaderScreen = () => {
  const { darkMode, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const webviewRef = useRef<WebView>(null);
  const webviewReadyRef = useRef(false);
  const [record, setRecord] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [typography, setTypography] = useState<BookSettings>(DEFAULT_TYPOGRAPHY);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<{ cfi: string; text: string } | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentCfi, setCurrentCfi] = useState('');
  const [currentHref, setCurrentHref] = useState('');
  const [currentChapterTitle, setCurrentChapterTitle] = useState('');
  const [pageInfo, setPageInfo] = useState<{ page: number; total: number; percentage: number } | null>(null);
  const [listPanelTab, setListPanelTab] = useState<'bookmarks' | 'chapters' | 'bookinfo' | 'notes' | null>(null);
  const settingsLoadedRef = useRef(false);
  const hadSavedSettingsRef = useRef(false);
  const chapterTextResolverRef = useRef<((result: { text: string; startOffset: number }) => void) | null>(null);
  const chapterTextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relocatedResolverRef = useRef<(() => void) | null>(null);
  // 供 advanceToNextChapter 判斷「是否已經跨到新章節」／「是否已到書尾」，用 ref 而非
  // state 是因為要在同一個非同步迴圈裡讀到最新值，不能等 re-render 後的閉包。
  const currentHrefRef = useRef('');
  const atEndRef = useRef(false);
  const tts = useTTS();

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      touchBook(id);
    }, [id])
  );

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
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id || !settingsLoadedRef.current) return;
    saveBookSettings(id, typography);
  }, [id, typography]);

  useEffect(() => {
    tts.reset();
    webviewRef.current?.postMessage(JSON.stringify({ type: 'ttsStop' }));
    setToc([]);
    setCurrentCfi('');
    setCurrentHref('');
    currentHrefRef.current = '';
    atEndRef.current = false;
    setCurrentChapterTitle('');
    setPageInfo(null);
    setListPanelTab(null);
    setAnnotations([]);
    setSelection(null);
    setEditingAnnotationId(null);
    setAnnotationMode(false);
    webviewRef.current?.postMessage(JSON.stringify({ type: 'clearSelection' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadBookmarks(id).then((saved) => {
      if (!cancelled) setBookmarks(saved);
    });
    return () => { cancelled = true; };
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
      webviewRef.current?.postMessage(
        JSON.stringify({
          type: 'load',
          base64,
          cfi,
          annotations: savedAnnotations.map((a) => ({ id: a.id, cfi: a.cfi, color: a.color })),
        })
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [id]);

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
        webviewRef.current?.postMessage(JSON.stringify({ type: 'setDarkMode', darkMode }));
        // settingsLoadedRef 還沒完成前先不送 setTypography，避免蓋成預設值；等
        // loadBookSettings 完成後，下面監聽 typography 變化的 effect 會補送一次真正的設定。
        if (settingsLoadedRef.current) {
          webviewRef.current?.postMessage(JSON.stringify({ type: 'setTypography', ...typography }));
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
        console.log('[reader] selectionCleared 收到');
        setSelection(null);
        return;
      }
      if (msg.type === 'annotationTapped') {
        console.log('[reader] annotationTapped 收到', msg.id);
        setSelection(null);
        setEditingAnnotationId(msg.id);
        return;
      }
      if (msg.type === 'debug') {
        console.log('[reader-web debug]', msg.message);
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
    [handleWebViewReady, id, darkMode, typography]
  );

  // 深色模式切換時（例如使用者從設定頁切回閱讀頁），即時通知 WebView 內的 epub 內容套用新樣式，
  // 不必等下一次換頁；WebView 尚未回報 ready 前先略過，ready 當下會用最新的 darkMode 補送一次。
  useEffect(() => {
    if (!webviewReadyRef.current) return;
    webviewRef.current?.postMessage(JSON.stringify({ type: 'setDarkMode', darkMode }));
  }, [darkMode]);

  // 排版設定變更時即時套用到 WebView 內已渲染的內容，不必等下一次換頁。
  useEffect(() => {
    if (!webviewReadyRef.current) return;
    webviewRef.current?.postMessage(JSON.stringify({ type: 'setTypography', ...typography }));
  }, [typography]);

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
      webviewRef.current?.postMessage(JSON.stringify({ type: 'getChapterText' }));
    });
  }, []);

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

  // 記住「這次 tts.speak() 開始朗讀時，畫面所在的章節 href」，advanceToNextChapter 用這個
  // 當基準比對，而不是每次都重新取 currentHrefRef 的當下值——這個朗讀 session 期間畫面
  // 可能已經被 WebView 端的自動跟讀翻頁（見下方註解）推進到新章節了，用「呼叫當下」的
  // href 當基準會讓下面的迴圈誤判成「還沒跨到新章節」而多翻一次頁。
  const readingHrefRef = useRef('');

  // 朗讀進行中，WebView 端（reader-web/index.ts 的 handleTTSBoundary）會自己在快讀到目前
  // 頁面底部時呼叫 turnPage('next') 把畫面翻到下一頁，不需要 RN 端介入——一個章節在
  // paginated 模式下是同一份 iframe document 用 CSS 分欄呈現好幾頁，翻頁不會觸發新的
  // chapterText，朗讀本身也不會中斷。這裡的 readNextAndContinue 只在「整章文字真的念完」
  // 時才呼叫，負責跨到下一章：多數情況 WebView 端的自動跟讀翻頁早已把畫面翻到這章最後
  // 一頁並跨過章節邊界（下面迴圈第一次檢查就會發現 href 已經變了，直接返回，不重複翻頁）；
  // 只有在自動跟讀翻頁還沒來得及跟上（節流／提前量測誤差造成的些微落後）時才需要额外
  // 呼叫 next() 補上，避免漏翻的頁面被跳過、也避免因為還停在同一章就重新抓到「同一份」
  // 章節文字，變成整章從頭重念一次的無窮迴圈。
  const advanceToNextChapter = useCallback(async (): Promise<boolean> => {
    const startHref = readingHrefRef.current;
    for (let i = 0; i < 50; i++) {
      if (currentHrefRef.current !== startHref) return true;
      if (atEndRef.current) return false;
      webviewRef.current?.postMessage(JSON.stringify({ type: 'next' }));
      await waitForRelocated();
    }
    return currentHrefRef.current !== startHref;
  }, [waitForRelocated]);

  const continueReadingRef = useRef<() => void>(() => {});
  const readNextAndContinue = useCallback(async () => {
    const advanced = await advanceToNextChapter();
    if (!advanced) return;
    const { text, startOffset } = await requestChapterText();
    if (!text.trim()) return;
    readingHrefRef.current = currentHrefRef.current;
    webviewRef.current?.postMessage(JSON.stringify({ type: 'ttsStart' }));
    tts.speak(
      text,
      () => continueReadingRef.current(),
      (charIndex) =>
        webviewRef.current?.postMessage(JSON.stringify({ type: 'ttsBoundary', charIndex: charIndex + startOffset }))
    );
  }, [advanceToNextChapter, requestChapterText, tts]);
  useEffect(() => { continueReadingRef.current = readNextAndContinue; }, [readNextAndContinue]);

  const handleTTSPlay = useCallback(async () => {
    if (tts.paused) {
      tts.resume();
      webviewRef.current?.postMessage(JSON.stringify({ type: 'ttsStart' }));
      return;
    }
    const { text, startOffset } = await requestChapterText();
    if (!text.trim()) return;
    readingHrefRef.current = currentHrefRef.current;
    webviewRef.current?.postMessage(JSON.stringify({ type: 'ttsStart' }));
    tts.speak(
      text,
      () => continueReadingRef.current(),
      (charIndex) =>
        webviewRef.current?.postMessage(JSON.stringify({ type: 'ttsBoundary', charIndex: charIndex + startOffset }))
    );
  }, [tts, requestChapterText]);

  const handleTTSPause = useCallback(() => {
    tts.pause();
    webviewRef.current?.postMessage(JSON.stringify({ type: 'ttsStop' }));
  }, [tts]);

  const handleTTSReset = useCallback(() => {
    tts.reset();
    webviewRef.current?.postMessage(JSON.stringify({ type: 'ttsStop' }));
  }, [tts]);

  // 朗讀控制列上的睡眠計時是快速切換用途（跟設定面板裡完整的分段選單共用同一份
  // tts.sleepMinutes／onSleepChange 狀態，不是獨立的第二套計時），每點一次照固定選項
  // 循環切換，不需要另外彈出選單。
  const SLEEP_CYCLE_OPTIONS = [0, 15, 30, 45, 60] as const;
  const handleCycleSleep = useCallback(() => {
    const idx = SLEEP_CYCLE_OPTIONS.indexOf(tts.sleepMinutes as (typeof SLEEP_CYCLE_OPTIONS)[number]);
    const next = SLEEP_CYCLE_OPTIONS[(idx + 1) % SLEEP_CYCLE_OPTIONS.length];
    tts.onSleepChange(next);
  }, [tts]);

  const handleShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
    const { url } = request;
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return true;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      Linking.openURL(url);
      return false;
    }
    return true;
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleResetTypography = () => {
    setTypography((prev) => ({ ...prev, fontSize: 16, lineHeight: 1.8, letterSpacing: 0 }));
  };

  const isBookmarked = bookmarks.some((b) => b.cfi === currentCfi);

  const handleToggleBookmark = () => {
    if (!id || !currentCfi) return;
    setBookmarks((prev) => {
      const next = prev.some((b) => b.cfi === currentCfi)
        ? prev.filter((b) => b.cfi !== currentCfi)
        : [...prev, { id: generateId(), cfi: currentCfi, label: currentChapterTitle || '書籤', addedAt: Date.now() }];
      saveBookmarks(id, next);
      return next;
    });
  };

  const handleDeleteBookmark = (bookmarkId: string) => {
    if (!id) return;
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.id !== bookmarkId);
      saveBookmarks(id, next);
      return next;
    });
  };

  const handleNavigateToTarget = (target: string) => {
    webviewRef.current?.postMessage(JSON.stringify({ type: 'goto', target }));
    setListPanelTab(null);
  };

  // WebView 端只負責「畫出目前這份清單長什麼樣子」，annotations 陣列本身以 RN 端／
  // AsyncStorage 為唯一資料來源；每次新增/改色/刪除都整批送一次目前完整清單，
  // 讓 reader-web 的 applyAnnotations() 自己比對差異決定要新增/移除哪些標記。
  const syncAnnotationsToWebView = (next: Annotation[]) => {
    console.log('[reader] syncAnnotationsToWebView 送出', next.length, '筆');
    webviewRef.current?.postMessage(
      JSON.stringify({ type: 'setAnnotations', annotations: next.map((a) => ({ id: a.id, cfi: a.cfi, color: a.color })) })
    );
  };

  const handleCreateAnnotation = (color: string) => {
    if (!id || !selection) {
      console.log('[reader] handleCreateAnnotation 略過：id 或 selection 為空', { hasId: Boolean(id), hasSelection: Boolean(selection) });
      return;
    }
    if (__DEV__) console.log('[reader] handleCreateAnnotation', color, selection.text.slice(0, 20));
    const ann: Annotation = {
      id: generateId(),
      cfi: selection.cfi,
      text: selection.text,
      color,
      chapter: currentChapterTitle,
      createdAt: Date.now(),
    };
    const next = [...annotations, ann];
    setAnnotations(next);
    saveAnnotations(id, next).catch((err) => console.error('[reader] saveAnnotations 失敗', err));
    syncAnnotationsToWebView(next);
    setSelection(null);
    webviewRef.current?.postMessage(JSON.stringify({ type: 'clearSelection' }));
  };

  const handleChangeAnnotationColor = (annotationId: string, color: string) => {
    if (!id) return;
    const next = annotations.map((a) => (a.id === annotationId ? { ...a, color } : a));
    setAnnotations(next);
    saveAnnotations(id, next).catch((err) => console.error('[reader] saveAnnotations 失敗', err));
    syncAnnotationsToWebView(next);
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    if (!id) return;
    const next = annotations.filter((a) => a.id !== annotationId);
    setAnnotations(next);
    saveAnnotations(id, next).catch((err) => console.error('[reader] saveAnnotations 失敗', err));
    syncAnnotationsToWebView(next);
    setEditingAnnotationId(null);
  };

  const handleUpdateAnnotationNote = (annotationId: string, note: string) => {
    if (!id) return;
    const next = annotations.map((a) => (a.id === annotationId ? { ...a, note: note.trim() || undefined } : a));
    setAnnotations(next);
    saveAnnotations(id, next).catch((err) => console.error('[reader] saveAnnotations 失敗', err));
  };

  const handleNavigateToAnnotation = (cfi: string) => {
    webviewRef.current?.postMessage(JSON.stringify({ type: 'goto', target: cfi }));
    setListPanelTab(null);
  };

  const handleCopySelection = () => {
    if (!selection) return;
    Clipboard.setStringAsync(selection.text);
  };

  const handleSearchSelection = () => {
    if (!selection) return;
    Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(selection.text)}`);
  };

  // 清掉 RN 端的選取狀態同時，也要通知 WebView 清掉內容 iframe 裡實際的原生選取範圍
  // （瀏覽器藍色反白），否則只清 RN state 只會讓底部操作列消失，畫面上的選取反白仍留著。
  const clearSelectionState = () => {
    setSelection(null);
    setEditingAnnotationId(null);
    webviewRef.current?.postMessage(JSON.stringify({ type: 'clearSelection' }));
  };

  // 設定面板／清單面板共用同一個畫面區域，一次只會顯示其中一個：開啟其中一個時
  // 要順便關掉另一個，否則兩個 overlay 疊在一起，關掉上層那個又會露出底下還開著的另一個。
  // 兩顆按鈕都是開關型：再按一次目前開著的那顆就直接關閉，不需要額外的關閉鈕/麵包屑列。
  const toggleSettings = () => {
    setListPanelTab(null);
    clearSelectionState();
    setSettingsVisible((prev) => !prev);
  };

  const toggleListPanel = () => {
    setSettingsVisible(false);
    clearSelectionState();
    setListPanelTab((prev) => (prev ? null : 'bookmarks'));
  };

  // 劃線模式：使用者實測回報「畫面中間三分之一窄帶長按選字沒有反應」，log 顯示觸控確實有
  // 送到內容 iframe，但長按手勢常常在按住/微調時位移滑出那條窄帶、掃進左右兩側的翻頁點擊區
  // 而被中斷。開啟這個模式時通知 WebView 把左右兩側的翻頁點擊區關掉 pointer-events，讓整個
  // 畫面寬度都能長按選字（代價是這段期間點擊畫面兩側不會翻頁，需使用者自己切回一般模式）。
  const toggleAnnotationMode = () => {
    setSettingsVisible(false);
    setListPanelTab(null);
    clearSelectionState();
    setAnnotationMode((prev) => {
      const next = !prev;
      webviewRef.current?.postMessage(JSON.stringify({ type: 'setAnnotationMode', enabled: next }));
      return next;
    });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.paperBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12 }}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="返回書櫃"
        >
          <IconBack color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, color: colors.ink }} numberOfLines={1}>
          {record?.title ?? '閱讀中'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Pressable
            onPress={handleToggleBookmark}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isBookmarked ? '移除書籤' : '加入書籤'}
          >
            {isBookmarked ? <IconBookmarkFill color={colors.progressFill} /> : <IconBookmarkOutline color={colors.ink} />}
          </Pressable>
          <Pressable
            onPress={toggleAnnotationMode}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={annotationMode ? '結束劃線模式' : '進入劃線模式'}
            accessibilityState={{ selected: annotationMode }}
            style={{
              width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: annotationMode ? colors.paperBg2 : 'transparent',
            }}
          >
            <IconNotes color={annotationMode ? colors.progressFill : colors.ink} />
          </Pressable>
          <Pressable
            onPress={toggleListPanel}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="書籤／目錄／資訊"
            accessibilityState={{ selected: listPanelTab !== null }}
            style={{
              width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: listPanelTab !== null ? colors.paperBg2 : 'transparent',
            }}
          >
            <IconChapters color={listPanelTab !== null ? colors.progressFill : colors.ink} />
          </Pressable>
          <Pressable
            onPress={toggleSettings}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="排版與語音設定"
            accessibilityState={{ selected: settingsVisible }}
            style={{
              width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: settingsVisible ? colors.paperBg2 : 'transparent',
            }}
          >
            <IconSettings color={settingsVisible ? colors.progressFill : colors.ink} />
          </Pressable>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <WebView
          ref={webviewRef}
          originWhitelist={['*']}
          source={{ html: READER_HTML }}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          javaScriptEnabled
          webviewDebuggingEnabled={__DEV__}
          bounces={false}
          overScrollMode="never"
          style={{ flex: 1, opacity: loading ? 0 : 1 }}
        />
        {annotationMode && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              paddingVertical: 6, alignItems: 'center', backgroundColor: colors.progressFill,
            }}
          >
            <Text style={{ fontSize: 11, color: '#fff' }}>劃線模式中：長按文字選取即可標記，點擊畫面翻頁已暫停</Text>
          </View>
        )}
        {loading && !errorMessage ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" />
          </View>
        ) : null}
        {errorMessage ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ textAlign: 'center' }}>載入失敗：{errorMessage}</Text>
          </View>
        ) : null}
        {settingsVisible && (
          <SettingsPanel
            fontSize={typography.fontSize}
            onFontSizeChange={(v) => setTypography((prev) => ({ ...prev, fontSize: v }))}
            fontFamily={typography.fontFamily}
            onFontFamilyChange={(v) => setTypography((prev) => ({ ...prev, fontFamily: v }))}
            script={typography.script}
            onScriptChange={(v) => setTypography((prev) => ({ ...prev, script: v }))}
            readingDirection={typography.readingDirection}
            onReadingDirectionChange={(v) => setTypography((prev) => ({ ...prev, readingDirection: v }))}
            lineHeight={typography.lineHeight}
            onLineHeightChange={(v) => setTypography((prev) => ({ ...prev, lineHeight: v }))}
            letterSpacing={typography.letterSpacing}
            onLetterSpacingChange={(v) => setTypography((prev) => ({ ...prev, letterSpacing: v }))}
            onReset={handleResetTypography}
            ttsPlaying={tts.playing}
            ttsPaused={tts.paused}
            onTTSPlay={handleTTSPlay}
            onTTSPause={handleTTSPause}
            onTTSReset={handleTTSReset}
            ttsVoices={tts.voices}
            ttsSelectedVoice={tts.selectedVoice}
            onTTSVoiceChange={tts.setSelectedVoice}
            ttsRate={tts.rate}
            onTTSRateChange={tts.setRate}
            ttsSleepMinutes={tts.sleepMinutes}
            onTTSSleepChange={tts.onSleepChange}
            ttsSleepRemaining={tts.sleepRemaining}
          />
        )}
        {listPanelTab && (
          <ListPanel
            initialTab={listPanelTab}
            bookmarks={bookmarks}
            onNavigateBookmark={(bm) => handleNavigateToTarget(bm.cfi)}
            onDeleteBookmark={handleDeleteBookmark}
            toc={toc}
            currentHref={currentHref}
            onNavigateChapter={handleNavigateToTarget}
            record={record}
            annotations={annotations}
            onNavigateAnnotation={handleNavigateToAnnotation}
            onChangeAnnotationColor={handleChangeAnnotationColor}
            onDeleteAnnotation={handleDeleteAnnotation}
            onUpdateAnnotationNote={handleUpdateAnnotationNote}
          />
        )}
        {selection && (
          <SelectionBar
            mode="selection"
            text={selection.text}
            onHighlight={handleCreateAnnotation}
            onCopy={handleCopySelection}
            onSearch={handleSearchSelection}
          />
        )}
        {editingAnnotationId && (
          <SelectionBar
            mode="edit"
            onChangeColor={(color) => handleChangeAnnotationColor(editingAnnotationId, color)}
            onDelete={() => handleDeleteAnnotation(editingAnnotationId)}
          />
        )}
        {/* 朗讀控制列：跟下面的頁碼列一樣固定高度、一律渲染（不論是否正在朗讀），放在內容
            與底部頁碼列之間，屬於一般排版流（不是蓋在 WebView 上的 overlay），才不會遮到
            正在閱讀的文字；也因為高度固定不隨播放狀態變動，不會觸發 WebView resize 讓
            epub.js 重新分頁（見下面頁碼列註解，同一個理由）。 */}
        <View
          style={{
            height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20,
            borderTopWidth: 1, borderTopColor: colors.borderColor,
          }}
        >
          <Pressable
            onPress={handleTTSReset}
            disabled={!tts.playing && !tts.paused}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="重置朗讀進度"
            style={{
              width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.paperBg2, borderWidth: 1, borderColor: colors.borderColor,
              opacity: (!tts.playing && !tts.paused) ? 0.4 : 1,
            }}
          >
            <IconReset color={colors.ink2} />
          </Pressable>
          <Pressable
            onPress={tts.playing ? handleTTSPause : handleTTSPlay}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tts.playing ? '暫停朗讀' : '開始朗讀'}
            style={{
              width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: tts.playing ? colors.progressFill : colors.ink,
            }}
          >
            {tts.playing ? <IconPause color={colors.paperBg} /> : <IconPlay color={colors.paperBg} />}
          </Pressable>
          <View style={{ width: 34, alignItems: 'center' }}>
            <Pressable
              onPress={handleCycleSleep}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                tts.sleepMinutes === 0
                  ? '設定睡眠計時'
                  : tts.sleepRemaining !== null
                    ? `睡眠計時倒數 ${Math.floor(tts.sleepRemaining / 60)}分${tts.sleepRemaining % 60}秒`
                    : `睡眠計時 ${tts.sleepMinutes} 分鐘`
              }
              style={{
                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                backgroundColor: tts.sleepMinutes > 0 ? colors.paperBg2 : 'transparent',
                borderWidth: 1, borderColor: colors.borderColor,
              }}
            >
              <IconSleepTimer color={tts.sleepMinutes > 0 ? colors.progressFill : colors.ink2} />
            </Pressable>
            {tts.sleepMinutes > 0 && (
              <Text style={{ fontSize: 9, color: colors.ink3, marginTop: 2 }}>
                {tts.sleepRemaining !== null
                  ? `${String(Math.floor(tts.sleepRemaining / 60)).padStart(2, '0')}:${String(tts.sleepRemaining % 60).padStart(2, '0')}`
                  : `${tts.sleepMinutes}分`}
              </Text>
            )}
          </View>
        </View>
        {/* 固定高度、一律渲染（即使 pageInfo 還是 null 也只是內容留白）：避免 pageInfo 從
            null 變有值時這塊區域才冒出來，導致 WebView 版面高度跟著變動——epub.js 的分頁是
            依照初次拿到的 viewer 尺寸算的，事後才緊縮 WebView 高度容易讓已渲染好的那一頁內容
            被裁切，需要等 resize 事件跑完才會重新分頁，中間會有一段畫面被蓋住的空窗期。 */}
        <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
          {pageInfo && (() => {
            // 跟書櫃卡片顯示的進度（來自 updateProgress 存進 library 的 msg.percentage）用同一個
            // 數值來源，避免「頁碼算出來的 page/total 比例」跟「實際存檔的精確進度」四捨五入後
            // 出現 1% 之類的落差，導致書櫃跟閱讀頁看起來不一致。
            const pct = Math.round(pageInfo.percentage * 100);
            return (
              <>
                <Text style={{ fontSize: 10, color: colors.ink3, letterSpacing: 0.5 }}>
                  第 {pageInfo.page} 頁
                </Text>
                <View style={{ flex: 1, height: 3, backgroundColor: colors.progressTrack, borderRadius: 2 }}>
                  <View
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: colors.progressFill,
                      borderRadius: 2,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 10, color: colors.ink3, letterSpacing: 0.5 }}>
                  / {pageInfo.total} · {pct}%
                </Text>
              </>
            );
          })()}
        </View>
      </View>
    </SafeAreaView>
  );
};

export default ReaderScreen;
