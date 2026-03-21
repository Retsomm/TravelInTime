import { Router } from 'express'
import OpenAI, { APIError } from 'openai'

const router = Router()

router.post('/', async (req, res) => {
  const { text, voice = 'alloy', speed = 1.0 } = req.body

  if (!text) {
    res.status(400).json({ error: '缺少 text 參數' })
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: '未設定 OPENAI_API_KEY' })
    return
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      speed,
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    res.set('Content-Type', 'audio/mpeg')
    res.send(buffer)
  } catch (err: unknown) {
    if (err instanceof APIError) {
      console.error('[TTS] OpenAI 錯誤:', err.status, err.message)
      res.status(err.status ?? 500).json({ error: err.message })
    } else {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[TTS] 錯誤:', msg)
      res.status(500).json({ error: msg })
    }
  }
})

export default router
