import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

// 手機系統 TTS 引擎對單次 utterance 的文字長度可能有限制（比照網頁版 useTTS.ts 的
// MAX_UTTERANCE_LENGTH 保護），過長文字先按標點切成多段，依序朗讀。
const MAX_UTTERANCE_LENGTH = 3000;

const splitTextByLength = (text: string): string[] => {
  if (text.length <= MAX_UTTERANCE_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let chunk = remaining.slice(0, MAX_UTTERANCE_LENGTH);
    const lastPunctIdx = Math.max(
      chunk.lastIndexOf('。'),
      chunk.lastIndexOf('，'),
      chunk.lastIndexOf('！'),
      chunk.lastIndexOf('？'),
      chunk.lastIndexOf('；'),
      chunk.lastIndexOf('\n')
    );
    if (lastPunctIdx > MAX_UTTERANCE_LENGTH * 0.7) chunk = chunk.slice(0, lastPunctIdx + 1);
    chunks.push(chunk);
    remaining = remaining.slice(chunk.length);
  }
  return chunks.length > 0 ? chunks : [text];
};

export interface TTSVoice {
  identifier: string;
  name: string;
  language: string;
}

// Android 上 expo-speech 回傳的語音沒有像 iOS 那樣的人類可讀名稱（name 常常就是
// identifier 本身，例如 "zh-TW-language"、"cmn-cn-x-cce-local"）。不用語言代碼標地區
// （例如「中國」／「台灣」），一律用同一個通用標籤＋編號區分，避免地區用字的爭議。
const GENERIC_CHINESE_VOICE_LABEL = '中文語音';

const withFriendlyLabels = (list: TTSVoice[]): TTSVoice[] =>
  list.map((v, i) => ({
    ...v,
    name: list.length > 1 ? `${GENERIC_CHINESE_VOICE_LABEL} ${i + 1}` : GENERIC_CHINESE_VOICE_LABEL,
  }));

// 實測發現 Android 上同一個語言（例如 zh-TW）常常同時列出好幾組不同合成引擎的變體
// （ccc/ccd/cce/ssa/ctc/ctd/cte...），還各自有 -local（離線）／-network（連網）兩份，
// 光是中文相關語音就有十幾筆，使用者體感是「選項多到不知道選哪個」。實際上使用者只在意
// 「腔調（語言）」而不是背後合成引擎，所以每個 language 只保留一筆代表（呼叫前已把
// -local 排到前面，所以每個語言留下來的會是離線版本），比照 iOS 只留「婷婷／美佳」兩個
// 選項的精神。
const dedupeByLanguage = (list: TTSVoice[]): TTSVoice[] => {
  const seen = new Set<string>();
  const result: TTSVoice[] = [];
  for (const v of list) {
    if (seen.has(v.language)) continue;
    seen.add(v.language);
    result.push(v);
  }
  return result;
};

