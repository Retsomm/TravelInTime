import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { setupDatabase } from './db/database'
import booksRouter from './routes/books'
import notesRouter from './routes/notes'
import ttsRouter from './routes/tts'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: ['http://localhost:5173', 'app://.'] }))
app.use(express.json())

setupDatabase()

app.use('/api/books', booksRouter)
app.use('/api/notes', notesRouter)
app.use('/api/tts', ttsRouter)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
