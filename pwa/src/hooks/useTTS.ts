import { useState, useRef, useCallback, useEffect } from 'react'

const ALLOWED = /Meijia|Tingting|美佳|婷婷/i

const pickBest = (voices: SpeechSynthesisVoice[]) =>
  voices.find((v) => /Meijia|美佳/i.test(v.name)) ?? voices[0] ?? null

// iOS 上 speechSynthesis 約每 15 秒會被系統靜默，需定期 pause/resume 保活
const IOS_KEEPALIVE_INTERVAL = 10000

const useTTS = () => {
  const [playing, setPlaying] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [rate, setRate] = useState(1.0)

  // 穩定 refs，供 callback 內存取最新值
  const rateRef = useRef(1.0)
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const playingRef = useRef(false)
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
  const startKeepalive = useCallback(() => {
    if (keepaliveTimerRef.current !== null) return
    keepaliveTimerRef.current = setInterval(() => {
      if (!playingRef.current) return
      window.speechSynthesis.pause()
      window.speechSynthesis.resume()
    }, IOS_KEEPALIVE_INTERVAL)
  }, [])

  const stopKeepalive = useCallback(() => {
    if (keepaliveTimerRef.current !== null) {
      clearInterval(keepaliveTimerRef.current)
      keepaliveTimerRef.current = null
    }
  }, [])

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
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!playingRef.current) return
      if (document.visibilityState === 'visible') {
        window.speechSynthesis.resume()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // 建立並播放 utterance（內部用，使用當前 refs 值）
  const createAndPlay = useCallback((text: string) => {
    const generation = ++generationRef.current
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    const voice = selectedVoiceRef.current
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? 'zh-TW'
    utterance.rate = rateRef.current
    utterance.pitch = 1.0
    utterance.volume = 1.0

    utterance.onboundary = (e) => {
      if (generationRef.current !== generation) return
      charIndexRef.current = e.charIndex
      // 通知外部目前在完整文字中的絕對位置
      onBoundaryRef.current?.(textOffsetRef.current + e.charIndex)
    }
    utterance.onend = () => {
      if (generationRef.current !== generation) return
      stopKeepalive()
      playingRef.current = false
      setPlaying(false)
      onEndRef.current?.()
    }
    utterance.onerror = (e) => {
      if (generationRef.current !== generation) return

      // iOS 上 'interrupted' 錯誤代表被系統強制中斷，嘗試從斷點自動繼續
      if ((e as SpeechSynthesisErrorEvent).error === 'interrupted' && playingRef.current) {
        const absolutePos = textOffsetRef.current + charIndexRef.current
        const remaining = currentTextRef.current.slice(absolutePos)
        if (remaining.trim()) {
          textOffsetRef.current = absolutePos
          charIndexRef.current = 0
          // 短暫延遲後重啟，避免與系統 cancel 時序衝突
          setTimeout(() => {
            if (playingRef.current) createAndPlay(remaining)
          }, 300)
          return
        }
      }

      stopKeepalive()
      playingRef.current = false
      setPlaying(false)
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    startKeepalive()
  }, [startKeepalive, stopKeepalive])

  const stop = useCallback(() => {
    generationRef.current++ // 令所有舊 callback 失效
    stopKeepalive()
    window.speechSynthesis.cancel()
    utteranceRef.current = null
    playingRef.current = false
    setPlaying(false)
  }, [stopKeepalive])

  // onBoundary：每個 word boundary 時回呼，參數為在本次 speak() 文字中的絕對位置
  const speak = useCallback((
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
    setPlaying(true)
    createAndPlay(text)
  }, [createAndPlay])

  // 語速變更：若正在朗讀，從當前位置重啟（不觸發 onEnd、不重置 onBoundary）
  const handleSetRate = useCallback((newRate: number) => {
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
  }, [createAndPlay])

  return { playing, speak, stop, voices, selectedVoice, setSelectedVoice, rate, setRate: handleSetRate }
}

export default useTTS