// 簡化版 TTS：只朗讀「目前章節」文字（由呼叫端透過 speak() 傳入），沒有網頁版
// useTTS.ts 那套逐字元 boundary 追蹤與畫面高亮同步（見 RN_SETUP_GUIDE.md 第十二輪紀錄）。
export const useTTS = () => {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<TTSVoice | null>(null);
  const [rate, setRate] = useState(1.0);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);

  const rateRef = useRef(1.0);
  const selectedVoiceRef = useRef<TTSVoice | null>(null);
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const generationRef = useRef(0);
  const onAllDoneRef = useRef<(() => void) | undefined>(undefined);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { selectedVoiceRef.current = selectedVoice; }, [selectedVoice]);

  useEffect(() => {
    // 比照網頁版 useTTS.ts 的 ALLOWED 過濾：只保留「婷婷」「美佳」這兩個 iOS 系統語音
    // （各取清單中最後一筆同名變體，避免同時列出多個版本）；如果裝置上兩者都沒有
    // （例如 Android 模擬器、或非 iOS 平台通常沒有這兩個 Siri 語音），才 fallback
    // 顯示所有 zh 開頭的語音，不然清單會是空的、完全沒得選。
    const ALLOWED = /Meijia|Tingting|美佳|婷婷/i;
    Speech.getAvailableVoicesAsync()
      .then((all) => {
        const zh = all
          .filter((v) => /^zh/i.test(v.language))
          .map((v) => ({ identifier: v.identifier, name: v.name, language: v.language }))
          // Android 上有些語音是需要連網才能合成的「network」語音，實測常常整個沒聲音也不會
          // 觸發 onError；名稱含 "-local" 的是內建離線語音，優先排在前面，讓預設選到的語音
          // 比較不會因為裝置沒網路/語音資料沒下載而發不出聲音。
          .sort((a, b) => Number(b.identifier.includes('-local')) - Number(a.identifier.includes('-local')));
        const filtered = zh.filter((v) => ALLOWED.test(v.name));
        const lastTingting = [...filtered].reverse().find((v) => /Tingting|婷婷/i.test(v.name));
        const lastMeijia = [...filtered].reverse().find((v) => /Meijia|美佳/i.test(v.name));
        const preferred = [lastTingting, lastMeijia].filter((v): v is TTSVoice => Boolean(v));
        const list = preferred.length > 0 ? preferred : withFriendlyLabels(dedupeByLanguage(zh));
        setVoices(list);
        setSelectedVoice((prev) => prev ?? list[0] ?? null);
      })
      .catch(() => {
        /* 部分機型/模擬器可能沒有語音清單，維持空陣列，改用系統預設語音 */
      });
  }, []);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimerRef.current !== null) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    setSleepRemaining(null);
  }, []);

  const stop = useCallback(() => {
    generationRef.current++;
    Speech.stop();
    chunksRef.current = [];
    chunkIndexRef.current = 0;
    setPlaying(false);
    setPaused(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    clearSleepTimer();
    setSleepMinutes(0);
    onAllDoneRef.current = undefined;
  }, [stop, clearSleepTimer]);

  const startSleepTimer = useCallback((minutes: number) => {
    clearSleepTimer();
    if (minutes <= 0) return;
    let remaining = minutes * 60;
    setSleepRemaining(remaining);
    sleepTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearSleepTimer();
        stop();
        return;
      }
      setSleepRemaining(remaining);
    }, 1000);
  }, [clearSleepTimer, stop]);

  const speakChunk = useCallback((generation: number) => {
    const chunk = chunksRef.current[chunkIndexRef.current];
    if (chunk === undefined) {
      setPlaying(false);
      setPaused(false);
      onAllDoneRef.current?.();
      return;
    }
    Speech.speak(chunk, {
      voice: selectedVoiceRef.current?.identifier,
      language: selectedVoiceRef.current?.language ?? 'zh-TW',
      rate: rateRef.current,
      onDone: () => {
        if (generationRef.current !== generation) return;
        chunkIndexRef.current += 1;
        speakChunk(generation);
      },
      onStopped: () => {
        /* 使用者手動 pause/stop 觸發，狀態已由呼叫端更新，這裡不用重複處理 */
      },
      onError: () => {
        if (generationRef.current !== generation) return;
        setPlaying(false);
        setPaused(false);
      },
    });
  }, []);

  const speak = useCallback((text: string, onAllDone?: () => void) => {
    if (!text.trim()) return;
    const generation = ++generationRef.current;
    chunksRef.current = splitTextByLength(text);
    chunkIndexRef.current = 0;
    onAllDoneRef.current = onAllDone;
    setPlaying(true);
    setPaused(false);
    // 使用者可能在按下播放前就先選好睡眠計時，這裡補上啟動，避免預先選的分鐘數被忽略。
    if (sleepMinutes > 0) startSleepTimer(sleepMinutes);
    speakChunk(generation);
  }, [speakChunk, sleepMinutes, startSleepTimer]);

  const pause = useCallback(() => {
    if (!playing) return;
    generationRef.current++;
    Speech.stop();
    setPlaying(false);
    setPaused(true);
  }, [playing]);

  const resume = useCallback(() => {
    if (!paused) return;
    const generation = ++generationRef.current;
    setPlaying(true);
    setPaused(false);
    speakChunk(generation);
  }, [paused, speakChunk]);

  const handleSleepChange = useCallback((minutes: number) => {
    setSleepMinutes(minutes);
    if (minutes > 0 && (playing || paused)) startSleepTimer(minutes);
    else clearSleepTimer();
  }, [playing, paused, startSleepTimer, clearSleepTimer]);

  useEffect(() => () => {
    Speech.stop();
    clearSleepTimer();
  }, [clearSleepTimer]);

  return {
    playing, paused, speak, pause, resume, stop, reset,
    voices, selectedVoice, setSelectedVoice,
    rate, setRate,
    sleepMinutes, sleepRemaining, onSleepChange: handleSleepChange,
  };
};
