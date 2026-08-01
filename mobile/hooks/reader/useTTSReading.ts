import { useCallback, useEffect, useRef } from 'react';
import type { InboundMessage } from '../../lib/readerMessages';
import { cycleSleepOption } from '../../lib/reader/calculations';
import { useTTS } from '../../lib/tts';

const SLEEP_CYCLE_OPTIONS = [0, 15, 30, 45, 60] as const;

interface UseTTSReadingParams {
  postToWebView: (msg: InboundMessage) => void;
  currentHrefRef: React.MutableRefObject<string>;
  atEndRef: React.MutableRefObject<boolean>;
  requestChapterText: () => Promise<{ text: string; startOffset: number }>;
  waitForRelocated: () => Promise<void>;
}

// 朗讀跨章節跟讀邏輯：比照網頁版 useReaderEngine.ts 的 TTS 跟讀部分，RN 端負責驅動
// expo-speech 朗讀與跨章節翻頁，WebView 端（reader-web/index.ts 的 handleTTSBoundary）
// 只負責同一章節內快讀到頁尾時自動翻頁與畫底線。
export const useTTSReading = ({ postToWebView, currentHrefRef, atEndRef, requestChapterText, waitForRelocated }: UseTTSReadingParams) => {
  const tts = useTTS();

  // 記住「這次 tts.speak() 開始朗讀時，畫面所在的章節 href」，advanceToNextChapter 用這個
  // 當基準比對，而不是每次都重新取 currentHrefRef 的當下值——這個朗讀 session 期間畫面
  // 可能已經被 WebView 端的自動跟讀翻頁推進到新章節了，用「呼叫當下」的 href 當基準會讓
  // 下面的迴圈誤判成「還沒跨到新章節」而多翻一次頁。
  const readingHrefRef = useRef('');

  const resetForNewBook = useCallback(() => {
    tts.reset();
    postToWebView({ type: 'ttsStop' });
  }, [tts, postToWebView]);

  // 朗讀進行中，WebView 端會自己在快讀到目前頁面底部時呼叫 turnPage('next') 把畫面翻到
  // 下一頁，不需要 RN 端介入。這裡的 readNextAndContinue 只在「整章文字真的念完」時才呼叫，
  // 負責跨到下一章：多數情況 WebView 端的自動跟讀翻頁早已把畫面翻到這章最後一頁並跨過章節
  // 邊界（下面迴圈第一次檢查就會發現 href 已經變了，直接返回，不重複翻頁）；只有在自動跟讀
  // 翻頁還沒來得及跟上時才需要额外呼叫 next() 補上。
  const advanceToNextChapter = useCallback(async (): Promise<boolean> => {
    const startHref = readingHrefRef.current;
    if (__DEV__) console.log('[tts-reading] advanceToNextChapter 開始', { startHref, currentHref: currentHrefRef.current, atEnd: atEndRef.current });
    for (let i = 0; i < 50; i++) {
      if (currentHrefRef.current !== startHref) {
        if (__DEV__) console.log('[tts-reading] advanceToNextChapter: href 已改變，跨章節成功', { i, newHref: currentHrefRef.current });
        return true;
      }
      if (atEndRef.current) {
        if (__DEV__) console.log('[tts-reading] advanceToNextChapter: 已到全書結尾，停止', { i });
        return false;
      }
      postToWebView({ type: 'next' });
      await waitForRelocated();
    }
    const advanced = currentHrefRef.current !== startHref;
    if (__DEV__) console.log('[tts-reading] advanceToNextChapter: 50 次重試後仍未跨過章節', { advanced, startHref, currentHref: currentHrefRef.current, atEnd: atEndRef.current });
    return advanced;
  }, [currentHrefRef, atEndRef, postToWebView, waitForRelocated]);

  const continueReadingRef = useRef<() => void>(() => {});

  const startSpeaking = useCallback(
    (text: string, startOffset: number) => {
      readingHrefRef.current = currentHrefRef.current;
      postToWebView({ type: 'ttsStart' });
      tts.speak(
        text,
        () => continueReadingRef.current(),
        (charIndex) => postToWebView({ type: 'ttsBoundary', charIndex: charIndex + startOffset })
      );
    },
    [tts, currentHrefRef, postToWebView]
  );

  const readNextAndContinue = useCallback(async () => {
    const advanced = await advanceToNextChapter();
    if (!advanced) {
      if (__DEV__) console.log('[tts-reading] readNextAndContinue: advanceToNextChapter 回報 false，朗讀在此停止');
      return;
    }
    // 實測抓到的真正情況（見對話紀錄的 log）：跨完章節後 getChapterText() 拿到空字串，不是
    // WebView 渲染還沒完成的暫時性競態（重試 300ms 仍是空字串）——是這個 spine 項目本身就
    // 沒有文字內容（常見於純標題頁／純圖片頁，例如 xxxt.xhtml 這種章節標題圖片頁）。這種頁面
    // 要繼續往後翻頁找下一個真的有文字的頁面，而不是原地重試或直接放棄朗讀。
    for (let hop = 0; hop < 20; hop++) {
      const { text, startOffset } = await requestChapterText();
      if (text.trim()) {
        startSpeaking(text, startOffset);
        return;
      }
      if (__DEV__) console.log('[tts-reading] readNextAndContinue: 目前頁面沒有可念文字，往後翻頁找下一頁', { hop, href: currentHrefRef.current });
      if (atEndRef.current) {
        if (__DEV__) console.log('[tts-reading] readNextAndContinue: 已到全書結尾仍沒有可念文字，朗讀在此停止');
        return;
      }
      postToWebView({ type: 'next' });
      await waitForRelocated();
      if (hop === 19) {
        // 第 20 次翻頁後的目的地也要檢查一次，不能翻完就直接放棄，否則剛好翻到的
        // 那一頁若本身有文字會被平白錯過（見上面 for 迴圈：check 在 navigate 之前，
        // 最後一次 navigate 完迴圈就結束，若不在這裡補一次 check，這個目的地永遠不會被檢查）。
        const { text: finalText, startOffset: finalOffset } = await requestChapterText();
        if (finalText.trim()) {
          startSpeaking(finalText, finalOffset);
          return;
        }
      }
    }
    if (__DEV__) console.log('[tts-reading] readNextAndContinue: 連續 20 次翻頁都沒有可念文字，放棄');
  }, [advanceToNextChapter, requestChapterText, startSpeaking, atEndRef, currentHrefRef, postToWebView, waitForRelocated]);
  useEffect(() => {
    continueReadingRef.current = readNextAndContinue;
  }, [readNextAndContinue]);

  const handleTTSPlay = useCallback(async () => {
    if (tts.paused) {
      tts.resume();
      postToWebView({ type: 'ttsStart' });
      return;
    }
    const { text, startOffset } = await requestChapterText();
    if (!text.trim()) return;
    startSpeaking(text, startOffset);
  }, [tts, requestChapterText, startSpeaking, postToWebView]);

  const handleTTSPause = useCallback(() => {
    tts.pause();
    postToWebView({ type: 'ttsStop' });
  }, [tts, postToWebView]);

  const handleTTSReset = useCallback(() => {
    tts.reset();
    postToWebView({ type: 'ttsStop' });
  }, [tts, postToWebView]);

  // 朗讀控制列上的睡眠計時是快速切換用途（跟設定面板裡完整的分段選單共用同一份
  // tts.sleepMinutes／onSleepChange 狀態，不是獨立的第二套計時），每點一次照固定選項
  // 循環切換，不需要另外彈出選單。
  const handleCycleSleep = useCallback(() => {
    tts.onSleepChange(cycleSleepOption(tts.sleepMinutes, SLEEP_CYCLE_OPTIONS));
  }, [tts]);

  return {
    tts,
    resetForNewBook,
    handleTTSPlay,
    handleTTSPause,
    handleTTSReset,
    handleCycleSleep,
  };
};
