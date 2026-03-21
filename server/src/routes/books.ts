import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'

const router = Router()

router.get('/', (_req, res) => {
  const books = getDb().prepare('SELECT * FROM books ORDER BY created_at DESC').all()
  res.json(books)
})

router.post('/', (req, res) => {
  const { title, author, path, cover } = req.body
  const id = uuidv4()
  getDb()
    .prepare('INSERT INTO books (id, title, author, path, cover) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, author ?? null, path, cover ?? null)
  res.json({ id, title, author, path, cover })
})

router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM books WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
