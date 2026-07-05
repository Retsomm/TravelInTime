import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import SettingsPanel from '../../components/SettingsPanel';
import {
  type BookRecord,
  type BookSettings,
  getBookBase64,
  listBooks,
  loadBookSettings,
  loadReadingCfi,
  saveBookSettings,
  saveReadingCfi,
  touchBook,
  updateProgress,
} from '../../lib/library';
import { READER_HTML } from '../../lib/readerHtml.generated';
import type { OutboundMessage } from '../../lib/readerMessages';
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
        relocatedResolverRef.current?.();
        relocatedResolverRef.current = null;
        if (!id) return;
        saveReadingCfi(id, msg.cfi);
        updateProgress(id, msg.percentage);
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
        return;
      }
      if (msg.type === 'debug') {
        console.log(`[reader-web debug][${Platform.OS}]`, msg.message);
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.paperBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12 }}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="返回書櫃"
        >
          <Text style={{ fontSize: 24, color: colors.ink }}>‹</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, marginRight: 24, color: colors.ink }} numberOfLines={1}>
          {record?.title ?? '閱讀中'}
        </Text>
        <Pressable
          onPress={() => setSettingsVisible(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="排版與語音設定"
        >
          <Text style={{ fontSize: 18, color: colors.ink }}>⚙</Text>
        </Pressable>
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
            onClose={() => setSettingsVisible(false)}
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
      </View>
    </SafeAreaView>
  );
};

export default ReaderScreen;
