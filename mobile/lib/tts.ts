import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
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
  // fullTextRef 是這次 speak() 傳入的完整文字（不會因為切成 chunk 或暫停/恢復而改變）；
  // chunksRef 則是「目前這一輪」實際拿去餵給 Speech.speak() 的切段結果，恢復播放時會用
  // fullTextRef 從暫停位置重新切一輪新的 chunksRef（見 resume() 的說明），兩者不可混用。
  const fullTextRef = useRef('');
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  // baseOffsetRef：目前這輪 chunksRef 在 fullTextRef 裡的起始位移。一般從頭朗讀時是 0；
  // 從暫停位置恢復播放時，chunksRef 是從暫停處重新切出來的，這裡就會是暫停時的絕對位移，
  // 讓 onBoundary 回報出去的字元位移永遠是相對於 fullTextRef（也就是呼叫端認知的「整章
  // 文字」）的絕對位置，不會因為中途暫停過一次就整個位移錯位。
  const baseOffsetRef = useRef(0);
  // chunkStartOffsetRef／lastBoundaryCharIndexRef：分別記錄「目前這個 chunk 在 chunksRef
  // 裡的起始位移」與「最近一次 onBoundary 回報、相對於目前 chunk 的字元位移」，兩者相加
  // 再加上 baseOffsetRef，就是暫停當下真正朗讀到的絕對位置——這是修正「暫停後再播放會
  // 整個 chunk 重講一次」的關鍵：舊版 resume() 是直接重新呼叫 speakChunk() 重講同一個
  // chunk，expo-speech 的 Speech.speak() 只能從文字開頭朗讀，沒有「從第 N 個字繼續」的
  // API，所以整個 chunk（最長可能到 3000 字）都會從頭重念一次。
  const chunkStartOffsetRef = useRef(0);
  const lastBoundaryCharIndexRef = useRef(0);
  const generationRef = useRef(0);
  const onAllDoneRef = useRef<(() => void) | undefined>(undefined);
  const onBoundaryRef = useRef<((charIndex: number) => void) | undefined>(undefined);
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

  // 睡眠計時的到期時間點（絕對時間戳，非倒數秒數）：iOS 上 App 進入背景（例如使用者鎖螢幕、
  // 或切到其他 App 讓朗讀在背景繼續播放——這正是睡眠計時最常見的使用情境）時，RN 的
  // setInterval 會被系統節流甚至完全暫停好幾分鐘才補跑一次，如果倒數邏輯是「每次 tick
  // 扣 1 秒」，被節流期間流逝的真實時間並不會被扣掉，導致「設定 15 分鐘，回到前景時卻早就
  // 超過 15 分鐘還在播放」。改成每次 tick 都用 Date.now() 跟這個絕對到期時間比較，不管
  // tick 被延後多久，只要真的醒來執行一次就會偵測到「已經過期」並立刻停止，不會因為少
  // 跑了幾次 tick 就把到期時間往後推。
  const sleepDeadlineAtRef = useRef<number | null>(null);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimerRef.current !== null) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    sleepDeadlineAtRef.current = null;
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
    onBoundaryRef.current = undefined;
  }, [stop, clearSleepTimer]);

  // 檢查是否已經超過到期時間，超過就停止播放並清掉計時器；供下面的 interval tick 跟
  // AppState 回到前景時共用同一份判斷邏輯，避免兩處各自實作出不一致的行為。
  const checkSleepDeadline = useCallback(() => {
    const deadline = sleepDeadlineAtRef.current;
    if (deadline === null) return;
    const msLeft = deadline - Date.now();
    if (msLeft <= 0) {
      clearSleepTimer();
      stop();
      return;
    }
    setSleepRemaining(Math.ceil(msLeft / 1000));
  }, [clearSleepTimer, stop]);

  const startSleepTimer = useCallback((minutes: number) => {
    clearSleepTimer();
    if (minutes <= 0) return;
    sleepDeadlineAtRef.current = Date.now() + minutes * 60_000;
    setSleepRemaining(minutes * 60);
    sleepTimerRef.current = setInterval(checkSleepDeadline, 1000);
  }, [clearSleepTimer, checkSleepDeadline]);

  // App 從背景回到前景時立刻校正一次：不用等下一次 1 秒 tick，避免使用者鎖螢幕朗讀一段
  // 時間後解鎖，畫面短暫還顯示著早已過期的舊倒數數字／仍在播放的朗讀音訊。
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkSleepDeadline();
    });
    return () => subscription.remove();
  }, [checkSleepDeadline]);

  const speakChunk = useCallback((generation: number) => {
    const chunk = chunksRef.current[chunkIndexRef.current];
    if (chunk === undefined) {
      setPlaying(false);
      setPaused(false);
      onAllDoneRef.current?.();
      return;
    }
    // chunk 只是因應 MAX_UTTERANCE_LENGTH 切出來的其中一段，onBoundary 回報的 charIndex
    // 是相對於「這個 chunk」的位移；呼叫端（reader 頁）需要的是相對於整段朗讀文字（一整章）
    // 的絕對位移，才能拿去比對 WebView 內畫底線／頁面邊界用的字元索引，因此這裡要加上
    // 前面所有已念完 chunk 的長度總和，再加上這一輪 chunksRef 相對於 fullTextRef 的起始位移。
    let chunkStartOffset = 0;
    for (let i = 0; i < chunkIndexRef.current; i++) chunkStartOffset += chunksRef.current[i].length;
    chunkStartOffsetRef.current = chunkStartOffset;
    lastBoundaryCharIndexRef.current = 0;
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
      onBoundary: (ev: { charIndex: number }) => {
        if (generationRef.current !== generation) return;
        lastBoundaryCharIndexRef.current = ev.charIndex;
        onBoundaryRef.current?.(baseOffsetRef.current + chunkStartOffset + ev.charIndex);
      },
    });
  }, []);

  const speak = useCallback((text: string, onAllDone?: () => void, onBoundary?: (charIndex: number) => void) => {
    if (!text.trim()) return;
    const generation = ++generationRef.current;
    fullTextRef.current = text;
    baseOffsetRef.current = 0;
    chunksRef.current = splitTextByLength(text);
    chunkIndexRef.current = 0;
    onAllDoneRef.current = onAllDone;
    onBoundaryRef.current = onBoundary;
    setPlaying(true);
    setPaused(false);
    // 使用者可能在按下播放前就先選好睡眠計時，這裡補上啟動，避免預先選的分鐘數被忽略；
    // 但如果計時已經在跑（例如跨章節自動接續朗讀），不能重新啟動，否則倒數會被每一章重置。
    if (sleepMinutes > 0 && sleepDeadlineAtRef.current === null) startSleepTimer(sleepMinutes);
    speakChunk(generation);
  }, [speakChunk, sleepMinutes, startSleepTimer]);

  const pause = useCallback(() => {
    if (!playing) return;
    generationRef.current++;
    Speech.stop();
    setPlaying(false);
    setPaused(true);
  }, [playing]);

  // 恢復播放：expo-speech 的 Speech.speak() 沒有「從第 N 個字繼續朗讀」的 API，只能重新
  // 給一段文字從頭念。因此不能像舊版那樣直接重講暫停當下的整個 chunk（可能長達 3000 字），
  // 而是要用暫停時記下的絕對位移，從 fullTextRef 裡切出「還沒念的部分」重新分段、從頭
  // 這一小段開始念——對使用者來說就是「接續播放」，聽感上跟真正的逐字元續播是一致的
  // （最多差在最近一次 onBoundary 到暫停指令之間那一小段，通常是零到一個詞的長度）。
  const resume = useCallback(() => {
    if (!paused) return;
    const resumeFrom = baseOffsetRef.current + chunkStartOffsetRef.current + lastBoundaryCharIndexRef.current;
    const remaining = fullTextRef.current.slice(resumeFrom);
    if (!remaining.trim()) {
      setPlaying(false);
      setPaused(false);
      onAllDoneRef.current?.();
      return;
    }
    const generation = ++generationRef.current;
    baseOffsetRef.current = resumeFrom;
    chunksRef.current = splitTextByLength(remaining);
    chunkIndexRef.current = 0;
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
