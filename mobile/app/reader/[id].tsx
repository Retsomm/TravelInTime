import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { IconBack, IconBookmarkFill, IconBookmarkOutline, IconChapters, IconSettings } from '../../components/icons';
import ListPanel from '../../components/ListPanel';
import SettingsPanel from '../../components/SettingsPanel';
import {
  type BookRecord,
  type BookSettings,
  type Bookmark,
  generateId,
  getBookBase64,
  listBooks,
  loadBookSettings,
  loadBookmarks,
  loadReadingCfi,
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
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentCfi, setCurrentCfi] = useState('');
  const [currentHref, setCurrentHref] = useState('');
  const [currentChapterTitle, setCurrentChapterTitle] = useState('');
  const [pageInfo, setPageInfo] = useState<{ page: number; total: number; percentage: number } | null>(null);
  const [listPanelTab, setListPanelTab] = useState<'bookmarks' | 'chapters' | 'bookinfo' | 'notes' | null>(null);
  const settingsLoadedRef = useRef(false);
  const hadSavedSettingsRef = useRef(false);
  const chapterTextResolverRef = useRef<((text: string) => void) | null>(null);
  const chapterTextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relocatedResolverRef = useRef<(() => void) | null>(null);
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
    setToc([]);
    setCurrentCfi('');
    setCurrentHref('');
    setCurrentChapterTitle('');
    setPageInfo(null);
    setListPanelTab(null);
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
      const [base64, cfi] = await Promise.all([getBookBase64(found), loadReadingCfi(id)]);
      webviewRef.current?.postMessage(JSON.stringify({ type: 'load', base64, cfi }));
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
        chapterTextResolverRef.current?.(msg.text);
        chapterTextResolverRef.current = null;
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
  const requestChapterText = useCallback((): Promise<string> => {
    if (chapterTextResolverRef.current) return Promise.resolve('');
    return new Promise((resolve) => {
      chapterTextResolverRef.current = resolve;
      chapterTextTimeoutRef.current = setTimeout(() => {
        chapterTextResolverRef.current = null;
        chapterTextTimeoutRef.current = null;
        resolve('');
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

  // 朗讀完目前章節後，翻到下一頁／章節再繼續朗讀；已翻到書尾（抓不到文字）就自然停止。
  // 這是簡化版的自動接續章節，沒有網頁版 useTTS.ts 那套精確字元位移與高亮同步（見
  // RN_SETUP_GUIDE.md 第十二輪紀錄），只保證朗讀完一頁會自動接著念下一頁。
  const continueReadingRef = useRef<() => void>(() => {});
  const readNextAndContinue = useCallback(async () => {
    webviewRef.current?.postMessage(JSON.stringify({ type: 'next' }));
    await waitForRelocated();
    const text = await requestChapterText();
    if (!text.trim()) return;
    tts.speak(text, () => continueReadingRef.current());
  }, [requestChapterText, tts, waitForRelocated]);
  useEffect(() => { continueReadingRef.current = readNextAndContinue; }, [readNextAndContinue]);

  const handleTTSPlay = useCallback(async () => {
    if (tts.paused) {
      tts.resume();
      return;
    }
    const text = await requestChapterText();
    if (!text.trim()) return;
    tts.speak(text, () => continueReadingRef.current());
  }, [tts, requestChapterText]);

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

  // 設定面板／清單面板共用同一個畫面區域，一次只會顯示其中一個：開啟其中一個時
  // 要順便關掉另一個，否則兩個 overlay 疊在一起，關掉上層那個又會露出底下還開著的另一個。
  // 兩顆按鈕都是開關型：再按一次目前開著的那顆就直接關閉，不需要額外的關閉鈕/麵包屑列。
  const toggleSettings = () => {
    setListPanelTab(null);
    setSettingsVisible((prev) => !prev);
  };

  const toggleListPanel = () => {
    setSettingsVisible(false);
    setListPanelTab((prev) => (prev ? null : 'bookmarks'));
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
            onTTSPause={tts.pause}
            onTTSReset={tts.reset}
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
          />
        )}
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
