import { useState, useRef, useEffect, useCallback } from 'react'

const ALLOWED = /Meijia|Tingting|美佳|婷婷/i

const pickBest = (voices: SpeechSynthesisVoice[]) =>
  voices.find((v) => /Meijia|美佳/i.test(v.name)) ?? voices[0] ?? null

// iOS 上 speechSynthesis 約每 15 秒會被系統靜默，輪詢偵測靜默後重啟（不再 pause/resume 以避免 utterance 被重頭播放）
const IOS_SILENCE_POLL_INTERVAL = 2000

// 手機版朗讀文本長度上限（某些行動浏覽器限制 utterance 文字長度）
const MAX_UTTERANCE_LENGTH = 3000
const DEFAULT_CHARS_PER_SECOND = 6.2
const DEBUG_TTS_PROGRESS = false

export type TTSProgressSource = 'boundary' | 'estimate'

const useTTS = () => {
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [rate, setRate] = useState(1.0)

  // 穩定 refs，供 callback 內存取最新值
  const rateRef = useRef(1.0)
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const playingRef = useRef(false)
  const pausedRef = useRef(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const generationRef = useRef(0) // 每次建立新 utterance 遞增，防止舊 callback 干擾

  // 追蹤朗讀位置，供語速切換時從原位繼續
  const currentTextRef = useRef('')  // speak() 傳入的完整文字
  const textOffsetRef = useRef(0)    // 目前 utterance 在完整文字中的起始位置
  const charIndexRef = useRef(0)     // 目前 utterance 最後一個 boundary 的 charIndex
  const currentUtteranceTextRef = useRef('')
  const currentUtteranceStartAtRef = useRef(0)
  const currentUtteranceLastBoundaryAtRef = useRef(0)
  const currentUtteranceLastBoundaryIndexRef = useRef(0)
  const estimatedCharsPerSecondRef = useRef(DEFAULT_CHARS_PER_SECOND)
  const lastProgressDebugAtRef = useRef(0)
  const onEndRef = useRef<(() => void) | undefined>(undefined)
  const onBoundaryRef = useRef<((charIdx: number, source: TTSProgressSource) => void) | undefined>(undefined)

  // 診斷用：連續截斷計數、上次 createAndPlay 時間
  const consecutiveTruncationRef = useRef(0)
  const lastCreateAndPlayAtRef = useRef(0)

  // iOS keepalive timer ref
  const keepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { rateRef.current = rate }, [rate])
  useEffect(() => { selectedVoiceRef.current = selectedVoice }, [selectedVoice])

  // iOS keepalive：輪詢偵測靜默，若系統斷音則從估算位置重啟
  // 注意：不使用 pause()+resume()，該組合在 iOS 上會導致 utterance 從頭播放
  const startKeepalive = () => {
    if (keepaliveTimerRef.current !== null) return
    keepaliveTimerRef.current = setInterval(() => {
      if (!playingRef.current || pausedRef.current) return
      if (window.speechSynthesis.paused) {
        // 系統暫停（非使用者操作）→ 嘗試恢復，不強制 pause
        window.speechSynthesis.resume()
        return
      }
      if (!window.speechSynthesis.speaking) {
        // iOS 靜默（系統斷音），從估算位置重啟
        const elapsedSinceLastBoundary = currentUtteranceLastBoundaryAtRef.current > 0
          ? (Date.now() - currentUtteranceLastBoundaryAtRef.current) / 1000
          : 0
        const addChars = Math.round(elapsedSinceLastBoundary * estimatedCharsPerSecondRef.current * rateRef.current)
        const utterancePos = Math.min(
          currentUtteranceLastBoundaryIndexRef.current + addChars,
          currentUtteranceTextRef.current.length
        )
        const absolutePos = Math.min(textOffsetRef.current + utterancePos, currentTextRef.current.length)
        const remaining = currentTextRef.current.slice(absolutePos)
        if (remaining.trim()) {
          if (DEBUG_TTS_PROGRESS) console.log('[TTS:keepalive] iOS 靜默偵測 → 從位置重啟', { absolutePos, utterancePos, addChars })
          textOffsetRef.current = absolutePos
          charIndexRef.current = 0
          playFromOffset(absolutePos)
        } else {
          finishPlayback()
        }
      }
    }, IOS_SILENCE_POLL_INTERVAL)
  }

  const stopKeepalive = () => {
    if (keepaliveTimerRef.current !== null) {
      clearInterval(keepaliveTimerRef.current)
      keepaliveTimerRef.current = null
    }
  }

  const emitProgress = (absolutePos: number, source: TTSProgressSource) => {
    const safePos = Math.max(0, Math.min(absolutePos, currentTextRef.current.length))
    if (DEBUG_TTS_PROGRESS) {
      const now = Date.now()
      if (source === 'boundary' || now - lastProgressDebugAtRef.current >= 1000) {
        lastProgressDebugAtRef.current = now
        console.log('[TTS:progress]', {
          source,
          absolutePos: safePos,
          textOffset: textOffsetRef.current,
          charIndex: charIndexRef.current,
          utteranceLength: currentUtteranceTextRef.current.length,
          lastBoundaryIndex: currentUtteranceLastBoundaryIndexRef.current,
          estimatedCps: Number(estimatedCharsPerSecondRef.current.toFixed(2)),
          rate: rateRef.current,
        })
      }
    }
    onBoundaryRef.current?.(safePos, source)
  }

  useEffect(() => {
    const load = () => {
      const all = window.speechSynthesis.getVoices()
      if (all.length === 0) return
      const filtered = all.filter((v) => /^zh/i.test(v.lang) && ALLOWED.test(v.name))
      // 各取最後一個 Tingting/婷婷 與 Meijia/美佳（避免顯示多個變體）
      const lastTingting = [...filtered].reverse().find((v) => /Tingting|婷婷/i.test(v.name))
      const lastMeijia = [...filtered].reverse().find((v) => /Meijia|美佳/i.test(v.name))
      const list = [lastTingting, lastMeijia].filter(Boolean) as SpeechSynthesisVoice[]
      setVoices(list.length > 0 ? list : all.filter((v) => /^zh/i.test(v.lang)))
      setSelectedVoice((prev) => prev ?? pickBest(list.length > 0 ? list : all.filter((v) => /^zh/i.test(v.lang))))
    }

    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    // Electron 有時不觸發 voiceschanged，加 fallback
    const t = setTimeout(load, 500)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load)
      clearTimeout(t)
    }
  }, [])

  // iOS visibilitychange：頁面回到前台時恢復朗讀
  // 注意：進入背景時不強制 pause()，避免前台後 resume() 觸發 utterance 從頭播放
  // 只讀 refs，用 useCallback 固定參照，避免每次 render 都重新掛載/卸載 visibilitychange listener
  const handleVisibilityChange = useCallback(() => {
    const isHidden = document.visibilityState === 'hidden'
    if (isHidden) {
      if (DEBUG_TTS_PROGRESS) console.log('[TTS] 頁面進入背景', { playing: playingRef.current })
    } else {
      if (DEBUG_TTS_PROGRESS) console.log('[TTS] 頁面回到前台', { playing: playingRef.current, synthSpeaking: window.speechSynthesis.speaking, synthPaused: window.speechSynthesis.paused })
      if (playingRef.current && !pausedRef.current) {
        if (window.speechSynthesis.paused) {
          // 系統暫停 → 恢復（此時 utterance 狀態完整，resume 不會重頭）
          window.speechSynthesis.resume()
        } else if (!window.speechSynthesis.speaking) {
          // 系統靜默（utterance 已結束但 onend 未觸發）→ 從估算位置重啟
          const absolutePos = textOffsetRef.current + charIndexRef.current
          const remaining = currentTextRef.current.slice(absolutePos)
          if (remaining.trim()) {
            if (DEBUG_TTS_PROGRESS) console.log('[TTS] 前台恢復：靜默偵測 → 從位置重啟', { absolutePos })
            textOffsetRef.current = absolutePos
            charIndexRef.current = 0
            playFromOffset(absolutePos)
          } else {
            finishPlayback()
          }
        }
        startKeepalive()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [handleVisibilityChange])

  const finishPlayback = () => {
    stopKeepalive()
    playingRef.current = false
    setPlaying(false)
    pausedRef.current = false
    setPaused(false)
    onEndRef.current?.()
  }

  // 建立並播放 utterance（內部用，使用當前 refs 值）
  const createAndPlay = (text: string) => {
    const generation = ++generationRef.current
    lastCreateAndPlayAtRef.current = Date.now()
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    const voice = selectedVoiceRef.current
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? 'zh-TW'
    utterance.rate = rateRef.current
    utterance.pitch = 1.0
    utterance.volume = 1.0

    utterance.onstart = () => {
      if (generationRef.current !== generation) return
      currentUtteranceTextRef.current = text
      const startAt = Date.now()
      currentUtteranceStartAtRef.current = startAt
      currentUtteranceLastBoundaryAtRef.current = startAt
      currentUtteranceLastBoundaryIndexRef.current = 0
      pausedRef.current = false
      setPaused(false)
    }
    utterance.onpause = () => {
      if (generationRef.current !== generation) return
      if (DEBUG_TTS_PROGRESS) {
        console.warn('[TTS] onpause（系統暫停）', { generation, charIndex: charIndexRef.current })
      }
    }
    utterance.onresume = () => {
      if (generationRef.current !== generation) return
      if (DEBUG_TTS_PROGRESS) console.log('[TTS] onresume', { generation })
    }
    utterance.onboundary = (e) => {
      if (generationRef.current !== generation) return
      const now = Date.now()
      const nextCharIndex = Math.max(0, Math.min(e.charIndex, text.length))

      // 偵測 iOS utterance 被系統重啟（charIndex 顯著倒退）
      // 發生原因：外部 cancel/speak 或系統介入導致 utterance 從頭播放，charIndex 突然回到 0 附近
      const prevCharIndex = charIndexRef.current
      if (prevCharIndex > 80 && nextCharIndex < prevCharIndex - 50) {
        const savedPos = textOffsetRef.current + prevCharIndex
        console.warn('[TTS] onboundary 倒退偵測 → 取消並從正確位置恢復', { prevCharIndex, nextCharIndex, savedPos, generation })
        const recoveryGen = ++generationRef.current
        window.speechSynthesis.cancel()
        textOffsetRef.current = savedPos
        charIndexRef.current = 0
        setTimeout(() => {
          if (playingRef.current && generationRef.current === recoveryGen) playFromOffset(savedPos)
        }, 150)
        return
      }

      const boundaryDelta = nextCharIndex - currentUtteranceLastBoundaryIndexRef.current
      const timeDelta = (now - currentUtteranceLastBoundaryAtRef.current) / 1000
      if (boundaryDelta > 8 && timeDelta > 0.5) {
        const measured = boundaryDelta / timeDelta
        if (measured > 2 && measured < 16) {
          estimatedCharsPerSecondRef.current = estimatedCharsPerSecondRef.current * 0.7 + measured * 0.3
        }
      }
      charIndexRef.current = nextCharIndex
      currentUtteranceLastBoundaryAtRef.current = now
      currentUtteranceLastBoundaryIndexRef.current = nextCharIndex
      // 通知外部目前在完整文字中的絕對位置
      emitProgress(textOffsetRef.current + nextCharIndex, 'boundary')
    }
    utterance.onend = () => {
      if (generationRef.current !== generation) return
      const now = Date.now()
      const elapsedMs = currentUtteranceStartAtRef.current > 0 ? now - currentUtteranceStartAtRef.current : -1
      const onstartFired = currentUtteranceStartAtRef.current > 0
      const totalChars = currentTextRef.current.length
      const utteranceEnd = textOffsetRef.current + text.length
      const boundaryEnd = textOffsetRef.current + charIndexRef.current
      const silentTruncation = charIndexRef.current === 0  // onend 在任何 boundary 前觸發
      // silentTruncation 時改用時間估算，避免假設整段都讀完（實際可能讀到一半被截斷）
      const silentEstimatedEnd = silentTruncation && currentUtteranceStartAtRef.current > 0
        ? textOffsetRef.current + Math.min(
            Math.round((elapsedMs / 1000) * estimatedCharsPerSecondRef.current * rateRef.current),
            text.length
          )
        : utteranceEnd
      const readChars = charIndexRef.current > 0 && boundaryEnd < utteranceEnd - 10
        ? boundaryEnd
        : silentTruncation ? silentEstimatedEnd : utteranceEnd
      const remainingText = currentTextRef.current.slice(readChars)
      const hasMoreText = readChars < totalChars - 10 && remainingText.trim().length > 0
      const isTruncated = charIndexRef.current > 0 && boundaryEnd < utteranceEnd - 10

      if (isTruncated || silentTruncation) {
        consecutiveTruncationRef.current++
      } else {
        consecutiveTruncationRef.current = 0
      }

      if (isTruncated || silentTruncation) {
        const label = silentTruncation
          ? '[TTS] onend ‼️ 無聲截斷（charIndex=0，跳過文字！）'
          : '[TTS] onend ⚠️ 疑似 iOS 截斷'
        console.warn(label, {
          generation,
          elapsedMs,
          onstartFired,
          charIndex: charIndexRef.current,
          offset: textOffsetRef.current,
          readChars,
          skippedChars: silentTruncation ? text.length : text.length - charIndexRef.current,
          remaining: totalChars - readChars,
          consecutiveTruncation: consecutiveTruncationRef.current,
          synthSpeaking: window.speechSynthesis.speaking,
          synthPaused: window.speechSynthesis.paused,
        })
      }

      if (consecutiveTruncationRef.current >= 5) {
        console.warn('[TTS] ⚠️ 連續截斷超過 5 次，speechSynthesis 可能進入異常狀態', {
          consecutiveTruncation: consecutiveTruncationRef.current,
          generation,
          offset: textOffsetRef.current,
        })
      }

      if (hasMoreText) {
        textOffsetRef.current = readChars
        charIndexRef.current = 0
        playFromOffset(readChars)
        return
      }
      finishPlayback()
    }
    utterance.onerror = (e) => {
      const err = (e as SpeechSynthesisErrorEvent).error
      const elapsedMs = currentUtteranceStartAtRef.current > 0 ? Date.now() - currentUtteranceStartAtRef.current : -1
      const isStale = generationRef.current !== generation
      // console.log 讓 onerror 出現在 [Log] 欄位（console.error 只出現在 [Error]）
      console.log('[TTS] onerror [LOG]', {
        generation,
        error: err,
        elapsedMs,
        charIndex: charIndexRef.current,
        offset: textOffsetRef.current,
        isStaleGen: isStale,
        synthSpeaking: window.speechSynthesis.speaking,
        synthPaused: window.speechSynthesis.paused,
        consecutiveTruncation: consecutiveTruncationRef.current,
      })
      console.error('[TTS] onerror', { generation, error: err, charIndex: charIndexRef.current, offset: textOffsetRef.current, isStaleGen: isStale })
      if (isStale) return

      // iOS 上 'interrupted' 錯誤代表被系統強制中斷，嘗試從斷點自動繼續
      if (err === 'interrupted' && playingRef.current) {
        // charIndex=0 表示 interrupted 在任何 boundary 前觸發（常見於 keepalive 舊方案 pause/resume 後）
        // 用時間估算實際讀到的位置，避免退回 chunk 起點重複朗讀
        let absolutePos: number
        if (charIndexRef.current === 0 && currentUtteranceStartAtRef.current > 0) {
          const elapsedS = (Date.now() - currentUtteranceStartAtRef.current) / 1000
          const estimatedPos = Math.round(elapsedS * estimatedCharsPerSecondRef.current * rateRef.current)
          absolutePos = textOffsetRef.current + Math.min(estimatedPos, currentUtteranceTextRef.current.length)
        } else {
          absolutePos = textOffsetRef.current + charIndexRef.current
        }
        const remaining = currentTextRef.current.slice(absolutePos)
        if (remaining.trim()) {
          consecutiveTruncationRef.current++
          console.log('[TTS] interrupted → 從估算/記錄位置重試', {
            absolutePos,
            charIndex: charIndexRef.current,
            consecutiveTruncation: consecutiveTruncationRef.current,
          })
          textOffsetRef.current = absolutePos
          charIndexRef.current = 0
          // 立即遞增 generation，防止同一 utterance 的 onend 在 300ms 等待期間通過
          // generation 檢查並呼叫 onEndRef，否則會觸發下一章、再被 recovery 覆蓋造成重複朗讀
          const recoveryGen = ++generationRef.current
          setTimeout(() => {
            if (playingRef.current && generationRef.current === recoveryGen) playFromOffset(absolutePos)
          }, 300)
          return
        }
        // 若 remaining 文字為空或無法恢復，視同錯誤終止，繼續執行 stopKeepalive 邏輯
      }

      stopKeepalive()
      playingRef.current = false
      setPlaying(false)
      pausedRef.current = false
      setPaused(false)
      // 確保所有錯誤路徑都呼叫 onEnd 回調，使鏈式朗讀不中斷
      if (DEBUG_TTS_PROGRESS) console.log('[TTS] onerror: 調用 onEnd 回調', { generation, error: err })
      onEndRef.current?.()
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    startKeepalive()
  }

  const playFromOffset = (offset: number) => {
    const safeOffset = Math.max(0, Math.min(offset, currentTextRef.current.length))
    const remaining = currentTextRef.current.slice(safeOffset)
    if (!remaining.trim()) {
      console.log('[TTS] playFromOffset: 沒有可朗讀的剩餘文字，視為自然結束', { offset: safeOffset, totalChars: currentTextRef.current.length })
      finishPlayback()
      return
    }
    const [chunk] = splitTextByLength(remaining)
    textOffsetRef.current = safeOffset
    charIndexRef.current = 0
    createAndPlay(chunk)
  }

  const stop = () => {
    if (DEBUG_TTS_PROGRESS) console.log('[TTS] stop() 被呼叫', { generation: generationRef.current })
    generationRef.current++ // 令所有舊 callback 失效
    stopKeepalive()
    window.speechSynthesis.cancel()
    utteranceRef.current = null
    playingRef.current = false
    setPlaying(false)
    pausedRef.current = false
    setPaused(false)
  }

  const reset = () => {
    if (DEBUG_TTS_PROGRESS) console.log('[TTS] reset() 被呼叫', { generation: generationRef.current })
    stop()
    currentTextRef.current = ''
    textOffsetRef.current = 0
    charIndexRef.current = 0
    onEndRef.current = undefined
    onBoundaryRef.current = undefined
  }

  const pause = () => {
    if (!playingRef.current) return
    const absolutePos = Math.max(0, Math.min(textOffsetRef.current + charIndexRef.current, currentTextRef.current.length))
    if (DEBUG_TTS_PROGRESS) {
      console.log('[TTS] pause() 被呼叫', {
        generation: generationRef.current,
        offset: textOffsetRef.current,
        charIndex: charIndexRef.current,
        absolutePos,
      })
    }
    generationRef.current++ // 使用者暫停後，舊 utterance 的 onend/onerror/recovery 不可再恢復播放
    stopKeepalive()
    window.speechSynthesis.cancel()
    utteranceRef.current = null
    textOffsetRef.current = absolutePos
    charIndexRef.current = 0
    playingRef.current = false
    pausedRef.current = true
    setPlaying(false)
    setPaused(true)
  }

  const resume = () => {
    if (!pausedRef.current || !currentTextRef.current) return
    if (DEBUG_TTS_PROGRESS) {
      console.log('[TTS] resume() 被呼叫', {
        generation: generationRef.current,
        paused: window.speechSynthesis.paused,
        speaking: window.speechSynthesis.speaking,
        offset: textOffsetRef.current,
        charIndex: charIndexRef.current,
      })
    }

    playingRef.current = true
    pausedRef.current = false
    setPlaying(true)
    setPaused(false)

    const absolutePos = textOffsetRef.current + charIndexRef.current
    const remaining = currentTextRef.current.slice(absolutePos)
    if (!remaining.trim()) {
      finishPlayback()
      return
    }

    textOffsetRef.current = absolutePos
    charIndexRef.current = 0
    playFromOffset(absolutePos)
  }

  // 將文本分割為適合 utterance 的區塊（某些行動浏覽器對文字長度有限制）
  const splitTextByLength = (text: string): string[] => {
    if (text.length <= MAX_UTTERANCE_LENGTH) return [text]

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
      let chunk = remaining.slice(0, MAX_UTTERANCE_LENGTH)
      // 嘗試在標點符號處斷開（避免中途截斷詞語）
      const lastPunctIdx = Math.max(
        chunk.lastIndexOf('。'),
        chunk.lastIndexOf('，'),
        chunk.lastIndexOf('！'),
        chunk.lastIndexOf('？'),
        chunk.lastIndexOf('；'),
        chunk.lastIndexOf('\n')
      )

      if (lastPunctIdx > MAX_UTTERANCE_LENGTH * 0.7) {
        chunk = chunk.slice(0, lastPunctIdx + 1)
      }

      chunks.push(chunk)
      remaining = remaining.slice(chunk.length)
    }

    return chunks.length > 0 ? chunks : [text]
  }

  // onBoundary：每個 word boundary 時回呼，參數為在本次 speak() 文字中的絕對位置
  const speak = (
    text: string,
    onEnd?: () => void,
    onBoundary?: (charIdx: number, source: TTSProgressSource) => void,
  ) => {
    if (!text.trim()) return
    if (DEBUG_TTS_PROGRESS) {
      console.log('[TTS] speak() 入口（新章節/重設）', {
        prevGeneration: generationRef.current,
        prevOffset: textOffsetRef.current,
        newTextLength: text.length,
        wasPlaying: playingRef.current,
        consecutiveTruncationReset: consecutiveTruncationRef.current,
      })
    }
    consecutiveTruncationRef.current = 0
    currentTextRef.current = text
    textOffsetRef.current = 0
    charIndexRef.current = 0
    onEndRef.current = onEnd
    onBoundaryRef.current = onBoundary
    playingRef.current = true
    pausedRef.current = false
    setPlaying(true)
    setPaused(false)

    const chunks = splitTextByLength(text)
    if (chunks.length > 1 && DEBUG_TTS_PROGRESS) {
      console.log('[TTS] 文本過長，已分割為', chunks.length, '個區塊', { totalLength: text.length, maxLength: MAX_UTTERANCE_LENGTH })
    }
    playFromOffset(0)
  }

  // 語速變更：若正在朗讀，從當前位置重啟（不觸發 onEnd、不重置 onBoundary）
  const handleSetRate = (newRate: number) => {
    setRate(newRate)
    rateRef.current = newRate

    if (!playingRef.current || !currentTextRef.current) return

    const absolutePos = textOffsetRef.current + charIndexRef.current
    const remaining = currentTextRef.current.slice(absolutePos)
    if (!remaining.trim()) return

    textOffsetRef.current = absolutePos
    charIndexRef.current = 0
    // playing 狀態維持 true，直接重建 utterance
    playFromOffset(absolutePos)
  }

  const getProgress = () => textOffsetRef.current + charIndexRef.current

  return { playing, paused, speak, pause, resume, stop, reset, getProgress, voices, selectedVoice, setSelectedVoice, rate, setRate: handleSetRate }
}

export default useTTS
