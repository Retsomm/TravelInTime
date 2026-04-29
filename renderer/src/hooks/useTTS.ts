import { useState, useRef, useEffect } from 'react'

const ALLOWED = /Meijia|Tingting|美佳|婷婷/i

const pickBest = (voices: SpeechSynthesisVoice[]) =>
  voices.find((v) => /Meijia|美佳/i.test(v.name)) ?? voices[0] ?? null

// iOS 上 speechSynthesis 約每 15 秒會被系統靜默，需定期 pause/resume 保活
const IOS_KEEPALIVE_INTERVAL = 10000

// 手機版朗讀文本長度上限（某些行動浏覽器限制 utterance 文字長度）
const MAX_UTTERANCE_LENGTH = 3000

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
  const onEndRef = useRef<(() => void) | undefined>(undefined)
  const onBoundaryRef = useRef<((charIdx: number) => void) | undefined>(undefined)

  // iOS keepalive timer ref
  const keepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { rateRef.current = rate }, [rate])
  useEffect(() => { selectedVoiceRef.current = selectedVoice }, [selectedVoice])

  // iOS keepalive：定期 pause + resume 防止系統在 15 秒後靜默語音
  const startKeepalive = () => {
    if (keepaliveTimerRef.current !== null) return
    keepaliveTimerRef.current = setInterval(() => {
      if (!playingRef.current) return
      console.log('[TTS] keepalive ping', { speaking: window.speechSynthesis.speaking, paused: window.speechSynthesis.paused })
      window.speechSynthesis.pause()
      window.speechSynthesis.resume()
    }, IOS_KEEPALIVE_INTERVAL)
  }

  const stopKeepalive = () => {
    if (keepaliveTimerRef.current !== null) {
      clearInterval(keepaliveTimerRef.current)
      keepaliveTimerRef.current = null
    }
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

  // iOS visibilitychange：頁面回到前台時，若正在播放則呼叫 resume() 恢復被系統暫停的語音
  // 手機版強化：隱藏時記錄狀態，復出時嘗試恢復
  const handleVisibilityChange = () => {
    const isHidden = document.visibilityState === 'hidden'
    if (isHidden) {
      console.log('[TTS] 頁面進入背景', { playing: playingRef.current })
      // 可選：在背景時暫停以節省資源
      if (playingRef.current && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause()
      }
    } else {
      console.log('[TTS] 頁面回到前台', { playing: playingRef.current })
      if (playingRef.current) {
        // 嘗試恢復朗讀
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume()
        }
        // 重新啟動 keepalive（防止後台暫停期間的系統靜默）
        startKeepalive()
      }
    }
  }

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [handleVisibilityChange])

  // 建立並播放 utterance（內部用，使用當前 refs 值）
  const createAndPlay = (text: string) => {
    const generation = ++generationRef.current
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
      pausedRef.current = false
      setPaused(false)
      console.log('[TTS] onstart', { generation, textLength: text.length, offset: textOffsetRef.current })
    }
    utterance.onpause = () => {
      if (generationRef.current !== generation) return
      console.warn('[TTS] onpause（系統暫停）', { generation, charIndex: charIndexRef.current })
    }
    utterance.onresume = () => {
      if (generationRef.current !== generation) return
      console.log('[TTS] onresume', { generation })
    }
    utterance.onboundary = (e) => {
      if (generationRef.current !== generation) return
      charIndexRef.current = e.charIndex
      // 通知外部目前在完整文字中的絕對位置
      onBoundaryRef.current?.(textOffsetRef.current + e.charIndex)
    }
    utterance.onend = () => {
      if (generationRef.current !== generation) return
      const readChars = textOffsetRef.current + charIndexRef.current
      const totalChars = currentTextRef.current.length
      const isTruncated = readChars < totalChars - 10  // 若距終點超過10字，視為提前截斷
      console.log(
        isTruncated ? '[TTS] onend ⚠️ 疑似 iOS 截斷' : '[TTS] onend（正常結束）',
        { generation, charIndex: charIndexRef.current, offset: textOffsetRef.current, readChars, totalChars, remaining: totalChars - readChars }
      )
      stopKeepalive()
      playingRef.current = false
      setPlaying(false)
      pausedRef.current = false
      setPaused(false)
      onEndRef.current?.()
    }
    utterance.onerror = (e) => {
      const err = (e as SpeechSynthesisErrorEvent).error
      console.error('[TTS] onerror', { generation, error: err, charIndex: charIndexRef.current, offset: textOffsetRef.current, isStaleGen: generationRef.current !== generation })
      if (generationRef.current !== generation) return

      // iOS 上 'interrupted' 錯誤代表被系統強制中斷，嘗試從斷點自動繼續
      if (err === 'interrupted' && playingRef.current) {
        const absolutePos = textOffsetRef.current + charIndexRef.current
        const remaining = currentTextRef.current.slice(absolutePos)
        if (remaining.trim()) {
          console.log('[TTS] interrupted → 從位置重試', { absolutePos })
          textOffsetRef.current = absolutePos
          charIndexRef.current = 0
          // 立即遞增 generation，防止同一 utterance 的 onend 在 300ms 等待期間通過
          // generation 檢查並呼叫 onEndRef，否則會觸發下一章、再被 recovery 覆蓋造成重複朗讀
          const recoveryGen = ++generationRef.current
          setTimeout(() => {
            if (playingRef.current && generationRef.current === recoveryGen) createAndPlay(remaining)
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
      console.log('[TTS] onerror: 調用 onEnd 回調', { generation, error: err })
      onEndRef.current?.()
    }

    utteranceRef.current = utterance
    console.log('[TTS] speak()', { generation, textLength: text.length, offset: textOffsetRef.current, voice: voice?.name })
    window.speechSynthesis.speak(utterance)
    startKeepalive()
  }

  const stop = () => {
    console.log('[TTS] stop() 被呼叫', { generation: generationRef.current })
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
    console.log('[TTS] reset() 被呼叫', { generation: generationRef.current })
    stop()
    currentTextRef.current = ''
    textOffsetRef.current = 0
    charIndexRef.current = 0
    onEndRef.current = undefined
    onBoundaryRef.current = undefined
  }

  const pause = () => {
    if (!playingRef.current) return
    console.log('[TTS] pause() 被呼叫', { generation: generationRef.current, offset: textOffsetRef.current, charIndex: charIndexRef.current })
    stopKeepalive()
    window.speechSynthesis.pause()
    playingRef.current = false
    pausedRef.current = true
    setPlaying(false)
    setPaused(true)
  }

  const resume = () => {
    if (!pausedRef.current || !currentTextRef.current) return
    console.log('[TTS] resume() 被呼叫', {
      generation: generationRef.current,
      paused: window.speechSynthesis.paused,
      speaking: window.speechSynthesis.speaking,
      offset: textOffsetRef.current,
      charIndex: charIndexRef.current,
    })

    playingRef.current = true
    pausedRef.current = false
    setPlaying(true)
    setPaused(false)

    if (window.speechSynthesis.paused && window.speechSynthesis.speaking) {
      window.speechSynthesis.resume()
      startKeepalive()
      return
    }

    const absolutePos = textOffsetRef.current + charIndexRef.current
    const remaining = currentTextRef.current.slice(absolutePos)
    if (!remaining.trim()) {
      stop()
      return
    }

    textOffsetRef.current = absolutePos
    charIndexRef.current = 0
    createAndPlay(remaining)
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
    onBoundary?: (charIdx: number) => void,
  ) => {
    if (!text.trim()) return
    currentTextRef.current = text
    textOffsetRef.current = 0
    charIndexRef.current = 0
    onEndRef.current = onEnd
    onBoundaryRef.current = onBoundary
    playingRef.current = true
    pausedRef.current = false
    setPlaying(true)
    setPaused(false)

    // 檢查文本長度，必要時分割
    const chunks = splitTextByLength(text)
    if (chunks.length > 1) {
      console.log('[TTS] 文本過長，已分割為', chunks.length, '個區塊', { totalLength: text.length, maxLength: MAX_UTTERANCE_LENGTH })
      // 只播放第一個區塊，onEnd 時處理下一個區塊
      createAndPlay(chunks[0])
    } else {
      createAndPlay(text)
    }
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
    createAndPlay(remaining)
  }

  const getProgress = () => textOffsetRef.current + charIndexRef.current

  return { playing, paused, speak, pause, resume, stop, reset, getProgress, voices, selectedVoice, setSelectedVoice, rate, setRate: handleSetRate }
}

export default useTTS
